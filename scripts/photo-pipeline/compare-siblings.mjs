#!/usr/bin/env node
/**
 * Compare each shipped weak photo against its scored siblings and propose swaps.
 *
 *   node scripts/photo-pipeline/compare-siblings.mjs [--model <id>]
 *
 * PROPOSES ONLY. Writes out/swaps.json; content/species-photos.toml is never touched.
 * Subject fraction RANKS candidates, it does not judge them -- a bigger bee can still be a
 * worse reference photo. beeatlas-zd7 is the standing lesson about trusting a plausible CV
 * number without a human check.
 *
 * A swap must clear BOTH a ratio and an absolute margin. Ratio alone promotes noise at the
 * bottom (2.0% -> 4.5% is a 2.2x "win" between two unusable photos); absolute alone fires
 * on near-ties.
 *
 * FRAMING-AWARE. Subject fraction is NON-MONOTONIC with usefulness: very low means a speck,
 * middling means a good habitus shot, and very high often means a cropped MACRO whose box
 * fills the frame because the bee runs off it. The first run proposed macro-for-macro
 * trades for exactly this reason. Where framing data exists, a swap that LOSES whole-bee
 * framing is demoted rather than proposed.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OUT, DEFAULT_MODEL, edgesTouched } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', DEFAULT_MODEL);
const SLUG = MODEL.replace(/[/\\]/g, '_');

const MIN_RATIO = 1.5;
const MIN_ABSOLUTE_GAIN = 5;

const readJsonl = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

// The reference run may have been made by a different model than the sibling run (e.g.
// laptop MLX first, then the desktop GGUF). Prefer a matching slug, fall back to the MLX run.
const currentFile = existsSync(path.join(OUT, `locate-${SLUG}.jsonl`))
  ? `locate-${SLUG}.jsonl` : 'locate-qwen3-vl-8b-instruct-mlx.jsonl';
const current = new Map(readJsonl(path.join(OUT, currentFile)).map((r) => [r.photo_id, r]));
const sibScores = new Map(readJsonl(path.join(OUT, `locate-${SLUG}-siblings.jsonl`)).map((r) => [r.photo_id, r]));
/**
 * Framing may come from a DIFFERENT model than the scoring run -- localization is a
 * throughput job (32B) while framing is a judgement job worth spending more on (235B). So
 * accept an explicit --framing-model, else use whichever framing file exists.
 */
const framingModel = flag('framing-model', null);
const framingFile = framingModel
  ? `framing-${framingModel.replace(/[/\\]/g, '_')}.jsonl`
  : (readdirSync(OUT).find((f) => f.startsWith('framing-') && f.endsWith('.jsonl')) ?? `framing-${SLUG}.jsonl`);
const framing = new Map(readJsonl(path.join(OUT, framingFile)).map((r) => [r.photo_id, r]));
const { rows } = JSON.parse(readFileSync(path.join(OUT, 'siblings.json'), 'utf8'));

const proposals = [];
let unscored = 0;

for (const row of rows) {
  const cur = current.get(row.photo_id);
  if (!cur) continue;
  const curFrac = (cur.subject_fraction ?? 0) * 100;

  const scored = row.siblings
    .map((s) => {
      const sc = sibScores.get(s.photo_id);
      if (!sc || sc.error) return null;
      const box = sc.bees?.[0];
      return {
        ...s,
        fraction: (sc.subject_fraction ?? 0) * 100,
        bees: sc.bees.length,
        // 3-4 frame edges is a strong crop signal, computable without the model.
        edges: box ? edgesTouched(box) : null,
        whole: framing.get(s.photo_id)?.shows_whole_bee ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.fraction - a.fraction);

  if (!scored.length) { unscored++; continue; }

  const best = scored[0];
  const ratio = best.fraction / Math.max(curFrac, 0.01);
  const gain = best.fraction - curFrac;
  const curWhole = framing.get(row.photo_id)?.shows_whole_bee ?? null;

  // Only demote on POSITIVE evidence that framing gets worse. Absent framing data both
  // sides are null and this is a no-op, so the pipeline still works before that stage runs.
  const losesWholeBee = curWhole === true && best.whole === false;

  proposals.push({
    species: row.species,
    observation_id: row.observation_id,
    current_photo_id: row.photo_id,
    current_fraction: curFrac,
    current_whole_bee: curWhole,
    best_sibling_photo_id: best.photo_id,
    best_sibling_fraction: best.fraction,
    best_sibling_whole_bee: best.whole,
    best_sibling_edges: best.edges,
    ratio, gain,
    loses_whole_bee: losesWholeBee,
    qualifies: ratio >= MIN_RATIO && gain >= MIN_ABSOLUTE_GAIN && !losesWholeBee,
    // Carried so an apply step needs no second API call. License and attribution are the
    // SIBLING's own -- they can differ between photos of one observation.
    url: best.url, license: best.license, attribution: best.attribution,
    all_siblings: scored.map((s) => ({ photo_id: s.photo_id, fraction: s.fraction, whole: s.whole })),
  });
}

proposals.sort((a, b) => b.gain - a.gain);
const winners = proposals.filter((p) => p.qualifies);
const demoted = proposals.filter((p) => p.loses_whole_bee);

writeFileSync(path.join(OUT, 'swaps.json'), JSON.stringify({
  model: MODEL, reference: currentFile,
  criteria: { MIN_RATIO, MIN_ABSOLUTE_GAIN, framing_aware: framing.size > 0 },
  proposed: winners.length, considered: proposals.length, proposals,
}, null, 2));

console.log(`\ncompared ${proposals.length} shipped photos against scored siblings`);
console.log(`  ${winners.length} qualify (>=${MIN_RATIO}x AND >=+${MIN_ABSOLUTE_GAIN} pts)`);
if (framing.size) console.log(`  framing from ${framingFile} (${framing.size} photos)`);
console.log(`  ${unscored} had no scored sibling yet`);
if (framing.size) console.log(`  ${demoted.length} demoted for losing whole-bee framing`);
else console.log('  framing data absent — run classify-framing.mjs to catch macro-for-macro swaps');
if (winners.length) {
  console.log(`  best +${winners[0].gain.toFixed(1)} pts; median +${winners[Math.floor(winners.length / 2)].gain.toFixed(1)} pts`);
  for (const w of winners.slice(0, 10)) {
    console.log(`    ${w.species.padEnd(28).slice(0, 28)} ${w.current_fraction.toFixed(1)}% -> ${w.best_sibling_fraction.toFixed(1)}%  (${w.ratio.toFixed(1)}x)`);
  }
}
console.log('\nout/swaps.json — PROPOSALS ONLY, content/species-photos.toml untouched');
