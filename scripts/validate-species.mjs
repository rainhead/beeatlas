#!/usr/bin/env node
/**
 * Validates content/species-photos.toml against the PHOTO-01..PHOTO-05 contract.
 *
 * - License field required; allowed: cc0, cc-by, cc-by-nc, cc-by-sa, cc-by-nc-sa
 * - Attribution required for non-CC0 photos
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
