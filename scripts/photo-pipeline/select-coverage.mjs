#!/usr/bin/env node
/**
 * Stage C: choose each species' photo set by part coverage, and compare with what ships.
 *
 *   node scripts/photo-pipeline/select-coverage.mjs [--slots 8]
 *
 * PETER'S RULES, 2026-08-08:
 *   - 8 is a CEILING, not a quota. If there are not 8 that clear the quality guard, ship
 *     fewer.
 *   - Coverage determines set SIZE; quality determines what FILLS it.
 *   - A photo adding no new coverage may REPLACE a weaker one, but does not earn a new
 *     slot. So no padding toward the ceiling.
 *
 * Greedy set cover over parts, one photo per observation (beeatlas-zd7: three frames of one
 * bee is one reference photo). Ties broken by information score so a richer photo wins.
 *
 * FALLBACK: if no candidate makes any part readable, the species still needs a photo --
 * keep the single highest-information candidate rather than shipping nothing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { OUT, MANIFEST, PART_KEYS } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? Number(d) : Number(process.argv[i + 1]); };
const strFlag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const SLOTS = flag('slots', 8);
const READABLE = 2;
const FLOOR = flag('floor', 3);   // top up to this many when good candidates exist
const GUARD = flag('guard', 6);   // minimum information score (of 15) to occupy a top-up slot

const scored = readFileSync(path.join(OUT, 'candidate-parts.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error && r.information != null);
const meta = new Map(JSON.parse(readFileSync(path.join(OUT, 'candidate-photos.json'), 'utf8')).map((p) => [p.photo_id, p]));
const manifest = TOML.parse(readFileSync(MANIFEST, 'utf8'));

/**
 * MULTI-BEE GUARD (beeatlas-ekk, 2026-08-08). Part scores cannot tell one bee from many:
 * photo 50962190 shows ~65 bees, locate returned 65 raw boxes, the overlap merge unioned
 * them into one frame-filling box, and the photo scored a perfect subject fraction while
 * being a reference view of no individual at all. The signal was already recorded and
 * never consulted. A photo is suspect when the model returned 3+ raw boxes (one bee split
 * in two is the known 2% failure; three is not one bee) or 2+ distinct in-focus bees
 * survive the merge. Suspects never take a slot; a photo with no locate row passes, since
 * locate may only have run over the species being re-selected.
 */
const locateFile = path.join(OUT, strFlag('locate', 'locate-qwen_qwen3-vl-32b-instruct-candidates.jsonl'));
const located = new Map(!existsSync(locateFile) ? [] :
  readFileSync(locateFile, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && !r.error).map((r) => [r.photo_id, r]));
const isMultiBee = (p) => {
  const l = located.get(p.photo_id);
  if (!l) return false;
  return l.raw_box_count >= 3 || (l.bees ?? []).filter((b) => b.in_focus).length >= 2;
};
console.log(`${located.size} photos have locate data; multi-bee suspects among them: ${[...located.keys()].filter((id) => isMultiBee({ photo_id: id })).length}`);

// species key in the manifest is properly cased; candidates carry lowercase canonical_name
const manifestByLower = new Map(Object.entries(manifest.species).map(([k, v]) => [k.toLowerCase(), { key: k, entry: v }]));

/**
 * RESTRICT TO REAL SPECIES PAGES. occurrences.parquet keys on canonical_name, which
 * includes genus- and subgenus-level determinations -- and, via the inat_expert arm (whose
 * roster filters on WHO IDENTIFIED, not on what was identified), non-bees: a first run
 * proposed photo sets for `diptera`, `cerceris` and `crossocerus`, plus subgenera like
 * Melanosmia and Pyrobombus that have no page. The seeder avoids this by working from
 * species.json; the candidate pull did not, and scored 1,338 photos of things that cannot
 * be shown anywhere.
 */
const bySpecies = {};
let skippedNonPage = 0;
for (const r of scored) {
  if (!manifestByLower.has(r.species.toLowerCase())) { skippedNonPage++; continue; }
  (bySpecies[r.species] ??= []).push(r);
}
console.log(`${skippedNonPage} scored photos ignored: taxon has no species page (subgenera, and non-bees from the inat_expert arm)\n`);

const coverageOf = (photos) => {
  const c = Object.fromEntries(PART_KEYS.map((k) => [k, 0]));
  for (const p of photos) for (const k of PART_KEYS) c[k] = Math.max(c[k], p[k] ?? 0);
  return c;
};
const readableCount = (c) => PART_KEYS.filter((k) => c[k] >= READABLE).length;

const results = [];
for (const [speciesLower, cands] of Object.entries(bySpecies)) {
  const m = manifestByLower.get(speciesLower);
  const shippedIds = (m?.entry?.photos ?? []).map((p) => p.photo_id);
  // Shipped photos we happen to have scored (most are vetted, so usually present).
  const shippedScored = shippedIds.map((id) => scored.find((r) => r.photo_id === id)).filter(Boolean);

  const pool = [...cands].sort((a, b) => b.information - a.information);
  const chosen = [];
  const cover = Object.fromEntries(PART_KEYS.map((k) => [k, 0]));
  const usedObs = new Set();

  /**
   * NO-PHOTO RELAXATION (beeatlas-a2u, Peter 2026-08-09). One photo per observation exists
   * so three photos mean three bees, not three frames of one. Six of the eight first-photo
   * species have a SINGLE vetted observation, and for them the rule picks between a bare
   * page and a one-photo page when the observation holds six good frames. When the entry
   * ships NO photo, exhaust distinct observations first, then allow further photos from an
   * already-used observation — coverage gain and the top-up guard still apply, so this
   * never pads. Species that already ship photos keep the hard rule.
   */
  const relaxObs = shippedIds.length === 0;

  const pickBest = (eligible) => {
    let best = null, bestGain = 0;
    for (const p of pool) {
      if (chosen.includes(p) || isMultiBee(p) || !eligible(p)) continue;
      const gain = PART_KEYS.reduce((a, k) => a + Math.max(0, Math.min(p[k], 3) - Math.max(cover[k], READABLE - 1)), 0);
      if (gain > bestGain || (gain === bestGain && gain > 0 && best && p.information > best.information)) { best = p; bestGain = gain; }
    }
    return best;
  };

  while (chosen.length < SLOTS) {
    const best = pickBest((p) => !usedObs.has(p.observation_id))
      ?? (relaxObs ? pickBest(() => true) : null);
    if (!best) break;
    chosen.push(best); usedObs.add(best.observation_id);
    for (const k of PART_KEYS) cover[k] = Math.max(cover[k], best[k]);
  }
  // Fallback: never propose an empty set for a species that has candidates.
  if (!chosen.length && pool.length) chosen.push(pool.find((p) => !isMultiBee(p)) ?? pool[0]);

  /**
   * FLOOR (Peter, 2026-08-08). Pure coverage gave 135 species a single photo, because one
   * good photo can document every part. That satisfies the objective and discards what
   * ADR 0031 fought for: one photo per observation so that three photos mean three BEES,
   * not three frames of one. Variation between individuals -- sex, wear, colour form -- is
   * information part coverage cannot see.
   *
   * So after coverage, top up toward FLOOR with the best remaining photos, each from a
   * DIFFERENT observation, and only if they clear the quality guard. Species with fewer
   * good candidates still ship fewer -- the ceiling was never a quota and neither is this.
   */
  for (const allowUsedObs of relaxObs ? [false, true] : [false]) {
    for (const p of pool) {
      if (chosen.length >= FLOOR) break;
      if (chosen.includes(p) || isMultiBee(p)) continue;
      if (!allowUsedObs && usedObs.has(p.observation_id)) continue;
      if (p.information < GUARD) continue;
      chosen.push(p); usedObs.add(p.observation_id);
      for (const k of PART_KEYS) cover[k] = Math.max(cover[k], p[k]);
    }
  }

  const shippedCover = coverageOf(shippedScored);
  const propCover = coverageOf(chosen);
  results.push({
    species: m?.key ?? speciesLower,
    candidates: cands.length,
    shipped: shippedIds.length,
    shipped_scored: shippedScored.length,
    shipped_readable: shippedScored.length ? readableCount(shippedCover) : null,
    shipped_info: shippedScored.length ? Math.max(...shippedScored.map((r) => r.information)) : null,
    proposed: chosen.length,
    proposed_readable: readableCount(propCover),
    proposed_info: chosen.length ? Math.max(...chosen.map((r) => r.information)) : null,
    shipped_ids: shippedIds,
    proposed_photos: chosen.map((c) => ({
      photo_id: c.photo_id, observation_id: c.observation_id, quality_grade: c.quality_grade,
      ...Object.fromEntries(PART_KEYS.map((k) => [k, c[k]])), information: c.information,
      url: meta.get(c.photo_id)?.url, license: meta.get(c.photo_id)?.license, attribution: meta.get(c.photo_id)?.attribution,
      subject_fraction: located.get(c.photo_id)?.subject_fraction ?? null,
    })),
    shipped_cover: shippedCover, proposed_cover: propCover,
  });
}

results.sort((a, b) => (b.proposed_readable - (b.shipped_readable ?? 0)) - (a.proposed_readable - (a.shipped_readable ?? 0)));
writeFileSync(path.join(OUT, 'coverage-proposals.json'), JSON.stringify({ slots: SLOTS, readable: READABLE, results }, null, 2));

const comparable = results.filter((r) => r.shipped_scored > 0);
const improved = comparable.filter((r) => r.proposed_readable > r.shipped_readable);
const same = comparable.filter((r) => r.proposed_readable === r.shipped_readable);
const worse = comparable.filter((r) => r.proposed_readable < r.shipped_readable);
const sizes = results.map((r) => r.proposed);

console.log(`${results.length} species with scored candidates\n`);
console.log(`  comparable (shipped photos also scored): ${comparable.length}`);
console.log(`    coverage IMPROVED: ${improved.length}`);
console.log(`    unchanged:         ${same.length}`);
console.log(`    WORSE:             ${worse.length}`);
console.log(`\n  proposed set size: ${sizes.filter((s) => s === 1).length} species get 1, ` +
  `${sizes.filter((s) => s === 2).length} get 2, ${sizes.filter((s) => s === 3).length} get 3, ` +
  `${sizes.filter((s) => s > 3).length} get 4+`);
console.log(`  mean proposed ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)} vs mean shipped ${(results.reduce((a, r) => a + r.shipped, 0) / results.length).toFixed(1)}`);
const rc = results.map((r) => r.proposed_readable);
console.log(`  parts readable in proposed sets: mean ${(rc.reduce((a, b) => a + b, 0) / rc.length).toFixed(1)}/5, ` +
  `${rc.filter((x) => x === 5).length} species reach 5/5`);
console.log('\n  biggest improvements:');
for (const r of improved.slice(0, 8)) {
  console.log(`    ${r.species.padEnd(28).slice(0, 28)} ${r.shipped_readable}/5 -> ${r.proposed_readable}/5   ${r.shipped} -> ${r.proposed} photos   (${r.candidates} candidates)`);
}
