#!/usr/bin/env node
/**
 * Score part-visibility predictions against blind human scores.
 *
 *   node scripts/photo-pipeline/score-parts.mjs ~/Downloads/part-scores.json
 *
 * ORDINAL, so exact agreement is the wrong headline on its own -- off-by-one on a 4-point
 * scale is a different kind of error from off-by-two, and lumping them hides whether the
 * model is roughly right or actually wrong.
 *
 * Baselines, because a number without one says nothing (beeatlas-zd7): the best CONSTANT
 * prediction per part, and for the information score, always predicting its mean.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, PART_KEYS, informationScore } from './config.mjs';

const file = process.argv[2];
const truth = new Map(JSON.parse(readFileSync(file, 'utf8')).scores.map((s) => [s.photo_id, s]));
const preds = new Map(readFileSync(path.join(OUT, 'parts-qwen_qwen3-vl-235b-a22b-instruct.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error).map((r) => [r.photo_id, r]));
const ids = [...truth.keys()].filter((id) => preds.has(id));
const pct = (x) => (x * 100).toFixed(0) + '%';

console.log(`Scored against ${ids.length} blind human-scored photos\n${'='.repeat(64)}`);
console.log('part      exact  within1   bias   best-constant-baseline(exact)');

let allExact = 0, allWithin = 0, allN = 0;
for (const k of PART_KEYS) {
  const pairs = ids.map((id) => [truth.get(id)[k], preds.get(id)[k]]);
  const exact = pairs.filter(([t, p]) => t === p).length;
  const within = pairs.filter(([t, p]) => Math.abs(t - p) <= 1).length;
  const bias = pairs.reduce((a, [t, p]) => a + (p - t), 0) / pairs.length;
  // Best constant: the single score that would match most often.
  const best = [0, 1, 2, 3].map((v) => pairs.filter(([t]) => t === v).length);
  const baseline = Math.max(...best) / pairs.length;
  allExact += exact; allWithin += within; allN += pairs.length;
  console.log(`${k.padEnd(9)} ${pct(exact / pairs.length).padStart(5)} ${pct(within / pairs.length).padStart(8)} ${(bias >= 0 ? '+' : '') + bias.toFixed(2)}   ${pct(baseline)}`);
}
console.log(`${'-'.repeat(64)}\noverall   ${pct(allExact / allN).padStart(5)} ${pct(allWithin / allN).padStart(8)}`);

// ---- information score: the thing that would actually rank candidates ----
const rows = ids.map((id) => ({
  id,
  t: informationScore(truth.get(id)),
  p: preds.get(id).information,
}));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mt = mean(rows.map((r) => r.t)), mp = mean(rows.map((r) => r.p));
const cov = mean(rows.map((r) => (r.t - mt) * (r.p - mp)));
const st = Math.sqrt(mean(rows.map((r) => (r.t - mt) ** 2)));
const sp = Math.sqrt(mean(rows.map((r) => (r.p - mp) ** 2)));
const pearson = cov / (st * sp);

const rank = (a) => { const s = [...a].map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; s.forEach(([, i], k) => r[i] = k); return r; };
const rt = rank(rows.map((r) => r.t)), rp = rank(rows.map((r) => r.p));
const n = rows.length;
const spearman = 1 - (6 * rt.reduce((a, v, i) => a + (v - rp[i]) ** 2, 0)) / (n * (n * n - 1));

console.log(`\n${'='.repeat(64)}\nINFORMATION SCORE (sum of parts, 0-15) — the ranking signal\n`);
console.log(`  human   mean ${mt.toFixed(1)}, spread ${Math.min(...rows.map(r=>r.t))}-${Math.max(...rows.map(r=>r.t))}`);
console.log(`  model   mean ${mp.toFixed(1)}, spread ${Math.min(...rows.map(r=>r.p))}-${Math.max(...rows.map(r=>r.p))}`);
console.log(`  bias    ${(mp - mt >= 0 ? '+' : '') + (mp - mt).toFixed(1)} points`);
console.log(`  Pearson r  ${pearson.toFixed(2)}`);
console.log(`  SPEARMAN   ${spearman.toFixed(2)}   <- what matters for ranking candidates`);
console.log(`\n  mean |error| ${mean(rows.map((r) => Math.abs(r.t - r.p))).toFixed(1)} points of 15`);
