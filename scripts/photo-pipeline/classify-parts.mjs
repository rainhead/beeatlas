#!/usr/bin/env node
/**
 * Score how well each body part is shown, 0-3 per part.
 *
 *   node scripts/photo-pipeline/classify-parts.mjs --provider openrouter \
 *     --model qwen/qwen3-vl-235b-a22b-instruct --n 25
 *
 * Runs on a PREFIX of the existing view sample, so Peter's angle labels for the same
 * photos stay usable and the two measurements describe one set of images.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, DEFAULT_MODEL, resolveProvider, PARTS_PROMPT, PARTS_SCHEMA, PART_KEYS, informationScore } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', DEFAULT_MODEL);
const PROVIDER = flag('provider', 'local');
const N = Number(flag('n', 25));
const provider = resolveProvider(PROVIDER, MODEL);
const JSONL = path.join(OUT, `parts-${MODEL.replace(/[/\\]/g, '_')}.jsonl`);

const readJsonl = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const sampleIds = JSON.parse(readFileSync(path.join(OUT, 'view-sample.json'), 'utf8')).slice(0, N);
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));
const done = new Set(readJsonl(JSONL).map((r) => r.photo_id));
const todo = sampleIds.filter((id) => pool.has(id) && !done.has(id));
console.log(`${sampleIds.length} photos, ${todo.length} to score — ${MODEL} via ${PROVIDER}\n`);

let n = 0, spend = 0, cursor = 0;

async function scoreOne(id) {
  const photo = pool.get(id);
  let parsed = null, error = null, cost = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(provider.url, {
        method: 'POST', headers: provider.headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: PARTS_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(photo.small_path).toString('base64')}` } },
          ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'parts', strict: true, schema: PARTS_SCHEMA } },
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
  return { row: { photo_id: id, species: photo.species, ...(parsed ?? {}), information: informationScore(parsed), error }, cost };
}

async function worker() {
  while (cursor < todo.length) {
    const id = todo[cursor++];
    const { row, cost } = await scoreOne(id);
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    spend += cost; n++;
    console.log(`${String(n).padStart(3)}/${todo.length} ${id} ${row.error ? 'ERROR' : PART_KEYS.map((k) => `${k[0]}${row[k]}`).join(' ') + `  info ${row.information}/15`}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, provider.concurrency) }, worker));

const all = readJsonl(JSONL).filter((r) => sampleIds.includes(r.photo_id) && !r.error);
console.log(`\n${all.length} scored${spend ? `, $${spend.toFixed(4)}` : ''}`);
for (const k of PART_KEYS) {
  const dist = [0, 1, 2, 3].map((v) => all.filter((r) => r[k] === v).length);
  console.log(`  ${k.padEnd(8)} 0:${dist[0]}  1:${dist[1]}  2:${dist[2]}  3:${dist[3]}`);
}
const info = all.map((r) => r.information).sort((a, b) => a - b);
console.log(`  information score: min ${info[0]}, median ${info[Math.floor(info.length / 2)]}, max ${info[info.length - 1]} (of 15)`);
