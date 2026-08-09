#!/usr/bin/env node
/**
 * Validates content/species-photos.toml against the PHOTO-01..PHOTO-05 contract.
 *
 * - License field required; allowed: cc0, cc-by, cc-by-nc, cc-by-sa, cc-by-nc-sa
 * - Attribution required for non-CC0 photos
 * - Provenance required; allowed: seeder, pipeline, curator (see PHOTO_PROVENANCE)
 * - Unknown scientificName (not in species.json) is a warning, not an error
 * - When species.json is absent, cross-reference check is skipped (mirrors
 *   validate-schema.mjs's CloudFront-fallback graceful-degradation pattern).
 *
 * Exits 1 on any error; exits 0 on warnings-only or fully clean.
 *
 * Exported `validateSpeciesPhotos` so Vitest can import in-process without
 * triggering CLI side effects (process.exit). The CLI block at the bottom
 * runs only when this file is invoked directly via `node scripts/validate-species.mjs`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';
import { buildDataDir } from '../lib/build-data-dir.js';

export const LICENSE_WHITELIST = new Set([
  'cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa',
]);

/**
 * How this photo came to be in the manifest. REQUIRED on every photo.
 *
 * The point is `curator`: it is the durable marker that makes a human's choice survive a
 * later automated run. Before it, protection keyed on a non-empty description or caption
 * (isCuratorTouched), and NOTHING in the manifest had either — all 630 entries read as
 * machine-owned, including the 176 photos two review passes had accepted by hand. A
 * `--reselect` would have discarded every one of them and looked like it worked.
 *
 *   seeder    scripts/seed-species-photos.mjs picked it: first license-clean photo of a
 *             vetted observation, ranked by faves/votes. Freely replaceable.
 *   pipeline  scripts/photo-pipeline/ picked it by part-coverage scoring, unreviewed.
 *             Better than seeder, still machine-owned.
 *   curator   a person accepted THIS photo. Never replace without an explicit override.
 *
 * Absent is an ERROR, not a default. A missing value would have to be read as "unknown",
 * and the safe reading of unknown is "curator" — which would freeze the manifest — while
 * the convenient one is "seeder", which silently discards curation. Requiring it means a
 * writer that forgets fails the gate instead of quietly producing an unprotected photo.
 */
export const PHOTO_PROVENANCE = new Set(['seeder', 'pipeline', 'curator']);

/**
 * Does this entry contain work a human owns? If so, no automated pass may replace it —
 * D-01, "humans always win". Consulted by seed-species-photos.mjs --reselect and by both
 * photo-pipeline apply scripts, which each carried their own copy of the rule.
 *
 * The prose signals came first, on the reasoning that the seeder only ever writes empty
 * strings, so anything non-empty came from a person. True, but it inferred curation from a
 * SIDE EFFECT of curating rather than from the act itself — and the two review passes of
 * 2026-08-08 accepted 176 photos by hand while writing no prose at all. Every one of those
 * entries read as machine-owned. provenance says it directly; the prose checks stay,
 * because a caption is still a human's work worth protecting.
 */
export function isCuratorTouched(entry) {
  if ((entry?.description ?? '').trim()) return true;
  return (entry?.photos ?? []).some(
    (p) => p?.provenance === 'curator' || (p?.caption ?? '').trim(),
  );
}

/**
 * @param {string} tomlSource - raw TOML text
 * @param {Array<{scientificName: string}>|null} speciesJsonArray
 *   - pass null when species.json is unavailable to skip cross-ref checks
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateSpeciesPhotos(tomlSource, speciesJsonArray) {
  const errors = [];
  const warnings = [];

  let manifest;
  try {
    manifest = TOML.parse(tomlSource);
  } catch (e) {
    errors.push(`TOML parse failed: ${e.message}`);
    return { errors, warnings };
  }

  const species = manifest.species ?? {};
  const knownNames = speciesJsonArray
    ? new Set(speciesJsonArray.map((s) => s.scientificName))
    : null;

  for (const [name, entry] of Object.entries(species)) {
    if (knownNames !== null && !knownNames.has(name)) {
      warnings.push(`unknown species: "${name}" not in species.json`);
    }

    const photos = entry.photos ?? [];
    for (const photo of photos) {
      const photoLabel = `species "${name}" photo ${photo.photo_id ?? '(unknown id)'}`;
      const license = photo.license;
      if (!license || !LICENSE_WHITELIST.has(license)) {
        errors.push(`${photoLabel}: invalid license ${JSON.stringify(license ?? null)} (allowed: ${[...LICENSE_WHITELIST].join(', ')})`);
        continue;
      }
      if (license !== 'cc0' && (!photo.attribution || photo.attribution === '')) {
        errors.push(`${photoLabel}: missing attribution (required for license "${license}")`);
      }
      // Required, and the VALUE is checked: a typo ("curater") would otherwise read as
      // not-curator-owned, which is exactly the silent-discard this field exists to stop.
      if (!photo.provenance || !PHOTO_PROVENANCE.has(photo.provenance)) {
        errors.push(`${photoLabel}: invalid provenance ${JSON.stringify(photo.provenance ?? null)} (allowed: ${[...PHOTO_PROVENANCE].join(', ')})`);
      }
    }
  }
  return { errors, warnings };
}

// CLI guard — only run side effects when invoked directly.
const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const ROOT = new URL('..', import.meta.url).pathname;
  const MANIFEST = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'content/species-photos.toml');
  const SPECIES_JSON = join(buildDataDir(ROOT), 'species.json');

  if (!existsSync(MANIFEST)) {
    console.error(`x ${MANIFEST}: not found`);
    process.exit(1);
  }
  const tomlSource = readFileSync(MANIFEST, 'utf-8');

  let speciesJson = null;
  if (existsSync(SPECIES_JSON)) {
    try {
      speciesJson = JSON.parse(readFileSync(SPECIES_JSON, 'utf-8'));
    } catch (e) {
      console.warn(`! species.json: could not parse (${e.message}) — skipping cross-reference check`);
      speciesJson = null;
    }
  } else {
    console.warn('! species.json: not found — skipping unknown-species cross-reference check (run pipeline: cd data && uv run python run.py)');
  }

  const { errors, warnings } = validateSpeciesPhotos(tomlSource, speciesJson);

  for (const w of warnings) console.warn(`warn: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);

  if (errors.length > 0) {
    console.error(`\nValidation failed: ${errors.length} error(s).`);
    process.exit(1);
  }
  const speciesCount = Object.keys(TOML.parse(tomlSource).species ?? {}).length;
  console.log(`ok content/species-photos.toml (${speciesCount} species, ${warnings.length} warning(s))`);
}
