#!/usr/bin/env node
/**
 * Download every photo in content/species-photos.toml and downscale to 512px.
 *
 *   node scripts/photo-pipeline/download-photos.mjs [--limit N]
 *
 * Writes .cache/photo-pipeline/images/ and out/pool.json. Rate-limited to <=1 req/sec,
 * matching the constraint on scripts/seed-species-photos.mjs (PHOTO-07).
 *
 * SHUFFLED, with a fixed seed. A long downstream run ordered by species name spends its
 * first hour inside Agapostemon, so an early spot-check says nothing about coverage.
 * Shuffled, the first fifty are a fair sample of the whole manifest.
 *
 * DEDUPES BY photo_id: the manifest has ~1,088 entries but only ~1,070 unique photos --
 * 18 are shared between two species entries.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import TOML from '@iarna/toml';
import { MANIFEST, IMAGES, OUT } from './config.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : Number(process.argv[i + 1]); };
const LIMIT = arg('limit', Infinity);
const SEED = arg('seed', 20260806);

for (const dir of [IMAGES, OUT]) if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

/** mulberry32 — small deterministic PRNG so the order is reproducible across re-runs. */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const manifest = TOML.parse(readFileSync(MANIFEST, 'utf8'));
const seen = new Set();
const photos = [];
for (const [species, entry] of Object.entries(manifest.species ?? {})) {
  for (const p of entry.photos ?? []) {
    if (seen.has(p.photo_id)) continue;
    seen.add(p.photo_id);
    photos.push({
      species,
      observation_id: p.observation_id,
      photo_id: p.photo_id,
      url: p.url,
      attribution: p.attribution,
      license: p.license,
      ordering: p.ordering,
    });
  }
}

const random = rng(SEED);
for (let i = photos.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [photos[i], photos[j]] = [photos[j], photos[i]];
}
const pool = photos.slice(0, LIMIT);
console.log(`${pool.length} unique photos (seed ${SEED}, shuffled)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let got = 0, cached = 0, failed = 0;

for (const p of pool) {
  const ext = path.extname(new URL(p.url).pathname) || '.jpg';
  p.full_path = path.join(IMAGES, `${p.photo_id}-full${ext}`);
  p.small_path = path.join(IMAGES, `${p.photo_id}-512.jpg`);

  if (existsSync(p.small_path) && existsSync(p.full_path)) { cached++; continue; }

  try {
    const res = await fetch(p.url);
    if (!res.ok) { p.download_error = `HTTP ${res.status}`; failed++; await sleep(1000); continue; }
    writeFileSync(p.full_path, Buffer.from(await res.arrayBuffer()));
    // sips ships with macOS -- no image dependency. -Z fits the LONGEST edge, preserving
    // aspect ratio, so normalized box coordinates stay meaningful.
    execFileSync('/usr/bin/sips', ['-Z', '512', '-s', 'format', 'jpeg', p.full_path, '--out', p.small_path], { stdio: 'ignore' });
    got++;
  } catch (e) {
    // One bad photo must not abandon a 1,000-item run.
    p.download_error = String(e).slice(0, 120);
    failed++;
    await sleep(1000);
    continue;
  }
  if (got % 50 === 0) console.log(`  ${got} downloaded, ${cached} cached, ${failed} failed`);
  await sleep(1000); // PHOTO-07
}

const kept = pool.filter((p) => !p.download_error);
writeFileSync(path.join(OUT, 'pool.json'), JSON.stringify(kept, null, 2));
console.log(`done: ${got} downloaded, ${cached} cached, ${failed} failed, ${kept.length} in pool.json`);
