#!/usr/bin/env node
/**
 * Benchmark a candidate model against results we already trust.
 *
 *   node scripts/photo-pipeline/benchmark-model.mjs --model qwen3-vl-8b-instruct [--n 20]
 *
 * Compares speed AND agreement against the existing locate run, on the SAME photos. The
 * reference numbers already exist, so this costs minutes and answers the only two
 * questions that matter: is it faster, and does it say the same thing?
 *
 * NOTE ON QUANTIZATION: a Q4_K_M GGUF and a 4-bit MLX build are different quantizations of
 * the same weights, so small per-photo differences are EXPECTED and are not evidence of
 * breakage. What would disqualify a candidate is systematic drift -- boxes consistently
 * looser or tighter, or the no-bee cases changing -- not scatter.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, resolveProvider, LOCATE_PROMPT, LOCATE_SCHEMA, mergeBoxes, boxArea } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', 'qwen3-vl-8b-instruct');
const N = Number(flag('n', 20));
const REF = flag('ref', 'locate-qwen3-vl-8b-instruct-mlx.jsonl');
const provider = resolveProvider(flag('provider', 'local'), MODEL);
let spend = 0;

const ref = readFileSync(path.join(OUT, REF), 'utf8').split('\n').filter(Boolean)
  .map(JSON.parse).filter((r) => !r.error);
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));

/**
 * Spread the sample across the fraction range rather than taking the first N. A benchmark
 * drawn only from easy frame-filling photos would agree beautifully and tell us nothing
 * about the specks, which are exactly where a weaker quantization would fail first.
 */
const sorted = ref.filter((r) => pool.has(r.photo_id)).sort((a, b) => (a.subject_fraction ?? 0) - (b.subject_fraction ?? 0));
const sample = Array.from({ length: N }, (_, i) => sorted[Math.floor((i * (sorted.length - 1)) / (N - 1))]);

console.log(`${MODEL} vs ${REF}, ${sample.length} photos spanning the fraction range\n`);
console.log('photo         ref%    new%   diff   ref/new bees   sec');

const rows = [];
for (const r of sample) {
  const photo = pool.get(r.photo_id);
  const t0 = Date.now();
  let bees = null, error = null;
  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: provider.headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: [
          { type: 'text', text: LOCATE_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(photo.small_path).toString('base64')}` } },
        ] }],
        response_format: { type: 'json_schema', json_schema: { name: 'bee_boxes', strict: true, schema: LOCATE_SCHEMA } },
        temperature: 0,
        max_tokens: 1200,
        ...provider.extraBody,
      }),
    });
    if (!res.ok) error = `HTTP ${res.status}`;
    else {
      const j = await res.json();
      spend += Number(j.usage?.cost ?? 0);
      const c = j.choices?.[0]?.message?.content ?? '';
      bees = c.trim() ? mergeBoxes(JSON.parse(c).bees).map((b) => ({ ...b, fraction: boxArea(b) })).sort((a, b) => b.fraction - a.fraction) : [];
    }
  } catch (e) { error = String(e).slice(0, 60); }

  const secs = (Date.now() - t0) / 1000;
  const refF = (r.subject_fraction ?? 0) * 100;
  const newF = bees?.length ? bees[0].fraction * 100 : 0;
  rows.push({ id: r.photo_id, refF, newF, refN: r.bees.length, newN: bees?.length ?? -1, secs, error });

  console.log(
    `${String(r.photo_id).padEnd(12)} ${refF.toFixed(1).padStart(5)}  ${error ? 'ERROR' : newF.toFixed(1).padStart(5)}  ` +
    `${error ? '' : (newF - refF >= 0 ? '+' : '') + (newF - refF).toFixed(1).padStart(5)}   ${r.bees.length}/${bees?.length ?? '?'}          ${secs.toFixed(1)}`
  );
}

const ok = rows.filter((r) => !r.error);
const meanSec = ok.reduce((a, r) => a + r.secs, 0) / ok.length;
const diffs = ok.map((r) => r.newF - r.refF);
const absMean = diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length;
const bias = diffs.reduce((a, d) => a + d, 0) / diffs.length;
const beeAgree = ok.filter((r) => r.refN === r.newN).length;
const noBeeChanged = ok.filter((r) => (r.refN === 0) !== (r.newN === 0)).length;

console.log(`\n  ${ok.length}/${rows.length} succeeded`);
if (spend) console.log(`  cost: $${spend.toFixed(4)} for ${rows.length} photos`);
console.log(`  speed: ${meanSec.toFixed(1)}s/image  (reference MLX run: 12.2s)`);
console.log(`  agreement: mean |diff| ${absMean.toFixed(1)} pts, BIAS ${bias >= 0 ? '+' : ''}${bias.toFixed(1)} pts`);
console.log(`  bee-count agreement: ${beeAgree}/${ok.length}; no-bee verdict flipped on ${noBeeChanged}`);
console.log(`\n  Bias near zero = same answers, different scatter (fine, different quantization).`);
console.log(`  Large bias, or flipped no-bee verdicts = systematic drift; do not adopt.`);
