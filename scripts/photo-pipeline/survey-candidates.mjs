#!/usr/bin/env node
/**
 * For the worst-served species, ask what iNat actually HAS.
 *
 *   node scripts/photo-pipeline/survey-candidates.mjs [--under 10]
 *
 * Before building a candidate search it is worth knowing whether better photos exist at
 * all. Some of these species may simply have no licensed photo anywhere -- that is a
 * finding, not a failure, and it is much cheaper to learn now than after building a
 * pipeline that returns nothing.
 *
 * TAXON RESOLUTION IS NOT REINVENTED HERE. ADR 0030 is explicit that any new outbound iNat
 * query must resolve through inat_query_taxa.csv layered over the canonical bridge, never
 * the bridge alone -- the bridge answers "what taxon IS this species", which for a folded
 * concept reaches only part of it. seed-species-photos.mjs exports loadTaxonIds() for
 * exactly this, so this imports it. Deriving query taxa any other way is documented in
 * that ADR as wrong, including one rule that would put Palearctic bumblebee photos on a
 * Washington species page.
 *
 * Counts observations with license-clean photos per region tier, using the same tiers and
 * the same license whitelist the seeder uses.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, USER_AGENT, LICENSE_WHITELIST } from './config.mjs';
import { loadTaxonIds, normalizeName } from '../seed-species-photos.mjs';

const INAT = 'https://api.inaturalist.org/v1/observations';
const WA = [46];
const PNW = [10, 22, 7085];
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : Number(process.argv[i + 1]); };
const UNDER = flag('under', 10);

const rows = readFileSync(path.join(OUT, 'locate-qwen_qwen3-vl-32b-instruct.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error);
const bySpecies = {};
for (const r of rows) (bySpecies[r.species] ??= []).push(r);
const frac = (r) => (r.subject_fraction ?? 0) * 100;

const needy = Object.entries(bySpecies)
  .filter(([, rs]) => rs.every((r) => frac(r) < UNDER))
  .map(([species, rs]) => ({ species, shipped: rs.length, best: Math.max(...rs.map(frac)) }))
  .sort((a, b) => a.best - b.best);

const taxa = loadTaxonIds('data/beeatlas.duckdb');
console.log(`${needy.length} species with every photo under ${UNDER}% of frame\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Observations carrying at least one license-whitelisted photo, for one place tier. */
async function countLicensed(taxonId, placeIds) {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    quality_grade: 'research',
    photos: 'true',
    per_page: '200',
    order_by: 'votes',
    ...(placeIds ? { place_id: placeIds.join(',') } : {}),
  });
  const res = await fetch(`${INAT}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  await sleep(1100); // PHOTO-07
  if (!res.ok) return { total: -1, licensed: 0, photos: 0 };
  const json = await res.json();
  let licensed = 0, photos = 0;
  for (const obs of json.results ?? []) {
    const clean = (obs.photos ?? []).filter((p) => p?.license_code && LICENSE_WHITELIST.has(p.license_code));
    if (clean.length) { licensed++; photos += clean.length; }
  }
  return { total: json.total_results ?? 0, licensed, photos };
}

const out = [];
console.log('species                         taxon      WA obs/lic   PNW obs/lic   global obs/lic');
for (const n of needy) {
  const taxonId = taxa.get(normalizeName(n.species));
  if (!taxonId) { console.log(`${n.species.padEnd(30)} NO TAXON ID`); out.push({ ...n, taxonId: null }); continue; }
  const wa = await countLicensed(taxonId, WA);
  const pnw = await countLicensed(taxonId, PNW);
  const gl = await countLicensed(taxonId, null);
  const fmt = (c) => `${String(c.total).padStart(5)}/${String(c.licensed).padStart(3)}`;
  console.log(`${n.species.padEnd(30)} ${String(taxonId).padEnd(10)} ${fmt(wa)}      ${fmt(pnw)}       ${fmt(gl)}`);
  out.push({ ...n, taxonId, wa, pnw, global: gl });
}

writeFileSync(path.join(OUT, 'candidate-survey.json'), JSON.stringify(out, null, 2));

const noneAnywhere = out.filter((o) => o.taxonId && (o.global?.licensed ?? 0) === 0);
const regional = out.filter((o) => (o.wa?.licensed ?? 0) > 0 || (o.pnw?.licensed ?? 0) > 0);
console.log(`\n  ${regional.length} have licensed photos in WA or the PNW`);
console.log(`  ${noneAnywhere.length} have NO licensed photo anywhere — nothing can fix those but a new photographer`);
console.log(`\n  out/candidate-survey.json`);
