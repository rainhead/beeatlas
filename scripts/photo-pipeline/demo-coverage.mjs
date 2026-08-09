#!/usr/bin/env node
/**
 * End-to-end demonstration of coverage-based selection for ONE species.
 *
 *   node scripts/photo-pipeline/demo-coverage.mjs "Osmia montana" --slots 8
 *
 * Assembles the FULL vetted candidate pool -- including the ecdysis `specimen` arm -- takes
 * EVERY license-clean photo of each observation rather than only the first, scores each
 * photo's part visibility, then picks a set by greedy set cover rather than by rank.
 *
 * The `specimen` arm used to be this pool's distinguishing feature: seed-species-photos.mjs
 * excluded it, so 90 species had vetted photos it could not see. beeatlas-an8 fixed the
 * seeder, so both now draw from the same arms; what still differs is every-photo-per-
 * observation, part scoring, and set cover.
 *
 * WHY SET COVER RATHER THAN TOP-N. Ranking by any score picks the N best photos, which are
 * often near-duplicates: three good lateral shots document the same parts three times.
 * Coverage asks what is still unseen. Peter's stated reason for preferring lateral habitus
 * was that it showed the MOST BODY PARTS -- so the objective is parts documented, not
 * photos ranked.
 *
 * Angle is deliberately absent: it measured +6 to +14 points over baseline and is not
 * trustworthy. Everything here rests on part visibility (Spearman 0.70 against Peter,
 * versus 0.52 for subject fraction) and localization.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { OUT, IMAGES, USER_AGENT, LICENSE_WHITELIST, DEFAULT_MODEL, resolveProvider,
         PARTS_PROMPT, PARTS_SCHEMA, PART_KEYS, informationScore , downscale } from './config.mjs';

const species = process.argv[2] ?? 'Osmia montana';
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const SLOTS = Number(flag('slots', 8));
const MODEL = flag('model', 'qwen/qwen3-vl-235b-a22b-instruct');
const provider = resolveProvider(flag('provider', 'openrouter'), MODEL);
const READABLE = 2;   // a part counts as covered at 2+; 3 is "keyable"

// ---- 1. vetted observations, ALL arms ----
const sql = `SELECT DISTINCT specimen_observation_id AS id, record_type
  FROM read_parquet('public/data/occurrences.parquet')
  WHERE lower(canonical_name) = '${species.toLowerCase()}' AND specimen_observation_id IS NOT NULL`;
const vetted = JSON.parse(execSync(`duckdb -json -c "${sql}"`, { encoding: 'utf8' }));
const specimenArm = vetted.filter((v) => v.record_type === 'specimen').length;
console.log(`${species}: ${vetted.length} vetted observations (${specimenArm} from the ecdysis specimen arm)`);

// ---- 2. every license-clean photo of each ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const photos = [];
for (let i = 0; i < vetted.length; i += 30) {
  const batch = vetted.slice(i, i + 30).map((v) => v.id);
  const res = await fetch(`https://api.inaturalist.org/v1/observations?${new URLSearchParams({ id: batch.join(','), per_page: String(batch.length) })}`,
    { headers: { 'User-Agent': USER_AGENT } });
  const json = res.ok ? await res.json() : { results: [] };
  for (const obs of json.results ?? []) {
    for (const p of obs.photos ?? []) {
      if (p?.license_code && LICENSE_WHITELIST.has(p.license_code)) {
        photos.push({ photo_id: p.id, observation_id: obs.id,
          url: (p.url ?? '').replace(/\/(square|small|medium)\./, '/large.'),
          license: p.license_code, attribution: p.attribution });
      }
    }
  }
  await sleep(1100);
}
console.log(`  ${photos.length} license-clean photos across those observations`);

// ---- 3. download + score ----
if (!existsSync(IMAGES)) mkdirSync(IMAGES, { recursive: true });
for (const p of photos) {
  const ext = path.extname(new URL(p.url).pathname) || '.jpg';
  p.full_path = path.join(IMAGES, `${p.photo_id}-full${ext}`);
  p.small_path = path.join(IMAGES, `${p.photo_id}-512.jpg`);
  if (existsSync(p.small_path)) continue;
  try {
    const r = await fetch(p.url);
    if (!r.ok) { p.err = true; continue; }
    writeFileSync(p.full_path, Buffer.from(await r.arrayBuffer()));
    downscale(p.full_path, p.small_path);
    await sleep(1000);
  } catch { p.err = true; }
}
const usable = photos.filter((p) => !p.err && existsSync(p.small_path));

let spend = 0, cursor = 0;
async function worker() {
  while (cursor < usable.length) {
    const p = usable[cursor++];
    try {
      const res = await fetch(provider.url, { method: 'POST', headers: provider.headers,
        body: JSON.stringify({ model: MODEL,
          messages: [{ role: 'user', content: [ { type: 'text', text: PARTS_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(p.small_path).toString('base64')}` } } ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'parts', strict: true, schema: PARTS_SCHEMA } },
          temperature: 0, max_tokens: 700, ...provider.extraBody }) });
      const j = await res.json();
      spend += Number(j.usage?.cost ?? 0);
      Object.assign(p, JSON.parse(j.choices[0].message.content));
      p.information = informationScore(p);
    } catch (e) { p.scoreErr = String(e).slice(0, 60); }
  }
}
await Promise.all(Array.from({ length: provider.concurrency }, worker));
const scored = usable.filter((p) => p.information != null).sort((a, b) => b.information - a.information);
console.log(`  ${scored.length} scored, $${spend.toFixed(4)}\n`);

// ---- 4. greedy set cover ----
// Objective: raise every part to READABLE, preferring photos that add the most NEW
// coverage; ties broken by total information so a richer photo wins.
const chosen = [];
const cover = Object.fromEntries(PART_KEYS.map((k) => [k, 0]));
const usedObs = new Set();
while (chosen.length < SLOTS) {
  let best = null, bestGain = 0;
  for (const p of scored) {
    if (chosen.includes(p)) continue;
    // One photo per observation, the beeatlas-zd7 rule: three frames of one bee is one
    // reference photo, not three.
    if (usedObs.has(p.observation_id)) continue;
    const gain = PART_KEYS.reduce((a, k) => a + Math.max(0, Math.min(p[k], 3) - Math.max(cover[k], READABLE - 1)) , 0);
    if (gain > bestGain || (gain === bestGain && best && p.information > best.information && gain > 0)) { best = p; bestGain = gain; }
  }
  if (!best || bestGain === 0) break;
  chosen.push(best);
  usedObs.add(best.observation_id);
  for (const k of PART_KEYS) cover[k] = Math.max(cover[k], best[k]);
}

console.log('SELECTED SET (greedy part coverage, one photo per observation):');
for (const [i, p] of chosen.entries()) {
  console.log(`  ${i + 1}. photo ${p.photo_id} obs ${p.observation_id}  ${PART_KEYS.map((k) => `${k[0]}${p[k]}`).join(' ')}  info ${p.information}/15`);
}
console.log(`\n  coverage reached: ${PART_KEYS.map((k) => `${k} ${cover[k]}`).join(', ')}`);
console.log(`  parts readable (>=${READABLE}): ${PART_KEYS.filter((k) => cover[k] >= READABLE).length}/${PART_KEYS.length}`);
console.log(`  parts keyable (3):    ${PART_KEYS.filter((k) => cover[k] >= 3).length}/${PART_KEYS.length}`);

writeFileSync(path.join(OUT, `coverage-${species.replace(/\s+/g, '_')}.json`),
  JSON.stringify({ species, vetted: vetted.length, specimenArm, candidates: scored.length, chosen, cover }, null, 2));
