#!/usr/bin/env node
/**
 * Enumerate the OTHER license-clean photos of each observation we already ship from.
 *
 *   node scripts/photo-pipeline/fetch-siblings.mjs [--under 45]
 *
 * scripts/seed-species-photos.mjs takes the FIRST license-whitelisted photo of each
 * observation (the `.find(...)` in collectPhotos). obs.photos already carries ALL of them
 * in the same API response, so every sibling is a candidate we have been discarding for
 * free -- across the 79% of shipped photos whose observation has 2+ licensed photos.
 *
 * A sibling swap is the safest change available: SAME observation, SAME photographer,
 * SAME license, SAME attribution. Only the frame differs. No taxon resolution is involved,
 * which matters because ADR 0030 establishes that name -> iNat taxon_id is taxonomic
 * judgement, not lookup.
 *
 * ENUMERATES ONLY. Scoring is a separate pass, so its cost is known before it starts
 * rather than estimated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, LICENSE_WHITELIST, USER_AGENT, DEFAULT_MODEL } from './config.mjs';

const INAT = 'https://api.inaturalist.org/v1/observations';
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : Number(process.argv[i + 1]); };
const UNDER = flag('under', 45);
const SLUG = (process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : DEFAULT_MODEL).replace(/[/\\]/g, '_');

const located = readFileSync(path.join(OUT, `locate-${SLUG}.jsonl`), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error);
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));

const targets = located
  .filter((r) => ((r.subject_fraction ?? 0) * 100) < UNDER)
  .map((r) => ({ ...r, obs: pool.get(r.photo_id)?.observation_id }))
  .filter((t) => t.obs);
const obsIds = [...new Set(targets.map((t) => t.obs))];
console.log(`${targets.length} photos under ${UNDER}% -> ${obsIds.length} observations to fetch`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byObs = new Map();
const BATCH = 30; // comma-separated id list; keeps requests to ~1 per 30 observations

for (let i = 0; i < obsIds.length; i += BATCH) {
  const batch = obsIds.slice(i, i + BATCH);
  const params = new URLSearchParams({ id: batch.join(','), per_page: String(batch.length) });
  let json = null;
  for (let attempt = 0; attempt < 3 && !json; attempt++) {
    try {
      const res = await fetch(`${INAT}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) json = await res.json();
      else { console.warn(`  ! HTTP ${res.status}`); await sleep(3000); }
    } catch (e) { console.warn(`  ! ${String(e).slice(0, 60)}`); await sleep(3000); }
  }
  for (const obs of json?.results ?? []) {
    byObs.set(obs.id, (obs.photos ?? [])
      .filter((p) => p?.license_code && LICENSE_WHITELIST.has(p.license_code))
      .map((p) => ({
        photo_id: p.id,
        // iNat hands back a square thumb url; `large` is the size the manifest stores.
        url: (p.url ?? '').replace(/\/(square|small|medium)\./, '/large.'),
        license: p.license_code,
        attribution: p.attribution,
      })));
  }
  if ((i / BATCH) % 5 === 0) console.log(`  ${Math.min(i + BATCH, obsIds.length)}/${obsIds.length}`);
  await sleep(1100); // <=1 req/sec (PHOTO-07)
}

const rows = [];
let withSiblings = 0, siblingTotal = 0;
for (const t of targets) {
  const all = byObs.get(t.obs) ?? [];
  const siblings = all.filter((p) => p.photo_id !== t.photo_id);
  if (siblings.length) { withSiblings++; siblingTotal += siblings.length; }
  rows.push({
    photo_id: t.photo_id, species: t.species, observation_id: t.obs,
    current_fraction: t.subject_fraction, licensed_total: all.length, siblings,
  });
}

writeFileSync(path.join(OUT, 'siblings.json'), JSON.stringify({ under: UNDER, rows }, null, 2));
console.log(`\n${targets.length} weak photos`);
console.log(`  ${withSiblings} have a licensed sibling (${(withSiblings / targets.length * 100).toFixed(0)}%)`);
console.log(`  ${siblingTotal} siblings to score`);
console.log(`  ${targets.length - withSiblings} have no alternative — only a new search could help those`);
