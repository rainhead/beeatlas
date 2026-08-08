#!/usr/bin/env node
/**
 * Classify photos as WHOLE BEE or MACRO (part of one, cropped by the frame).
 *
 *   node scripts/photo-pipeline/classify-framing.mjs --provider openrouter \
 *     --model qwen/qwen3-vl-235b-a22b-instruct [--ids <file>] [--swaps]
 *
 * Serves the product rule: a species page's first photo or two should show the WHOLE bee;
 * macros of diagnostic structures are valuable but belong later in the order.
 *
 * Subject fraction cannot answer this, because it is NON-MONOTONIC with usefulness -- low
 * means a speck, middling means a good habitus shot, and very high often means a cropped
 * close-up whose box fills the frame precisely because the bee runs off it. That is why
 * the swap list currently proposes macro-for-macro trades.
 *
 * Asks two CONCRETE questions and DERIVES the binary in code. Asking directly for
 * "whole-animal vs part-closeup" was tested and FAILED its control, calling an entire bee
 * at 81.8% of frame a part-closeup. The concrete form scored 8/8 on hand-checked cases,
 * with cut_off_by_frame doing all the work. Deriving rather than asking also means a wrong
 * answer can be traced to which sub-judgement failed.
 *
 * --swaps classifies BOTH SIDES of every qualifying proposal in out/swaps.json, which is
 * the minimum set needed to stop bad swaps -- a few hundred photos rather than thousands.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, IMAGES, DEFAULT_MODEL, resolveProvider, FRAMING_PROMPT, FRAMING_SCHEMA, isWholeBee } from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', DEFAULT_MODEL);
const PROVIDER = flag('provider', 'local');
const provider = resolveProvider(PROVIDER, MODEL);
const WORKERS = Number(flag('concurrency', 0)) || provider.concurrency;
const SLUG = MODEL.replace(/[/\\]/g, '_');
const JSONL = path.join(OUT, `framing-${SLUG}.jsonl`);

let ids = [];
if (process.argv.includes('--swaps')) {
  const s = JSON.parse(readFileSync(path.join(OUT, 'swaps.json'), 'utf8'));
  const set = new Set();
  for (const p of s.proposals.filter((p) => p.qualifies)) {
    set.add(p.current_photo_id);
    set.add(p.best_sibling_photo_id);
  }
  ids = [...set].map(String);
} else {
  ids = readFileSync(path.join(OUT, flag('ids', 'classify-ids.txt')), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}

const done = new Set();
if (existsSync(JSONL)) {
  for (const l of readFileSync(JSONL, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { done.add(String(JSON.parse(l).photo_id)); } catch {}
  }
}
const todo = ids.filter((id) => !done.has(id) && existsSync(path.join(IMAGES, `${id}-512.jpg`)));
console.log(`${ids.length} ids, ${done.size} done, ${todo.length} to go — ${MODEL} via ${PROVIDER}, ${WORKERS} worker(s)\n`);

let n = 0, spend = 0, cursor = 0;

async function classifyOne(id) {
  const img = path.join(IMAGES, `${id}-512.jpg`);
  const t0 = Date.now();
  let parsed = null, error = null, cost = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: provider.headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: FRAMING_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(img).toString('base64')}` } },
          ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'framing', strict: true, schema: FRAMING_SCHEMA } },
          temperature: 0,
          max_tokens: 700,
          ...provider.extraBody,
        }),
      });
      if (!res.ok) {
        error = `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
        break;
      }
      const j = await res.json();
      cost = Number(j.usage?.cost ?? 0);
      const c = j.choices?.[0]?.message?.content ?? '';
      if (!c.trim()) { error = 'empty content'; break; }
      parsed = JSON.parse(c);
      error = null;
      break;
    } catch (e) {
      error = String(e).slice(0, 140);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  return {
    row: {
      photo_id: Number(id),
      cut_off_by_frame: parsed?.cut_off_by_frame ?? null,
      parts_fully_visible: parsed?.parts_fully_visible ?? null,
      shows_whole_bee: isWholeBee(parsed),
      seconds: (Date.now() - t0) / 1000,
      error,
    },
    cost,
  };
}

async function worker() {
  while (cursor < todo.length) {
    const id = todo[cursor++];
    const { row, cost } = await classifyOne(id);
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    spend += cost;
    n++;
    console.log(`${String(n).padStart(4)}/${todo.length} ${id} ${row.error ? 'ERROR ' + row.error : (row.shows_whole_bee ? 'WHOLE' : 'macro')}${spend ? `  $${spend.toFixed(4)}` : ''}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, worker));

const all = readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const ok = all.filter((r) => !r.error);
console.log(`\n${all.length} classified, ${all.length - ok.length} errored`);
console.log(`  whole bee: ${ok.filter((r) => r.shows_whole_bee).length}   macro: ${ok.filter((r) => r.shows_whole_bee === false).length}`);
if (spend) console.log(`  spend: $${spend.toFixed(4)}`);
