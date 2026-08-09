#!/usr/bin/env node
/**
 * One-shot: stamp `provenance` on every photo in content/species-photos.toml.
 *
 *   node scripts/photo-pipeline/backfill-provenance.mjs [--dry-run]
 *
 * PHOTO_PROVENANCE became a required field with no default (validate-species.mjs explains
 * why a default is unsafe in either direction), so the 1,116 photos already in the manifest
 * need their history read back onto them once. After that this script has no purpose — the
 * writers stamp their own photos — and it can be deleted.
 *
 * WHERE THE ANSWER COMES FROM. Two commits applied human review passes on 2026-08-08:
 *
 *   1331b219  118 sibling swaps. "163 survived to review; a human accepted 118 and
 *             rejected 45 by eye." Each swap changed photo_id/url within an existing
 *             entry, so ONLY the swapped photo is the human's choice — its neighbours in
 *             the same entry are still the seeder's arbitrary first-license-clean pick.
 *   d2ad2210  58 whole photo sets from coverage selection, "accepted by hand from a review
 *             page". These replaced the entire photos array, so every photo is curator's.
 *
 * Reading the added `photo_id` lines out of those two diffs gives the exact set, which is
 * why this is a git query and not a heuristic over the current file. Everything else is the
 * seeder's: the manifest had no other writer.
 *
 * `pipeline` is deliberately unused here. No unreviewed pipeline selection was ever applied
 * to the manifest — both passes went through a human — so stamping any existing photo
 * `pipeline` would invent a provenance the file never had.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import TOML from '@iarna/toml';
import { MANIFEST } from './config.mjs';
import { extractSpeciesComments, reattachSpeciesComments, sortManifestSpecies } from '../seed-species-photos.mjs';

const CURATED_COMMITS = ['1331b219', 'd2ad2210'];
const dryRun = process.argv.includes('--dry-run');

/** photo_ids ADDED to the manifest by a commit — the photos that commit chose. */
function addedPhotoIds(commit) {
  const diff = execSync(`git show ${commit} -- content/species-photos.toml`, {
    encoding: 'utf8', maxBuffer: 1 << 28,
  });
  const ids = new Set();
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+')) continue;
    // TOML integers may carry underscore separators: `photo_id = 175_109_234`.
    const m = line.match(/^\+\s*photo_id\s*=\s*([\d_]+)/);
    if (m) ids.add(Number(m[1].replace(/_/g, '')));
  }
  return ids;
}

const curated = new Set();
for (const c of CURATED_COMMITS) {
  const ids = addedPhotoIds(c);
  console.log(`${c}: ${ids.size} photo_ids accepted by a human`);
  for (const id of ids) curated.add(id);
}
console.log(`union: ${curated.size} curator photos`);

const raw = readFileSync(MANIFEST, 'utf8');
const manifest = TOML.parse(raw);

const counts = { curator: 0, seeder: 0 };
let missingFromManifest = 0;
const seen = new Set();
for (const entry of Object.values(manifest.species ?? {})) {
  for (const photo of entry.photos ?? []) {
    const provenance = curated.has(photo.photo_id) ? 'curator' : 'seeder';
    photo.provenance = provenance;
    counts[provenance]++;
    seen.add(photo.photo_id);
  }
}
// A curated id absent from the manifest means a later pass replaced that photo again;
// worth reporting rather than assuming the two diffs compose cleanly.
for (const id of curated) if (!seen.has(id)) missingFromManifest++;

console.log(`\nstamped: ${counts.curator} curator, ${counts.seeder} seeder`);
if (missingFromManifest) {
  console.log(`note: ${missingFromManifest} accepted photo(s) no longer in the manifest (replaced by a later pass)`);
}

const entriesProtected = Object.values(manifest.species ?? {})
  .filter((e) => (e.photos ?? []).some((p) => p.provenance === 'curator')).length;
console.log(`entries now protected from --reselect: ${entriesProtected}`);

if (dryRun) { console.log('\n--dry-run: not written'); process.exit(0); }

const comments = extractSpeciesComments(raw);
writeFileSync(MANIFEST, reattachSpeciesComments(TOML.stringify(sortManifestSpecies(manifest)), comments));
console.log(`\nwrote ${MANIFEST}`);
