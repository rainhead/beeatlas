#!/usr/bin/env node
/**
 * PERF-04 (D-10): HEAD every photo URL in content/species-photos.toml,
 * write failures to data/manifest_drift_report.json. Informational only —
 * exits 0 even when failures exist. NOT in any build chain (mirrors the
 * PHOTO-07 isolation invariant from Phase 79).
 *
 * Pacing: <=1 req/sec (matches scripts/seed-species-photos.mjs).
 * Retry: single retry on HTTP >=500 with 2s backoff (D-10).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const TOML_PATH = join(repoRoot, 'content/species-photos.toml');
const REPORT_PATH = join(repoRoot, 'data/manifest_drift_report.json');

// D-10: <=1 req/sec, single 5xx retry with 2s backoff.
const RATE_MS = 1000;
const RETRY_BACKOFF_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function headOnce(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { ok: res.ok, status: res.status, reason: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, reason: `fetch failed: ${e.message}` };
  }
}

async function checkUrl(url) {
  let result = await headOnce(url);
  // D-10: single retry on HTTP >=500 with 2s backoff. Network errors also retried once.
  const shouldRetry = !result.ok && (result.status === null || result.status >= 500);
  if (shouldRetry) {
    await sleep(RETRY_BACKOFF_MS);
    result = await headOnce(url);
  }
  return result;
}

function loadPhotos() {
  const manifest = TOML.parse(readFileSync(TOML_PATH, 'utf8'));
  const speciesTable = manifest.species ?? {};
  const out = [];
  for (const [name, entry] of Object.entries(speciesTable)) {
    for (const p of entry.photos ?? []) {
      if (typeof p.url === 'string' && p.url) {
        out.push({ scientificName: name, photo_id: p.photo_id, url: p.url });
      }
    }
  }
  return out;
}

async function main() {
  const photos = loadPhotos();
  console.log(`Loaded ${photos.length} photo URLs from ${TOML_PATH}`);
  const failures = [];
  let i = 0;
  for (const p of photos) {
    if (i > 0) await sleep(RATE_MS);
    i++;
    const r = await checkUrl(p.url);
    if (!r.ok) {
      failures.push({
        scientificName: p.scientificName,
        photo_id: p.photo_id,
        url: p.url,
        status: r.status,
        reason: r.reason,
      });
      console.warn(`! ${p.scientificName} ${p.photo_id}: ${r.reason}`);
    }
    if (i % 50 === 0) {
      console.log(`  progress: ${i}/${photos.length} (${failures.length} failures so far)`);
    }
  }
  const report = {
    checked_at: new Date().toISOString(),
    total: photos.length,
    failures,
  };
  const reportDir = dirname(REPORT_PATH);
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote ${REPORT_PATH}: ${failures.length}/${photos.length} failures`);
  // D-10: report-only. Exit 0 even when failures exist.
  process.exit(0);
}

if (fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  main().catch(e => { console.error(`fatal: ${e.message}`); process.exit(0); /* still report-only */ });
}
