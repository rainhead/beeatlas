#!/usr/bin/env node
/**
 * Stage B: score part visibility for every candidate photo.
 *   node scripts/photo-pipeline/score-candidates.mjs [--concurrency 12]
 * Resumable per photo; reports running spend.
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, resolveProvider, PARTS_PROMPT, PARTS_SCHEMA, PART_KEYS, informationScore } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', 'qwen/qwen3-vl-235b-a22b-instruct');
const provider = resolveProvider('openrouter', MODEL);
const WORKERS = Number(flag('concurrency', 12));
const JSONL = path.join(OUT, 'candidate-parts.jsonl');

const photos = JSON.parse(readFileSync(path.join(OUT, 'candidate-photos.json'), 'utf8'))
  .filter((p) => existsSync(p.small_path));
const done = new Set(existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).photo_id; } catch { return null; } })
  : []);
const todo = photos.filter((p) => !done.has(p.photo_id));
console.log(`${photos.length} candidates, ${done.size} scored, ${todo.length} to go — ${WORKERS} workers`);

let n = 0, spend = 0, cursor = 0, errors = 0;
const t0 = Date.now();

async function one(p) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(provider.url, {
        method: 'POST', headers: provider.headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: PARTS_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(p.small_path).toString('base64')}` } },
          ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'parts', strict: true, schema: PARTS_SCHEMA } },
          temperature: 0, max_tokens: 700, ...provider.extraBody,
        }),
      });
      if (!res.ok) { if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; } return { error: `HTTP ${res.status}` }; }
      const j = await res.json();
      const c = j.choices?.[0]?.message?.content ?? '';
      if (!c.trim()) return { error: 'empty' };
      return { parsed: JSON.parse(c), cost: Number(j.usage?.cost ?? 0) };
    } catch (e) { await new Promise((r) => setTimeout(r, 1500 * attempt)); }
  }
  return { error: 'retries exhausted' };
}

async function worker() {
  while (cursor < todo.length) {
    const p = todo[cursor++];
    const { parsed, cost = 0, error } = await one(p);
    if (error) errors++;
    spend += cost;
    appendFileSync(JSONL, JSON.stringify({
      photo_id: p.photo_id, observation_id: p.observation_id, species: p.species,
      quality_grade: p.quality_grade, ...(parsed ?? {}),
      information: parsed ? informationScore(parsed) : null, error: error ?? null,
    }) + '\n');
    if (++n % 250 === 0) {
      const rate = n / ((Date.now() - t0) / 1000);
      console.log(`  ${n}/${todo.length}  $${spend.toFixed(3)}  ${rate.toFixed(1)}/s  eta ${(((todo.length - n) / rate) / 60).toFixed(0)} min  errors ${errors}`);
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`\ndone: ${n} scored, ${errors} errors, $${spend.toFixed(3)}, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
