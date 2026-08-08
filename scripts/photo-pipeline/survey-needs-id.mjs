#!/usr/bin/env node
/**
 * How much coverage would `needs_id` observations add?
 *
 *   node scripts/photo-pipeline/survey-needs-id.mjs [--limit N]
 *
 * seed-species-photos.mjs filters quality_grade=research on tiers 2-4. Tier 1 (our own
 * vetted arms) has no such filter, deliberately -- an expert determination from our arms is
 * a stronger claim than iNat's two-agreeing-community-IDs. But for a species with NO vetted
 * pool, every needs_id observation is invisible, however good its photos.
 *
 * This counts, per species with no shipped photo: research-grade observations carrying a
 * license-clean photo, versus ALL grades. The difference is what relaxing the filter would
 * reach.
 *
 * It does NOT judge whether those IDs are trustworthy -- that is the question relaxing the
 * filter actually raises, and it is Peter's to answer, possibly by surfacing the
 * uncertainty on the page rather than by excluding the photo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { OUT, MANIFEST, USER_AGENT, LICENSE_WHITELIST } from './config.mjs';
import { loadTaxonIds, normalizeName } from '../seed-species-photos.mjs';

const INAT = 'https://api.inaturalist.org/v1/observations';
const WA = [46], PNW = [10, 22, 7085];
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : Number(process.argv[i + 1]); };
const LIMIT = flag('limit', Infinity);

const manifest = TOML.parse(readFileSync(MANIFEST, 'utf8'));
const noPhotos = Object.entries(manifest.species)
  .filter(([, e]) => !(e.photos ?? []).length)
  .map(([name]) => name)
  .slice(0, LIMIT);

const taxa = loadTaxonIds('data/beeatlas.duckdb');
console.log(`${noPhotos.length} species with no shipped photo\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function count(taxonId, placeIds, grade) {
  const params = new URLSearchParams({
    taxon_id: String(taxonId), photos: 'true', per_page: '200', order_by: 'votes',
    ...(grade ? { quality_grade: grade } : {}),
    ...(placeIds ? { place_id: placeIds.join(',') } : {}),
  });
  const res = await fetch(`${INAT}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  await sleep(1100); // PHOTO-07: this IS the API
  if (!res.ok) return 0;
  const json = await res.json();
  return (json.results ?? []).filter((o) => (o.photos ?? []).some((p) => p?.license_code && LICENSE_WHITELIST.has(p.license_code))).length;
}

const rows = [];
console.log('species                        research  anygrade   gain   (PNW scope)');
for (const sp of noPhotos) {
  const taxonId = taxa.get(normalizeName(sp));
  if (!taxonId) { rows.push({ species: sp, taxonId: null }); continue; }
  const research = await count(taxonId, PNW, 'research');
  const any = await count(taxonId, PNW, null);
  rows.push({ species: sp, taxonId, research, any, gain: any - research });
  if (any > 0) console.log(`${sp.padEnd(30)} ${String(research).padStart(8)} ${String(any).padStart(9)} ${String(any - research).padStart(6)}`);
}

writeFileSync(path.join(OUT, 'needs-id-survey.json'), JSON.stringify(rows, null, 2));
const scored = rows.filter((r) => r.taxonId);
const wouldGain = scored.filter((r) => r.research === 0 && r.any > 0);
const alreadyOk = scored.filter((r) => r.research > 0);
console.log(`\n  ${scored.length} species resolved`);
console.log(`  ${alreadyOk.length} already have research-grade licensed photos in the PNW (so the gap is elsewhere)`);
console.log(`  ${wouldGain.length} have NO research-grade but DO have needs_id licensed photos — these are what relaxing the filter reaches`);
console.log(`  ${scored.length - alreadyOk.length - wouldGain.length} have nothing at any grade in the PNW`);
