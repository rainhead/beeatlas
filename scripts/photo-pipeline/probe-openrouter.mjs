#!/usr/bin/env node
/**
 * Does a hosted provider actually ENFORCE our JSON schema, and what does it cost?
 *
 *   node scripts/photo-pipeline/probe-openrouter.mjs [--model qwen/qwen3-vl-8b-instruct]
 *
 * Structured output is load-bearing for this pipeline -- it is what stopped GLM emitting
 * prose wrapped in sentinels. Some endpoints ACCEPT response_format and quietly ignore it,
 * which is the exact failure shape that cost a day earlier: a parameter that appears to
 * work because the request succeeds. So this asserts on the RESPONSE, not the status code.
 *
 * Reads OPENROUTER_API_KEY from .env (gitignored). The key is never printed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, OUT, LOCATE_PROMPT, LOCATE_SCHEMA, mergeBoxes, boxArea } from './config.mjs';

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const KEY = env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY not found in .env'); process.exit(1); }

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', 'qwen/qwen3-vl-8b-instruct');

// A photo whose local answer we know, so correctness is checkable and not just well-formedness.
const REF_ID = 217816412; // bee on a daisy; local run gave 1 bee at 19.3%
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));
const photo = pool.get(REF_ID);
if (!photo) { console.error(`photo ${REF_ID} not in pool`); process.exit(1); }

const t0 = Date.now();
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://beeatlas.net',
    'X-Title': 'BeeAtlas photo pipeline',
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: [
      { type: 'text', text: LOCATE_PROMPT },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(photo.small_path).toString('base64')}` } },
    ] }],
    response_format: { type: 'json_schema', json_schema: { name: 'bee_boxes', strict: true, schema: LOCATE_SCHEMA } },
    temperature: 0,
    max_tokens: 1200,
    usage: { include: true },
  }),
});

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (!res.ok) { console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const json = await res.json();
const content = json.choices?.[0]?.message?.content ?? '';

console.log(`model:    ${MODEL}`);
console.log(`latency:  ${secs}s`);
console.log(`usage:    ${JSON.stringify(json.usage ?? {})}`);
console.log(`raw:      ${JSON.stringify(content).slice(0, 180)}`);

// 1. Is it parseable at all, without stripping anything?
let parsed = null;
try { parsed = JSON.parse(content); console.log('parse:    OK — clean JSON, no prose or sentinels'); }
catch { console.log('parse:    FAIL — schema NOT enforced (would need text extraction)'); }

// 2. Does it match the schema we asked for, or merely look like JSON?
if (parsed) {
  const ok = Array.isArray(parsed.bees)
    && parsed.bees.every((b) => ['x0', 'y0', 'x1', 'y1'].every((k) => Number.isInteger(b[k])) && typeof b.in_focus === 'boolean');
  console.log(`schema:   ${ok ? 'CONFORMS' : 'ACCEPTED BUT IGNORED — shape does not match'}`);
  if (ok) {
    const bees = mergeBoxes(parsed.bees).map((b) => ({ ...b, fraction: boxArea(b) })).sort((a, b) => b.fraction - a.fraction);
    console.log(`answer:   ${bees.length} bee(s), largest ${(bees[0]?.fraction * 100 || 0).toFixed(1)}% of frame`);
    console.log(`local:    1 bee, 19.3%  (Hostess/MLX reference for this photo)`);
  }
}
if (json.usage?.cost != null) console.log(`cost:     $${Number(json.usage.cost).toFixed(6)} for this one image`);
