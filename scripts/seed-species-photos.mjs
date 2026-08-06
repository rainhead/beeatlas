#!/usr/bin/env node
/**
 * One-shot helper: populate content/species-photos.toml with iNat photos for every
 * species in public/data/species.json.
 *
 * Fill-only by default: never modifies an existing [species."<name>"] table.
 * Rate-limited to <=1 req/sec (PHOTO-07). NOT in CI — invoke manually:
 *
 *   node scripts/seed-species-photos.mjs [--limit N] [--dry-run] [--reselect]
 *
 * Preconditions:
 *   - public/data/species.json must exist (run: cd data && uv run python run.py)
 *   - data/beeatlas.duckdb must exist (same pipeline run)
 *   - public/data/occurrences.parquet for tier 1; without it tier 1 is skipped
 *
 * SELECTION CRITERIA (beeatlas-zd7). A species page wants a REFERENCE photo: a typical,
 * determinable individual from our region. Three rules get us there, each fixing a way
 * the original seeding optimized for the wrong thing.
 *
 *   1. AT MOST ONE PHOTO PER OBSERVATION. Three angles on one bee is one reference
 *      photo, not three. Previously 74% of multi-photo species drew every photo from a
 *      single observation.
 *   2. REGION TIERS, each consulted only if the ones above cannot fill the quota:
 *      expert-vetted (ours) -> Washington -> PNW (OR/ID/BC) -> global. The old path
 *      jumped WA straight to global, which is how an Illinois bee reached a WA page.
 *   3. VETTED FIRST. Tier 1 draws on bee observations an expert already identified, via
 *      our own inat_expert / waba_specimen arms.
 *
 * order_by=votes is retained as a PHOTO-QUALITY proxy. Faves do reward the unusual
 * individual, but rules 1-3 mean votes now ranks within an already-regional pool where
 * no single observation can dominate — rather than selecting the most striking bee on
 * the continent, which is what produced the Bombus fervidus failure.
 *
 * Behavior:
 *   - For each species in species.json, look up iNat taxon_id via DuckDB bridge,
 *     honouring the ADR 0030 outbound query-taxon overrides
 *   - Walk the four tiers until 3 license-whitelisted photos are found
 *   - Transform photo.url from /square.{ext} to /large.{ext} (PHOTO-04)
 *   - Merge fill-only into content/species-photos.toml (D-01: humans always win);
 *     --reselect replaces machine-seeded entries but still never curator-touched ones
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
const INAT_QUERY_TAXA_CSV = join(ROOT, 'data', 'dbt', 'seeds', 'inat_query_taxa.csv');
const INAT_BASE = 'https://api.inaturalist.org/v1/observations';
const USER_AGENT = 'BeeAtlas/seed-species-photos (rainhead@gmail.com; github.com/rainhead/beeatlas)';
const OCCURRENCES_PARQUET = join(ROOT, 'public', 'data', 'occurrences.parquet');
const WA_PLACE_ID = 46;
// Oregon, Idaho, British Columbia — the intermediate tier between Washington and the
// whole world (beeatlas-zd7). A PNW bee is a defensible stand-in for a WA one; a
// Florida bee of the same name may be a different colour form entirely.
const PNW_PLACE_IDS = [10, 22, 7085];
const PHOTOS_PER_SPECIES = 3;
// Deep enough that "one photo per observation" can still fill the quota when the
// top-voted observations are unlicensed or repeat a photographer's series.
const CANDIDATE_POOL_SIZE = 50;
const VETTED_POOL_SIZE = 60;

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
 *
 * AT MOST ONE PHOTO PER OBSERVATION (beeatlas-zd7). The original walked every photo
 * within an observation before advancing, so one observation carrying 3+ licensed
 * photos consumed the whole quota — 276 of 374 multi-photo species (74%) ended up
 * showing three frames of a single individual. Three angles on one bee is not three
 * reference photos; it is one, repeated.
 *
 * `excludeObservations` lets a later tier avoid repeating an observation an earlier
 * tier already used, since the regional tiers are nested (WA results reappear in the
 * PNW and global queries).
 */
export function extractPhotos(observations, maxCount = 3, startOrdering = 1, excludeObservations = new Set()) {
  const photos = [];
  const usedObservations = new Set(excludeObservations);
  let ordering = startOrdering;
  for (const obs of observations ?? []) {
    if (photos.length >= maxCount) break;
    if (obs?.id == null || usedObservations.has(obs.id)) continue;
    const photo = (obs.photos ?? []).find(
      (p) => p?.license_code && LICENSE_WHITELIST.has(p.license_code), // PHOTO-02 + Pitfall 1
    );
    if (!photo) continue;
    usedObservations.add(obs.id);
    photos.push({
      observation_id: obs.id,
      photo_id: photo.id,
      url: photoUrlToLarge(photo.url),
      caption: '',
      attribution: photo.attribution ?? '',
      license: photo.license_code,
      ordering: ordering++,
    });
  }
  return photos;
}

/**
 * A manifest entry is curator-touched if a human wrote prose into it: a non-empty
 * description, or a caption on any photo. --reselect overwrites everything else.
 *
 * This keeps D-01 ("humans always win") intact without a new marker field: the seeder
 * only ever writes empty strings into both, so anything non-empty came from a person.
 * At the time of the zd7 re-selection NO entry was curator-touched — the whole manifest
 * was machine-seeded — but the rule has to hold for the next run, not just this one.
 */
export function isCuratorTouched(entry) {
  if ((entry?.description ?? '').trim()) return true;
  return (entry?.photos ?? []).some((p) => (p?.caption ?? '').trim());
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
 * Harvest comment blocks that sit immediately above a [species."NAME"] header.
 *
 * @iarna/toml drops comments on parse, so they are invisible to the manifest object
 * and therefore invisible to isCuratorTouched — a full rewrite silently deletes them.
 * The manifest is exactly the kind of file people annotate ("these photos arguably
 * belong under subtilior — left as-is pending a curation call"), and losing that is
 * losing the reasoning, not just a string. So the comments are lifted off the raw text
 * before the rewrite and put back after it.
 *
 * Deliberately scoped to species-header comments: a comment floating inside a photo
 * table has no stable anchor to reattach to, and guessing would move it.
 */
export function extractSpeciesComments(raw) {
  const comments = new Map();
  const lines = String(raw ?? '').split('\n');
  let block = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#')) {
      block.push(line);
      continue;
    }
    const header = t.match(/^\[species\."(.+)"\]$/);
    if (header && block.length) comments.set(header[1], block.join('\n'));
    if (t !== '' || !block.length) block = [];
  }
  return comments;
}

/**
 * Put harvested comment blocks back above their species headers after stringify.
 * A comment whose species is gone from the manifest is reported by the caller rather
 * than dropped on the floor.
 */
export function reattachSpeciesComments(stringified, comments) {
  if (!comments?.size) return stringified;
  return String(stringified).replace(
    /^\[species\."(.+)"\]$/gm,
    (match, name) => (comments.has(name) ? `${comments.get(name)}\n${match}` : match),
  );
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
 *
 * The bridge answers "what taxon IS this species", which is not always the
 * taxon to ASK iNat about: where our synonymy merges taxa iNat keeps apart,
 * the bridge's species-rank id reaches only part of our concept. ADR 0030 puts
 * those cases in inat_query_taxa.csv, COALESCEd over the bridge here. The seed
 * is read as raw CSV, not ref()'d, because this script runs against the
 * ingestion schemas and must not require a dbt build.
 */
export function buildTaxonIdSql(queryTaxaCsv = INAT_QUERY_TAXA_CSV) {
  // An override seed is optional: a checkout without it still resolves via the bridge.
  const overrideCte = existsSync(queryTaxaCsv)
    ? `SELECT LOWER(canonical_name) AS canonical_name, taxon_id
       FROM read_csv('${queryTaxaCsv}', header=true,
                     columns={'canonical_name':'VARCHAR','taxon_id':'BIGINT','note':'VARCHAR'})`
    : `SELECT NULL::VARCHAR AS canonical_name, NULL::BIGINT AS taxon_id WHERE FALSE`;
  return `
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
    ), query_override AS (${overrideCte})
    SELECT DISTINCT s.scientificName, COALESCE(q.taxon_id, b.taxon_id) AS taxon_id
    FROM species_universe s
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b
      ON LOWER(s.canonical_name) = b.canonical_name
    LEFT JOIN query_override q
      ON LOWER(s.canonical_name) = q.canonical_name
  `.replace(/\n\s+/g, ' ').trim();
}

export function loadTaxonIds(dbPath, queryTaxaCsv = INAT_QUERY_TAXA_CSV) {
  const sql = buildTaxonIdSql(queryTaxaCsv);
  const json = execSync(`duckdb "${dbPath}" -json "${sql}"`, { encoding: 'utf-8' });
  const rows = JSON.parse(json);
  const map = new Map();
  for (const r of rows) {
    if (r.scientificName && r.taxon_id != null) map.set(normalizeName(r.scientificName), r.taxon_id);
  }
  return map;
}

/**
 * Case/whitespace-normalized species key (beeatlas-zd7).
 *
 * species_universe keys on COALESCE(checklist.scientificName, occurrences.canonical_name),
 * so a species present in the checklist gets a properly-cased 'Bombus fervidus' while an
 * occurrence-only species falls back to the LOWERCASE canonical_name. species.json comes
 * from the dbt marts and is properly cased throughout, so an exact-string lookup silently
 * missed 104 of 630 species — among them Apis mellifera, Bombus impatiens, Megachile
 * rotundata, and Bombus fervidus itself, which is why the ADR 0030 override alone would
 * not have fixed the fervidus photos. Those species were counted as `no_taxon_id` and
 * written as empty entries, which reads identically to "iNat has no licensed photo".
 */
export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase();
}

// ---------- IO helpers ----------

async function fetchInatPage(params, rateLimiter, label) {
  await rateLimiter.wait();
  let resp;
  try {
    resp = await fetch(`${INAT_BASE}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  } catch (e) {
    console.warn(`! iNat fetch error (${label}): ${e.message}`);
    return [];
  }
  if (!resp.ok) {
    console.warn(`! iNat HTTP ${resp.status} (${label})`);
    return [];
  }
  const data = await resp.json();
  return data.results ?? []; // Pitfall 3: missing results array
}

/**
 * Tier 1: photos from observations WE have already vetted — the bee observations an
 * expert identified, carried by our own inat_expert / waba_specimen arms. Fetched by
 * id, then ranked by faves locally.
 *
 * Ranking inside this pool is safe in a way that ranking the open pool is not: every
 * candidate is already a Washington bee an expert put a name on, so faves is selecting
 * for photography among determinable individuals rather than for the odd bee.
 *
 * NOTE: no quality_grade filter here, unlike tiers 2-4. An expert determination from our
 * own arms is a stronger claim than iNat's research grade (two agreeing community IDs),
 * so a `needs_id` observation in this pool is still a determined bee — filtering it out
 * would discard the very records this tier exists to reach.
 */
async function fetchVettedPhotos(observationIds, rateLimiter) {
  if (!observationIds?.length) return [];
  const ids = observationIds.slice(0, VETTED_POOL_SIZE);
  const params = new URLSearchParams({
    id: ids.join(','),
    per_page: String(ids.length),
  });
  const results = await fetchInatPage(params, rateLimiter, `vetted id=${ids.length} obs`);
  results.sort((a, b) => (b?.faves_count ?? 0) - (a?.faves_count ?? 0));
  return extractPhotos(results, PHOTOS_PER_SPECIES, 1);
}

async function fetchTaxonPhotos(taxonId, placeIds, rateLimiter, startOrdering, exclude) {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    quality_grade: 'research',
    order_by: 'votes',
    per_page: String(CANDIDATE_POOL_SIZE),
    ...(placeIds ? { place_id: placeIds.join(',') } : {}),
  });
  const label = `taxon_id=${taxonId} place=${placeIds ? placeIds.join(',') : 'global'}`;
  const results = await fetchInatPage(params, rateLimiter, label);
  return extractPhotos(results, PHOTOS_PER_SPECIES - startOrdering + 1, startOrdering, exclude);
}

/**
 * Region-tiered selection (beeatlas-zd7). The old path was WA, then straight to
 * GLOBAL — no intermediate tier and no floor on how far afield it would reach, which
 * is how a Washington species page ended up showing an Illinois bee. Each tier is
 * only consulted if the ones above it could not fill the quota.
 *
 *   1. our own expert-vetted WA observations
 *   2. iNat, Washington
 *   3. iNat, PNW (OR / ID / BC)
 *   4. iNat, global
 *
 * Tiers are nested, so each one excludes the observations already used above it.
 */
export async function fetchPhotosForTaxon(taxonId, vettedIds, rateLimiter) {
  const photos = await fetchVettedPhotos(vettedIds, rateLimiter);
  if (photos.length >= PHOTOS_PER_SPECIES) return photos;

  for (const placeIds of [[WA_PLACE_ID], PNW_PLACE_IDS, null]) {
    const used = new Set(photos.map((p) => p.observation_id));
    const more = await fetchTaxonPhotos(taxonId, placeIds, rateLimiter, photos.length + 1, used);
    photos.push(...more);
    if (photos.length >= PHOTOS_PER_SPECIES) break;
  }
  return photos.slice(0, PHOTOS_PER_SPECIES);
}

/**
 * species key -> iNat observation ids we have already vetted, for tier 1.
 *
 * specimen_observation_id, NOT observation_id. On a `specimen` row observation_id is
 * the SAMPLE observation — the flower the bee was collected from — so seeding from it
 * would put plant photographs on species pages. The bee is on specimen_observation_id,
 * which the inat_expert and waba_specimen arms carry (docs/domain-model.md arms 3-4).
 */
export function loadVettedObservations(occurrencesParquet) {
  if (!existsSync(occurrencesParquet)) {
    console.warn(`! ${occurrencesParquet} not found — tier 1 (expert-vetted photos) disabled`);
    return new Map();
  }
  const sql = `
    SELECT canonical_name, list(DISTINCT specimen_observation_id) AS ids
    FROM read_parquet('${occurrencesParquet}')
    WHERE record_type IN ('inat_expert', 'waba_specimen')
      AND specimen_observation_id IS NOT NULL
      AND canonical_name IS NOT NULL
    GROUP BY canonical_name
  `.replace(/\n\s+/g, ' ').trim();
  // -c, with no database path: this reads a parquet file, so an in-memory duckdb is enough.
  const rows = JSON.parse(execSync(`duckdb -json -c "${sql}"`, { encoding: 'utf-8', maxBuffer: 1 << 28 }));
  const map = new Map();
  for (const r of rows) map.set(normalizeName(r.canonical_name), r.ids ?? []);
  return map;
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
  const argRate = process.argv.indexOf('--rate-ms');
  const rateMs = argRate !== -1 ? parseInt(process.argv[argRate + 1], 10) : 1000;
  const dryRun = process.argv.includes('--dry-run');
  // beeatlas-zd7: mergeFillOnly never overwrites, so re-selecting under corrected
  // criteria needs an explicit opt-in. Curator-touched entries are still never
  // overwritten (D-01 holds) — see isCuratorTouched.
  const reselect = process.argv.includes('--reselect');

  const speciesJson = JSON.parse(readFileSync(SPECIES_JSON, 'utf-8'));
  console.log(`Loaded ${speciesJson.length} species from species.json`);

  const taxonIds = loadTaxonIds(DB);
  console.log(`Loaded ${taxonIds.size} taxon_ids from DuckDB bridge`);

  const vetted = loadVettedObservations(OCCURRENCES_PARQUET);
  console.log(`Loaded expert-vetted observations for ${vetted.size} species (tier 1)`);
  if (reselect) console.log('RESELECT: existing machine-seeded entries will be replaced');

  // Pitfall 6: ensure content/ exists
  mkdirSync(dirname(MANIFEST), { recursive: true });

  const rawManifest = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf-8') : '';
  let manifest = rawManifest ? TOML.parse(rawManifest) : { species: {} };
  manifest.species ??= {};

  // Lifted off the raw text because parse discards them; put back on every write.
  const comments = extractSpeciesComments(rawManifest);
  if (comments.size) console.log(`Preserving ${comments.size} curator comment block(s)`);
  const render = (m) => reattachSpeciesComments(TOML.stringify(sortManifestSpecies(m)), comments);

  // PHOTO-07: <=1 req/sec by default. Override via --rate-ms <int> when iNat
  // tightens enforcement (live API has emitted bursts of 429s at the 1000 ms
  // floor — bumping to 1500–2000 ms typically clears the rate gate).
  console.log(`Rate limit: >=${rateMs} ms between iNat calls`);
  const rateLimiter = new RateLimiter(rateMs);
  let processed = 0;
  let added = 0;
  let skipped = 0;
  let noTaxon = 0;
  let noPhotos = 0;

  for (const { scientificName } of speciesJson) {
    if (processed >= limit) break;
    processed++;

    const existing = manifest.species[scientificName];
    if (existing && (!reselect || isCuratorTouched(existing))) {
      // D-01 fill-only: humans always win; skip species we've already touched
      skipped++;
      continue;
    }

    const key = normalizeName(scientificName);
    const taxonId = taxonIds.get(key);
    let photos = [];
    if (!taxonId) {
      noTaxon++;
    } else {
      try {
        photos = await fetchPhotosForTaxon(taxonId, vetted.get(key), rateLimiter);
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
    manifest = reselect
      ? { ...manifest, species: { ...manifest.species, [scientificName]: entry } }
      : mergeFillOnly(manifest, scientificName, entry);
    manifest.species ??= {};
    added++;

    // T-79-11 mitigation: incremental atomic write every 50 species
    if (added % 50 === 0 && !dryRun) {
      writeFileSync(MANIFEST, render(manifest), 'utf-8');
      console.log(`  ... checkpoint: ${added} new entries written, ${processed}/${speciesJson.length} processed`);
    }
  }

  manifest = sortManifestSpecies(manifest);
  const orphanComments = [...comments.keys()].filter((k) => !manifest.species[k]);
  if (orphanComments.length) {
    console.warn(`! comment(s) for species no longer in the manifest: ${orphanComments.join(', ')}`);
  }
  if (!dryRun) {
    writeFileSync(MANIFEST, render(manifest), 'utf-8');
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
