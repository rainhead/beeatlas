#!/usr/bin/env node
/**
 * Classify photos by view, and map them onto slate slots.
 *
 *   node scripts/photo-pipeline/classify-view.mjs --provider openrouter \
 *     --model qwen/qwen3-vl-235b-a22b-instruct --sample 50
 *
 * This is the GATE for coverage-based selection: if the machine cannot tell lateral from
 * dorsal reliably, filling a slate cannot work, and it is much cheaper to learn that now.
 *
 * SAMPLING. Mostly random, so accuracy is measured on the real distribution rather than on
 * easy cases -- but topped up from photos the framing pass called MACRO, because detail
 * views are where the subject axis and wing-venation judgement actually get exercised and
 * a purely random draw would contain almost none.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, IMAGES, DEFAULT_MODEL, resolveProvider, VIEW_PROMPT, VIEW_SCHEMA, slateSlots } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', DEFAULT_MODEL);
const PROVIDER = flag('provider', 'local');
const SAMPLE = Number(flag('sample', 50));
const SEED = Number(flag('seed', 20260808));
const provider = resolveProvider(PROVIDER, MODEL);
const TAG = flag('tag', '');
const SLUG = MODEL.replace(/[/\\]/g, '_') + (TAG ? `-${TAG}` : '');
const JSONL = path.join(OUT, `view-${SLUG}.jsonl`);

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const pool = JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8'))
  .filter((p) => existsSync(p.small_path));

const readJsonl = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const framingFile = ['framing-qwen_qwen3-vl-235b-a22b-instruct.jsonl'].map((f) => path.join(OUT, f)).find(existsSync);
const macros = new Set(readJsonl(framingFile).filter((r) => r.shows_whole_bee === false).map((r) => r.photo_id));

const random = rng(SEED);
const shuffled = [...pool];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const nMacro = Math.min(Math.round(SAMPLE * 0.2), macros.size);
const macroPicks = shuffled.filter((p) => macros.has(p.photo_id)).slice(0, nMacro);
const rest = shuffled.filter((p) => !macroPicks.includes(p)).slice(0, SAMPLE - macroPicks.length);
const sample = [...macroPicks, ...rest];

const done = new Set(readJsonl(JSONL).map((r) => r.photo_id));
const todo = sample.filter((p) => !done.has(p.photo_id));
console.log(`sample ${sample.length} (${macroPicks.length} macro-enriched, ${rest.length} random), ${todo.length} to classify`);
console.log(`${MODEL} via ${PROVIDER}\n`);

let n = 0, spend = 0, cursor = 0;

async function classifyOne(photo) {
  let parsed = null, error = null, cost = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(provider.url, {
        method: 'POST', headers: provider.headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: VIEW_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(photo.small_path).toString('base64')}` } },
          ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'view', strict: true, schema: VIEW_SCHEMA } },
          temperature: 0, max_tokens: 700, ...provider.extraBody,
        }),
      });
      if (!res.ok) { error = `HTTP ${res.status}`; if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; } break; }
      const j = await res.json();
      cost = Number(j.usage?.cost ?? 0);
      const c = j.choices?.[0]?.message?.content ?? '';
      if (!c.trim()) { error = 'empty content'; break; }
      parsed = JSON.parse(c); error = null; break;
    } catch (e) { error = String(e).slice(0, 140); await new Promise((r) => setTimeout(r, 1500 * attempt)); }
  }
  return { row: { photo_id: photo.photo_id, species: photo.species, ...(parsed ?? {}), slots: slateSlots(parsed), error }, cost };
}

async function worker() {
  while (cursor < todo.length) {
    const photo = todo[cursor++];
    const { row, cost } = await classifyOne(photo);
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    spend += cost; n++;
    console.log(`${String(n).padStart(3)}/${todo.length} ${photo.photo_id} ${row.error ? 'ERROR' : `${row.angle}/${row.subject}${row.wing_venation_traceable ? '/venation' : ''} -> [${row.slots.join(', ')}]`}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, provider.concurrency) }, worker));

const all = readJsonl(JSONL).filter((r) => sample.some((p) => p.photo_id === r.photo_id));
const ok = all.filter((r) => !r.error);
const tally = (key) => ok.reduce((a, r) => (a[r[key]] = (a[r[key]] ?? 0) + 1, a), {});
console.log(`\n${ok.length} classified, ${all.length - ok.length} errored${spend ? `, $${spend.toFixed(4)}` : ''}`);
console.log('  angle:  ', JSON.stringify(tally('angle')));
console.log('  subject:', JSON.stringify(tally('subject')));
console.log('  venation traceable:', ok.filter((r) => r.wing_venation_traceable).length);
const slotCount = {};
for (const r of ok) for (const s of r.slots) slotCount[s] = (slotCount[s] ?? 0) + 1;
console.log('  slate slots filled:', JSON.stringify(slotCount));
console.log(`  photos filling NO slot: ${ok.filter((r) => !r.slots.length).length}`);
writeFileSync(path.join(OUT, 'view-sample.json'), JSON.stringify(sample.map((p) => p.photo_id), null, 2));
