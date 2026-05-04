#!/usr/bin/env node
/**
 * One-shot helper: populate content/species-photos.toml with iNat top-voted
 * research-grade photos for every species in public/data/species.json.
 *
 * Fill-only (D-01): never modifies an existing [species."<name>"] table.
 * Rate-limited to <=1 req/sec (PHOTO-07). NOT in CI — invoke manually:
 *
 *   node scripts/seed-species-photos.mjs [--limit N] [--dry-run]
 *
 * Preconditions:
 *   - public/data/species.json must exist (run: cd data && uv run python run.py)
 *   - data/beeatlas.duckdb must exist (same pipeline run)
 *
 * Behavior:
 *   - For each species in species.json, look up iNat taxon_id via DuckDB bridge
 *   - Query iNat /v1/observations: WA-preferred (place_id=46), then global top-up
 *   - Take up to 3 research-grade, license-whitelisted photos
 *   - Transform photo.url from /square.{ext} to /large.{ext} (PHOTO-04)
 *   - Merge fill-only into content/species-photos.toml (D-01: humans always win)
 *   - Sort species keys alphabetically before stringify (Pitfall 9 stable diffs)
 *   - Checkpoint write every 50 new entries (Pitfall 11 atomicity)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';
import { LICENSE_WHITELIST } from './validate-species.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DB = join(ROOT, 'data', 'beeatlas.duckdb');
const SPECIES_JSON = join(ROOT, 'public', 'data', 'species.json');
const MANIFEST = join(ROOT, 'content', 'species-photos.toml');
const INAT_BASE = 'https://api.inaturalist.org/v1/observations';
const USER_AGENT = 'BeeAtlas/seed-species-photos (rainhead@gmail.com; github.com/rainhead/beeatlas)';
const WA_PLACE_ID = 46;

// ---------- Pure helpers (named exports for Vitest in-process testing) ----------

/**
 * Transform iNat photo URL from /square.{ext} variant to /large.{ext} (PHOTO-04).
 * Only the trailing /square.{ext} is replaced; defensive against URLs that already
 * point at /large/ or any other variant.
 */
export function photoUrlToLarge(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/\/square(\.\w+)$/, '/large$1');
}

/**
 * Walk an iNat observation list, take up to maxCount photos that pass the
 * per-photo license whitelist (Pitfall 1: photo.license_code, NOT obs.license_code),
 * and return entries shaped for content/species-photos.toml.
 */
export function extractPhotos(observations, maxCount = 3, startOrdering = 1) {
  const photos = [];
  let ordering = startOrdering;
  for (const obs of observations ?? []) {
    for (const photo of (obs?.photos ?? [])) {
      if (photos.length >= maxCount) return photos;
      const license = photo?.license_code; // PHOTO-02 + Pitfall 1: per-photo license
      if (!license || !LICENSE_WHITELIST.has(license)) continue;
      photos.push({
        observation_id: obs.id,
        photo_id: photo.id,
        url: photoUrlToLarge(photo.url),
        caption: '',
        attribution: photo.attribution ?? '',
        license,
        ordering: ordering++,
      });
    }
    if (photos.length >= maxCount) return photos;
  }
  return photos;
}

/**
 * D-01 fill-only merge: insert entry only when scientificName is absent.
 * Returns a new manifest object; never mutates input.
 */
export function mergeFillOnly(manifest, scientificName, entry) {
  if (manifest?.species?.[scientificName]) {
    return manifest;
  }
  return {
    ...manifest,
    species: {
      ...(manifest?.species ?? {}),
      [scientificName]: entry,
    },
  };
}

/**
 * Sort species keys alphabetically (Pitfall 9: stable diffs across re-runs).
 */
export function sortManifestSpecies(manifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest?.species ?? {}).sort(([a], [b]) => a.localeCompare(b))
  );
  return { ...manifest, species: sorted };
}

/**
 * Sleep-based rate limiter. PHOTO-07: enforce >= minIntervalMs between calls.
 * First wait() resolves immediately; subsequent waits sleep just long enough
 * to hold the rolling cap.
 */
export class RateLimiter {
  constructor(minIntervalMs = 1000) {
    this.minIntervalMs = minIntervalMs;
    this.lastCall = 0;
  }
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    const sleep = Math.max(0, this.minIntervalMs - elapsed);
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    this.lastCall = Date.now();
  }
}

/**
 * Shell out to the duckdb CLI to load the scientificName -> taxon_id map
 * from the canonical lineage bridge.
 *
 * Mirrors the species_universe construction in data/species_export.py: the
 * scientificName key in species.json is COALESCE(checklist.scientificName,
 * occurrences.canonical_name) and the canonical_name (lowercase) is the
 * shared join key against inaturalist_data.canonical_to_taxon_id. Joining
 * on canonical_name (not scientificName) avoids both the case-mismatch and
 * the snake_case column-name issue on ecdysis_data.occurrences (which has
 * scientific_name, not scientificName).
 */
export function loadTaxonIds(dbPath) {
  const sql = `
    WITH species_universe AS (
      SELECT
        COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
        COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name
      FROM checklist_data.species c
      FULL OUTER JOIN (
        SELECT DISTINCT canonical_name
        FROM ecdysis_data.occurrences
        WHERE canonical_name IS NOT NULL
      ) oa ON oa.canonical_name = c.canonical_name
    )
    SELECT DISTINCT s.scientificName, b.taxon_id
    FROM species_universe s
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b
      ON LOWER(s.canonical_name) = b.canonical_name
  `.replace(/\n\s+/g, ' ').trim();
  const json = execSync(`duckdb "${dbPath}" -json "${sql}"`, { encoding: 'utf-8' });
  const rows = JSON.parse(json);
  const map = new Map();
  for (const r of rows) {
    if (r.scientificName && r.taxon_id != null) map.set(r.scientificName, r.taxon_id);
  }
  return map;
}

// ---------- IO helpers ----------

async function fetchInat(taxonId, placeId, rateLimiter) {
  await rateLimiter.wait();
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    quality_grade: 'research',
    order_by: 'votes',
    per_page: '10',
    ...(placeId ? { place_id: String(placeId) } : {}),
  });
  let resp;
  try {
    resp = await fetch(`${INAT_BASE}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  } catch (e) {
    console.warn(`! iNat fetch error for taxon_id=${taxonId} place_id=${placeId ?? 'global'}: ${e.message}`);
    return [];
  }
  if (!resp.ok) {
    console.warn(`! iNat HTTP ${resp.status} for taxon_id=${taxonId} place_id=${placeId ?? 'global'}`);
    return [];
  }
  const data = await resp.json();
  return data.results ?? []; // Pitfall 3: missing results array
}

async function fetchPhotosForTaxon(taxonId, rateLimiter) {
  // WA-preferred per D-03; top up with global if WA returns < 3 license-clean photos
  const wa = await fetchInat(taxonId, WA_PLACE_ID, rateLimiter);
  const photos = extractPhotos(wa, 3, 1);
  if (photos.length >= 3) return photos;

  const global = await fetchInat(taxonId, null, rateLimiter);
  const seen = new Set(photos.map((p) => p.photo_id));
  const topUp = extractPhotos(global, 3 - photos.length, photos.length + 1)
    .filter((p) => !seen.has(p.photo_id));
  return [...photos, ...topUp].slice(0, 3);
}

// ---------- CLI entrypoint (guarded) ----------

async function main() {
  // Pitfall 5: fail fast on missing precondition with a clear remediation message
  if (!existsSync(SPECIES_JSON)) {
    console.error(`x ${SPECIES_JSON}: not found.`);
    console.error('  Run the data pipeline first: cd data && uv run python run.py');
    process.exit(1);
  }
  if (!existsSync(DB)) {
    console.error(`x ${DB}: not found.`);
    console.error('  Run the data pipeline first: cd data && uv run python run.py');
    process.exit(1);
  }

  const argLimit = process.argv.indexOf('--limit');
  const limit = argLimit !== -1 ? parseInt(process.argv[argLimit + 1], 10) : Infinity;
  const dryRun = process.argv.includes('--dry-run');

  const speciesJson = JSON.parse(readFileSync(SPECIES_JSON, 'utf-8'));
  console.log(`Loaded ${speciesJson.length} species from species.json`);

  const taxonIds = loadTaxonIds(DB);
  console.log(`Loaded ${taxonIds.size} taxon_ids from DuckDB bridge`);

  // Pitfall 6: ensure content/ exists
  mkdirSync(dirname(MANIFEST), { recursive: true });

  let manifest = existsSync(MANIFEST)
    ? TOML.parse(readFileSync(MANIFEST, 'utf-8'))
    : { species: {} };
  manifest.species ??= {};

  const rateLimiter = new RateLimiter(1000); // PHOTO-07: <=1 req/sec
  let processed = 0;
  let added = 0;
  let skipped = 0;
  let noTaxon = 0;
  let noPhotos = 0;

  for (const { scientificName } of speciesJson) {
    if (processed >= limit) break;
    processed++;

    if (manifest.species[scientificName]) {
      // D-01 fill-only: humans always win; skip species we've already touched
      skipped++;
      continue;
    }

    const taxonId = taxonIds.get(scientificName);
    let photos = [];
    if (!taxonId) {
      noTaxon++;
    } else {
      try {
        photos = await fetchPhotosForTaxon(taxonId, rateLimiter);
      } catch (e) {
        console.warn(`! ${scientificName}: fetch failed (${e.message}) — writing empty entry`);
      }
    }
    if (photos.length === 0) noPhotos++;

    // Per CONTEXT.md Claude's discretion: write description = "" always so the
    // validator's optional-field check stays exercised and humans get a clearly
    // empty placeholder. Omit photos array entirely when empty (cleaner TOML).
    const entry = photos.length > 0
      ? { description: '', photos }
      : { description: '' };
    manifest = mergeFillOnly(manifest, scientificName, entry);
    added++;

    // T-79-11 mitigation: incremental atomic write every 50 species
    if (added % 50 === 0 && !dryRun) {
      const sorted = sortManifestSpecies(manifest);
      writeFileSync(MANIFEST, TOML.stringify(sorted), 'utf-8');
      console.log(`  ... checkpoint: ${added} new entries written, ${processed}/${speciesJson.length} processed`);
    }
  }

  manifest = sortManifestSpecies(manifest);
  if (!dryRun) {
    writeFileSync(MANIFEST, TOML.stringify(manifest), 'utf-8');
  }
  console.log(`\nDone. processed=${processed} added=${added} skipped(existing)=${skipped} no_taxon_id=${noTaxon} no_photos=${noPhotos}`);
  console.log(`Manifest: ${MANIFEST}${dryRun ? ' (DRY RUN — not written)' : ''}`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
