#!/usr/bin/env node
/**
 * Stage A of a full re-selection: enumerate and download every licensed candidate photo.
 *
 *   node scripts/photo-pipeline/pull-candidates.mjs [--cap 60]
 *
 * Differs from the seeder in the ways today's work established:
 *   1. (was: ALL vetted arms, including ecdysis `specimen`. beeatlas-an8 has since fixed
 *      loadVettedObservations(), which excluded the specimen arm and so could not see the
 *      vetted photos of 90 species. Both now read the same arms; kept here as the reason
 *      this pool's SQL has no record_type predicate.)
 *   2. EVERY license-clean photo of each observation, not the first. 79% of shipped photos
 *      come from an observation with 2+, and the first is an arbitrary choice.
 *   3. No quality_grade filter, because these are OUR determinations: an Ecdysis specimen
 *      record is a stronger claim than iNat's two-agreeing-community-IDs.
 *
 * Resumable at photo granularity. 512px copies go to .cache (needed for scoring);
 * originals go to an external volume when one is mounted, since they are only wanted for
 * the full-size lightbox during review and are ~15x the bytes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { OUT, IMAGES, USER_AGENT, LICENSE_WHITELIST, fetchPhotos } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : Number(process.argv[i + 1]); };
const CAP = flag('cap', 60);          // matches the seeder's VETTED_POOL_SIZE
const ORIGINALS = '/Volumes/More Beans/working/beeatlas-photos';

if (!existsSync(IMAGES)) mkdirSync(IMAGES, { recursive: true });
const keepOriginals = existsSync('/Volumes/More Beans/working');
if (keepOriginals && !existsSync(ORIGINALS)) mkdirSync(ORIGINALS, { recursive: true });
console.log(keepOriginals ? `originals -> ${ORIGINALS}` : 'originals -> discarded (external volume not mounted)');

// ---- 1. vetted observations per species, ALL arms ----
const sql = `
  SELECT canonical_name, list(DISTINCT specimen_observation_id) AS ids
  FROM read_parquet('public/data/occurrences.parquet')
  WHERE specimen_observation_id IS NOT NULL AND canonical_name IS NOT NULL
  GROUP BY 1`.replace(/\n\s+/g, ' ').trim();
const bySpecies = JSON.parse(execSync(`duckdb -json -c "${sql}"`, { encoding: 'utf8', maxBuffer: 1 << 28 }));
const obsToSpecies = new Map();
let capped = 0;
for (const row of bySpecies) {
  for (const id of (row.ids ?? []).slice(0, CAP)) { obsToSpecies.set(id, row.canonical_name); capped++; }
}
console.log(`${bySpecies.length} species, ${capped} observations after cap of ${CAP}/species`);

// ---- 2. every license-clean photo of each observation (resumable) ----
const PHOTOS_FILE = path.join(OUT, 'candidate-photos.json');
let photos = existsSync(PHOTOS_FILE) ? JSON.parse(readFileSync(PHOTOS_FILE, 'utf8')) : [];
const haveObs = new Set(photos.map((p) => p.observation_id));
const todoObs = [...obsToSpecies.keys()].filter((id) => !haveObs.has(id));
console.log(`${haveObs.size} observations already enumerated, ${todoObs.length} to fetch`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < todoObs.length; i += 30) {
  const batch = todoObs.slice(i, i + 30);
  try {
    const res = await fetch(`https://api.inaturalist.org/v1/observations?${new URLSearchParams({ id: batch.join(','), per_page: String(batch.length) })}`,
      { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      for (const obs of (await res.json()).results ?? []) {
        for (const p of obs.photos ?? []) {
          if (!p?.license_code || !LICENSE_WHITELIST.has(p.license_code)) continue;
          photos.push({
            photo_id: p.id, observation_id: obs.id, species: obsToSpecies.get(obs.id),
            url: (p.url ?? '').replace(/\/(square|small|medium)\./, '/large.'),
            license: p.license_code, attribution: p.attribution,
            quality_grade: obs.quality_grade,
          });
        }
      }
    }
  } catch (e) { console.warn(`  ! batch ${i / 30}: ${String(e).slice(0, 60)}`); }
  if ((i / 30) % 20 === 0) {
    writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
    console.log(`  ${Math.min(i + 30, todoObs.length)}/${todoObs.length} observations, ${photos.length} photos`);
  }
  await sleep(1100); // PHOTO-07: this IS the iNat API
}
writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
console.log(`\n${photos.length} candidate photos from ${new Set(photos.map((p) => p.observation_id)).size} observations`);

// ---- 3. download, parallel (S3 open-data bucket, not the API) ----
for (const p of photos) {
  const ext = path.extname(new URL(p.url).pathname) || '.jpg';
  p.full_path = path.join(keepOriginals ? ORIGINALS : IMAGES, `${p.photo_id}-full${ext}`);
  p.small_path = path.join(IMAGES, `${p.photo_id}-512.jpg`);
}
const t0 = Date.now();
const res = await fetchPhotos(photos, {
  concurrency: 8,
  keepOriginals,
  onProgress: ({ got, cached, failed, total }) =>
    console.log(`  ${got + cached}/${total}  (${got} new, ${cached} cached, ${failed} failed, ${(got / ((Date.now() - t0) / 1000)).toFixed(1)}/s)`),
});
writeFileSync(PHOTOS_FILE, JSON.stringify(photos.filter((p) => !p.download_error), null, 2));
console.log(`\ndownload: ${res.got} new, ${res.cached} cached, ${res.failed} failed in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
