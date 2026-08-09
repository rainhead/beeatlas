#!/usr/bin/env node
/**
 * Apply accepted photo SETS to content/species-photos.toml.
 *
 *   node scripts/photo-pipeline/apply-sets.mjs ~/Downloads/accepted-sets.json          # dry run
 *   node scripts/photo-pipeline/apply-sets.mjs ~/Downloads/accepted-sets.json --write
 *
 * DRY RUN BY DEFAULT. This changes the site.
 *
 * DIFFERENT FROM apply-swaps.mjs, which patches photo_id/url/attribution/license INSIDE an
 * existing entry and keeps observation, caption and ordering. Coverage re-selection
 * replaces the whole set: different photos, different observations, and a different COUNT
 * (of the 58 accepted, 13 species go to 1 photo, 9 to 2, 35 to 3, 1 to 5). So each entry's
 * photos array is rebuilt and ordering renumbered 1..n.
 *
 * SKIPS HUMAN-CURATED ENTRIES, the same marker seed-species-photos.mjs --reselect respects
 * (ADR 0031 s4): a non-empty description, or any non-empty caption. An automated set
 * replacement must not silently discard curation, and captions written for the old photos
 * would be wrong for the new ones.
 *
 * Renders through the seeder's own helpers so formatting and comment handling match how the
 * file is otherwise written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import TOML from '@iarna/toml';
import { MANIFEST, LICENSE_WHITELIST, isCuratorTouched } from './config.mjs';
import { extractSpeciesComments, reattachSpeciesComments, sortManifestSpecies } from '../seed-species-photos.mjs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: apply-sets.mjs <accepted-sets.json> [--write]'); process.exit(1); }

const { accepted } = JSON.parse(readFileSync(file, 'utf8'));
const raw = readFileSync(MANIFEST, 'utf8');
const manifest = TOML.parse(raw);

const applied = [];
const skipped = [];

for (const set of accepted) {
  const entry = manifest.species?.[set.species];
  if (!entry) { skipped.push({ ...set, why: 'species not in manifest' }); continue; }

  if (isCuratorTouched(entry)) { skipped.push({ ...set, why: 'human-curated (provenance, description or caption)' }); continue; }

  if (!set.photos?.length) { skipped.push({ ...set, why: 'empty photo set' }); continue; }

  // Every photo must be usable on its own terms before any of them is written.
  const bad = set.photos.find((p) =>
    !p.photo_id || !p.observation_id || !p.url
    || !LICENSE_WHITELIST.has(p.license)
    || (p.license !== 'cc0' && !(p.attribution ?? '').trim()));
  if (bad) { skipped.push({ ...set, why: `photo ${bad.photo_id}: bad license/attribution/url` }); continue; }

  const dupes = new Set(set.photos.map((p) => p.photo_id));
  if (dupes.size !== set.photos.length) { skipped.push({ ...set, why: 'duplicate photo_id in set' }); continue; }

  const before = (entry.photos ?? []).map((p) => p.photo_id);
  entry.photos = set.photos.map((p, i) => ({
    observation_id: p.observation_id,
    photo_id: p.photo_id,
    url: p.url,
    caption: '',            // no captions exist yet; curated entries were skipped above
    attribution: p.attribution ?? '',
    license: p.license,
    ordering: i + 1,
    // Whole-set replacement from a reviewed sheet: every photo here was accepted by hand.
    provenance: 'curator',
  }));
  applied.push({ species: set.species, before, after: entry.photos.map((p) => p.photo_id) });
}

const comments = extractSpeciesComments(raw);
const rendered = reattachSpeciesComments(TOML.stringify(sortManifestSpecies(manifest)), comments);

console.log(`accepted sets: ${accepted.length}`);
console.log(`  would apply: ${applied.length}`);
console.log(`  skipped:     ${skipped.length}`);
for (const s of skipped) console.log(`    ${s.species}: ${s.why}`);

const sizes = applied.reduce((a, x) => { const k = `${x.before.length}->${x.after.length}`; a[k] = (a[k] ?? 0) + 1; return a; }, {});
console.log(`\n  set size changes: ${Object.entries(sizes).sort().map(([k, v]) => `${k} (${v})`).join(', ')}`);
const netPhotos = applied.reduce((a, x) => a + x.after.length - x.before.length, 0);
console.log(`  net photo change: ${netPhotos >= 0 ? '+' : ''}${netPhotos}`);

/**
 * Guard: compare STRUCTURES, not lines.
 *
 * A positional line diff is worthless here. Species that had no photos get a photos array
 * inserted (16 of the 58 go 0->N), and the seeder omits that array entirely when empty --
 * so inserting blocks shifts every later line and a naive diff reported 9,860 "changed"
 * lines for an edit touching 58 entries. Parse both sides and compare per species instead.
 */
const beforeParsed = TOML.parse(raw);
const afterParsed = TOML.parse(rendered);
const keysBefore = Object.keys(beforeParsed.species).sort();
const keysAfter = Object.keys(afterParsed.species).sort();
const appliedNames = new Set(applied.map((a) => a.species));

const changedEntries = keysBefore.filter((k) =>
  JSON.stringify(beforeParsed.species[k]) !== JSON.stringify(afterParsed.species[k]));
const unexpected = changedEntries.filter((k) => !appliedNames.has(k));
const descriptionsAltered = keysBefore.filter((k) =>
  (beforeParsed.species[k].description ?? '') !== (afterParsed.species[k].description ?? ''));
const countPhotos = (m) => Object.values(m.species).reduce((a, e) => a + (e.photos ?? []).length, 0);

console.log(`\n  species count ${keysBefore.length} -> ${keysAfter.length}` +
  `   same key set: ${JSON.stringify(keysBefore) === JSON.stringify(keysAfter)}`);
console.log(`  entries changed: ${changedEntries.length} (expected ${applied.length})`);
console.log(`  changed but NOT accepted: ${unexpected.length}${unexpected.length ? '  <<< ' + unexpected.slice(0, 5).join(', ') : ''}`);
console.log(`  descriptions altered: ${descriptionsAltered.length}`);
console.log(`  total photos ${countPhotos(beforeParsed)} -> ${countPhotos(afterParsed)}`);

if (unexpected.length || descriptionsAltered.length || keysBefore.length !== keysAfter.length) {
  console.error('\nREFUSING TO WRITE: the edit touched something it should not have.');
  process.exit(1);
}

if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write to apply.'); process.exit(0); }

writeFileSync(MANIFEST, rendered, 'utf-8');
console.log(`\nwrote ${MANIFEST}`);
console.log('Now run: node scripts/validate-species.mjs');
