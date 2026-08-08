#!/usr/bin/env node
/**
 * Find the bee: one box per bee, per photo.
 *
 *   node scripts/photo-pipeline/locate.mjs [--model <id>] [--pool pool.json] [--tag <name>]
 *
 * The box is both deliverables at once: a rectangle to CLIP to, and its area as the
 * candidate SCORE for choosing between photos of a species.
 *
 * CRASH-SAFE AND RESUMABLE. Rows append to JSONL, flushed per photo, and the append
 * happens BEFORE the progress line prints -- so anything the log claims is already on
 * disk. An earlier version accumulated in memory and wrote once at the end; it was killed
 * at photo 252 of 1,088 and lost every coordinate while its log showed 252 successful
 * lines. Restarting skips whatever is already in the JSONL.
 *
 * Boxes are MERGED inline: one bee returned as two boxes hit 2% of photos and is a no-op
 * on the rest, so nothing downstream should ever see raw boxes. raw_box_count is recorded
 * so how often it fires stays measurable.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  OUT, DEFAULT_MODEL, resolveProvider,
  LOCATE_PROMPT, LOCATE_SCHEMA, mergeBoxes, boxArea, edgesTouched,
} from './config.mjs';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODEL = flag('model', DEFAULT_MODEL);
const POOL_FILE = flag('pool', 'pool.json');
const TAG = flag('tag', '');
const LIMIT = Number(flag('limit', Infinity));
const PROVIDER = flag('provider', 'local');
const CONCURRENCY = Number(flag('concurrency', 0)) || null;

const provider = resolveProvider(PROVIDER, MODEL);
const WORKERS = CONCURRENCY ?? provider.concurrency;

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const SLUG = MODEL.replace(/[/\\]/g, '_') + (TAG ? `-${TAG}` : '');
const JSONL = path.join(OUT, `locate-${SLUG}.jsonl`);

const raw = JSON.parse(readFileSync(path.join(OUT, POOL_FILE), 'utf8'));
const seen = new Set();
const pool = raw.filter((p) => (seen.has(p.photo_id) ? false : (seen.add(p.photo_id), true)));

const done = new Set();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    // A truncated final line is expected after a kill mid-write; drop it.
    try { done.add(JSON.parse(line).photo_id); } catch {}
  }
}

const todo = pool.filter((p) => !done.has(p.photo_id)).slice(0, LIMIT);
console.log(`${pool.length} unique photos, ${done.size} already done, ${todo.length} to go`);

let n = 0;
let spend = 0;
const started = Date.now();

async function locateOne(photo) {
  const t0 = Date.now();
  let parsed = null;
  let error = null;
  let cost = 0;

  // Retry transient failures. A hosted endpoint will occasionally 429 or drop, and one
  // blip must not put a hole in a 3,000-photo run that only a rescan would find.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const b64 = readFileSync(photo.small_path).toString('base64');
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: provider.headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: LOCATE_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ] }],
          response_format: { type: 'json_schema', json_schema: { name: 'bee_boxes', strict: true, schema: LOCATE_SCHEMA } },
          temperature: 0,
          // Generous on purpose: a model that spends its budget reasoning returns EMPTY
          // content with no error, which is indistinguishable from a dead endpoint.
          max_tokens: 1200,
          ...provider.extraBody,
        }),
      });
      if (!res.ok) {
        error = `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
        break;
      }
      const json = await res.json();
      cost = Number(json.usage?.cost ?? 0);
      const content = json.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) { error = 'empty content'; break; }
      parsed = JSON.parse(content);
      error = null;
      break;
    } catch (e) {
      error = String(e).slice(0, 160);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  const rawBoxes = parsed?.bees ?? [];
  const bees = mergeBoxes(rawBoxes)
    .map((b) => ({ ...b, fraction: boxArea(b), edges: edgesTouched(b) }))
    .sort((a, b) => b.fraction - a.fraction);

  return {
    row: {
      photo_id: photo.photo_id,
      species: photo.species,
      raw_box_count: rawBoxes.length,
      bees,
      subject_fraction: bees[0]?.fraction ?? null,
      seconds: (Date.now() - t0) / 1000,
      error,
    },
    cost,
  };
}

/**
 * Fixed pool of workers pulling from a shared cursor. Appends stay per-photo and happen
 * BEFORE the progress line, so the log never claims more than is on disk -- the property
 * that makes a killed run resumable rather than a loss.
 */
let cursor = 0;
async function worker() {
  while (cursor < todo.length) {
    const photo = todo[cursor++];
    const { row, cost } = await locateOne(photo);
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    spend += cost;
    n++;
    const merged = row.raw_box_count > row.bees.length ? ` merged ${row.raw_box_count}->${row.bees.length}` : '';
    console.log(
      `${String(n).padStart(4)}/${todo.length} ${row.seconds.toFixed(1)}s ${photo.photo_id} ` +
      (row.error ? `ERROR ${row.error}` : `${row.bees.length} bee(s) ${((row.subject_fraction ?? 0) * 100).toFixed(1)}%${merged}`) +
      (spend ? `  $${spend.toFixed(4)}` : '')
    );
  }
}

console.log(`provider ${PROVIDER}, model ${MODEL}, ${WORKERS} worker(s)\n`);
await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, worker));

// ---- summary ---------------------------------------------------------------
const all = readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const ok = all.filter((r) => !r.error);
const mean = ok.length ? ok.reduce((a, r) => a + r.seconds, 0) / ok.length : NaN;

writeFileSync(path.join(OUT, `locate-${SLUG}.json`),
  JSON.stringify({ model: MODEL, count: all.length, mean_seconds: mean, results: all }, null, 2));

console.log(`\n${MODEL}: ${all.length} photos, ${all.length - ok.length} errored`);
console.log(`  mean ${mean.toFixed(1)}s/image; this session ${((Date.now() - started) / 60000).toFixed(0)} min`);
console.log(`  needed a merge: ${ok.filter((r) => r.raw_box_count > r.bees.length).length}`);
console.log(`  no bee found:  ${ok.filter((r) => r.bees.length === 0).length}`);
if (spend) console.log(`  spend this session: $${spend.toFixed(4)}`);
