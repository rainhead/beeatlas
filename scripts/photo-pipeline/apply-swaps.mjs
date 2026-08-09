#!/usr/bin/env node
/**
 * Apply accepted photo swaps to content/species-photos.toml.
 *
 *   node scripts/photo-pipeline/apply-swaps.mjs ~/Downloads/accepted-swaps.json          # dry run
 *   node scripts/photo-pipeline/apply-swaps.mjs ~/Downloads/accepted-swaps.json --write
 *
 * DRY RUN BY DEFAULT. This is the only step in the pipeline that changes the site, so it
 * must be asked twice.
 *
 * A swap replaces photo_id / url / attribution / license within an EXISTING photo entry,
 * keeping observation_id, caption and ordering. The sibling comes from the same
 * observation, so observation_id must already match -- that is asserted, not assumed.
 *
 * SKIPS HUMAN-CURATED ENTRIES. seed-species-photos.mjs --reselect treats a non-empty
 * description, or any non-empty caption, as the marker that a person has touched a species
 * (ADR 0031 s4). This respects the same marker: an automated swap must not silently
 * overwrite curation, and a caption written for one photo is wrong for another.
 *
 * Renders through the seeder's own helpers so formatting and comment handling stay
 * identical to how the file is otherwise written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import TOML from '@iarna/toml';
import { MANIFEST, LICENSE_WHITELIST, isCuratorTouched } from './config.mjs';
import { extractSpeciesComments, reattachSpeciesComments, sortManifestSpecies } from '../seed-species-photos.mjs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: apply-swaps.mjs <accepted-swaps.json> [--write]'); process.exit(1); }

const { accepted } = JSON.parse(readFileSync(file, 'utf8'));
const raw = readFileSync(MANIFEST, 'utf8');
const manifest = TOML.parse(raw);

const applied = [];
const skipped = [];

for (const s of accepted) {
  const entry = manifest.species?.[s.species];
  if (!entry) { skipped.push({ ...s, why: 'species not in manifest' }); continue; }

  // Curation marker: a person has touched this species. Leave it alone.
  if (isCuratorTouched(entry)) { skipped.push({ ...s, why: 'human-curated (provenance, description or caption)' }); continue; }

  const photo = (entry.photos ?? []).find((p) => p.photo_id === s.replace_photo_id);
  if (!photo) { skipped.push({ ...s, why: `photo ${s.replace_photo_id} not found` }); continue; }

  if (photo.observation_id !== s.observation_id) {
    skipped.push({ ...s, why: `observation mismatch: manifest ${photo.observation_id} vs swap ${s.observation_id}` });
    continue;
  }
  if (!LICENSE_WHITELIST.has(s.license)) { skipped.push({ ...s, why: `license ${s.license} not whitelisted` }); continue; }
  if (s.license !== 'cc0' && !(s.attribution ?? '').trim()) { skipped.push({ ...s, why: 'missing attribution' }); continue; }

  applied.push({ species: s.species, from: photo.photo_id, to: s.with_photo_id, ordering: photo.ordering });
  photo.photo_id = s.with_photo_id;
  photo.url = s.url;
  photo.attribution = s.attribution;
  photo.license = s.license;
  // This file holds swaps a person accepted by eye, so the new frame is a human's choice.
  // Only the swapped photo is stamped: its neighbours in the entry are still seeder picks.
  photo.provenance = 'curator';
}

const comments = extractSpeciesComments(raw);
const rendered = reattachSpeciesComments(TOML.stringify(sortManifestSpecies(manifest)), comments);

console.log(`accepted swaps in file: ${accepted.length}`);
console.log(`  would apply: ${applied.length}`);
console.log(`  skipped:     ${skipped.length}`);
for (const s of skipped) console.log(`    ${s.species}: ${s.why}`);

// Sanity on the diff itself: only photo_id/url/attribution/license lines should move.
const before = raw.split('\n');
const after = rendered.split('\n');
let changedLines = 0;
const fields = new Set();
for (let i = 0; i < Math.max(before.length, after.length); i++) {
  if (before[i] !== after[i]) {
    changedLines++;
    const key = (after[i] ?? before[i] ?? '').trim().split(/\s*=/)[0];
    if (key) fields.add(key);
  }
}
console.log(`\ndiff: ${changedLines} lines differ; fields touched: ${[...fields].join(', ') || 'none'}`);
console.log(`      line count ${before.length} -> ${after.length}`);

if (!WRITE) {
  console.log('\nDRY RUN — nothing written. Re-run with --write to apply.');
  process.exit(0);
}

writeFileSync(MANIFEST, rendered, 'utf-8');
console.log(`\nwrote ${MANIFEST}`);
console.log('Now run: node scripts/validate-species.mjs');
