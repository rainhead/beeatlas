#!/usr/bin/env node
/**
 * Score view classification against blind human labels.
 *
 *   node scripts/photo-pipeline/score-views.mjs ~/Downloads/view-labels.json
 *
 * EVERY METRIC IS PRINTED NEXT TO ITS FREE BASELINE. beeatlas-zd7 is the standing lesson:
 * a plausible CV signal matched Peter 3 times in 6, which sounds like 50% until you notice
 * that guessing would also have got 50%. A raw accuracy number cannot tell you whether a
 * signal is doing any work.
 *
 * The baseline here is "always predict the most common class in the truth set" -- computed
 * from the human labels, so it is the score a model gets for learning nothing but the prior.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, slateSlots } from './config.mjs';

const file = process.argv[2];
const predsFlag = (() => { const i = process.argv.indexOf('--preds'); return i === -1 ? 'view-qwen_qwen3-vl-235b-a22b-instruct.jsonl' : process.argv[i + 1]; })();
if (!file) { console.error('usage: score-views.mjs <view-labels.json>'); process.exit(1); }

const truth = new Map(JSON.parse(readFileSync(file, 'utf8')).labels.map((l) => [l.photo_id, l]));
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const preds = new Map(readJsonl(path.join(OUT, predsFlag))
  .filter((r) => !r.error).map((r) => [r.photo_id, r]));

const ids = [...truth.keys()].filter((id) => preds.has(id));
const pct = (x) => (x * 100).toFixed(0) + '%';

function scoreAxis(name, getTruth, getPred) {
  const vals = ids.map((id) => [getTruth(truth.get(id)), getPred(preds.get(id))]);
  const counts = {};
  for (const [t] of vals) counts[t] = (counts[t] ?? 0) + 1;
  const [topClass, topN] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const baseline = topN / vals.length;
  const hits = vals.filter(([t, p]) => t === p).length;
  const acc = hits / vals.length;

  console.log(`\n${name.toUpperCase()}`);
  console.log(`  accuracy ${hits}/${vals.length} = ${pct(acc)}`);
  console.log(`  baseline (always "${topClass}") = ${pct(baseline)}   lift ${acc - baseline >= 0 ? '+' : ''}${((acc - baseline) * 100).toFixed(0)} pts`);

  const conf = {};
  for (const [t, p] of vals) if (t !== p) conf[`${t} -> ${p}`] = (conf[`${t} -> ${p}`] ?? 0) + 1;
  const sorted = Object.entries(conf).sort((a, b) => b[1] - a[1]);
  if (sorted.length) {
    console.log('  misses (truth -> model):');
    for (const [k, n] of sorted) console.log(`    ${String(n).padStart(3)}  ${k}`);
  }
  return { acc, baseline };
}

console.log(`Scored against ${ids.length} blind human labels\n${'='.repeat(60)}`);

scoreAxis('angle', (t) => t.angle, (p) => p.angle);
scoreAxis('subject', (t) => t.subject, (p) => p.subject);
scoreAxis('wing venation', (t) => String(t.wing_venation_traceable), (p) => String(p.wing_venation_traceable));

// ---- what actually matters: does the derived slate slot come out right? ----
console.log(`\n${'='.repeat(60)}\nSLATE SLOTS (derived from angle + subject + venation)\n`);
let tp = 0, fp = 0, fn = 0, exact = 0;
for (const id of ids) {
  const t = new Set(slateSlots({ angle: truth.get(id).angle, subject: truth.get(id).subject, wing_venation_traceable: truth.get(id).wing_venation_traceable }));
  const p = new Set(preds.get(id).slots ?? []);
  for (const s of p) (t.has(s) ? tp++ : fp++);
  for (const s of t) if (!p.has(s)) fn++;
  if (t.size === p.size && [...t].every((s) => p.has(s))) exact++;
}
const prec = tp / (tp + fp), rec = tp / (tp + fn);
console.log(`  exact set match: ${exact}/${ids.length} = ${pct(exact / ids.length)}`);
console.log(`  micro precision ${pct(prec)}  recall ${pct(rec)}  F1 ${pct(2 * prec * rec / (prec + rec))}`);
console.log(`  tp ${tp}  fp ${fp}  fn ${fn}`);

const perSlot = {};
for (const id of ids) {
  const t = new Set(slateSlots(truth.get(id).angle ? { angle: truth.get(id).angle, subject: truth.get(id).subject, wing_venation_traceable: truth.get(id).wing_venation_traceable } : null));
  const p = new Set(preds.get(id).slots ?? []);
  for (const s of new Set([...t, ...p])) {
    perSlot[s] ??= { t: 0, p: 0, hit: 0 };
    if (t.has(s)) perSlot[s].t++;
    if (p.has(s)) perSlot[s].p++;
    if (t.has(s) && p.has(s)) perSlot[s].hit++;
  }
}
console.log('\n  per slot        truth  model  correct');
for (const [s, v] of Object.entries(perSlot)) {
  console.log(`    ${s.padEnd(16)}${String(v.t).padStart(4)}${String(v.p).padStart(7)}${String(v.hit).padStart(9)}`);
}
