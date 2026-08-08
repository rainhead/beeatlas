#!/usr/bin/env node
/**
 * Download the sibling photos enumerated by fetch-siblings.mjs.
 *
 *   node scripts/photo-pipeline/download-siblings.mjs
 *
 * Writes out/sibling-pool.json, which locate.mjs consumes via --pool.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { OUT, IMAGES } from './config.mjs';

if (!existsSync(IMAGES)) mkdirSync(IMAGES, { recursive: true });
const { rows } = JSON.parse(readFileSync(path.join(OUT, 'siblings.json'), 'utf8'));

const seen = new Set();
const pool = [];
for (const r of rows) {
  for (const s of r.siblings) {
    if (seen.has(s.photo_id)) continue;
    seen.add(s.photo_id);
    pool.push({
      photo_id: s.photo_id, species: r.species, observation_id: r.observation_id,
      url: s.url, license: s.license, attribution: s.attribution,
      replaces_photo_id: r.photo_id, replaces_fraction: r.current_fraction,
    });
  }
}

/**
 * WEAKEST FIRST. Both this download and the scoring pass consume the same order, and long
 * runs get interrupted -- so the work must be ordered such that an interruption costs the
 * least valuable end. A photo whose bee is 2% of frame has far more to gain from a swap
 * than one already at 40%.
 */
pool.sort((a, b) => (a.replaces_fraction ?? 0) - (b.replaces_fraction ?? 0));
console.log(`${pool.length} sibling photos to download (weakest-first)`);

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
    execFileSync('/usr/bin/sips', ['-Z', '512', '-s', 'format', 'jpeg', p.full_path, '--out', p.small_path], { stdio: 'ignore' });
    got++;
  } catch (e) {
    p.download_error = String(e).slice(0, 120); failed++; await sleep(1000); continue;
  }
  if (got % 50 === 0) console.log(`  ${got} downloaded, ${cached} cached, ${failed} failed`);
  await sleep(1000); // PHOTO-07
}

const kept = pool.filter((p) => !p.download_error);
writeFileSync(path.join(OUT, 'sibling-pool.json'), JSON.stringify(kept, null, 2));
console.log(`done: ${got} downloaded, ${cached} cached, ${failed} failed, ${kept.length} in sibling-pool.json`);
