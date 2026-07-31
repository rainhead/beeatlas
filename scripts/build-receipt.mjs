#!/usr/bin/env node
/**
 * build-receipt.mjs — the precondition for a SCOPED render (beeatlas-4oa).
 *
 *   node scripts/build-receipt.mjs --write   # after a successful full `npm run build`
 *   node scripts/build-receipt.mjs --check   # before a scoped render; exit 0 = allowed
 *
 * A scoped render writes a handful of species pages ADDITIVELY over whatever is
 * already in `_site` and publishes the lot. That is only sound if `_site` is the
 * complete output of a full build of the CURRENT inputs — otherwise the pages it
 * does NOT re-render are stale, or missing, and the publish ships them anyway.
 * Nothing about `_site` says so on its own, so a full build leaves a receipt and a
 * scoped render refuses unless the receipt still describes the world.
 *
 * This is deliberately the same shape as Stelis's `prior-complete-build?` (st-243),
 * which gates its own partial rebuilds: a targeted run may only merge into a tree
 * that MATCHES the last clean run's receipt, never merely one that exists.
 *
 * Four components, each answering a way the precondition can break:
 *
 *   render  — content hash of everything Eleventy reads to make HTML (templates,
 *             layouts, includes, _data, lib/, src/, and the configs). If any of it
 *             moved, every page could have changed, so re-rendering three of them
 *             would publish 1687 stale ones. Includes src/ deliberately: eleventy
 *             imports from src/lib/ directly, and a src/ change means the bundle
 *             needs deploying, which is a full build's job.
 *   vite    — content hash of the stashed manifest. The un-rendered pages carry
 *             hashed asset URLs read from it; a manifest that moved without those
 *             pages being re-rendered means the site points at assets it no longer
 *             has.
 *   data    — (path, size, mtime) of the build data dir, EXCLUDING notes/. Notes
 *             are what a note publish is allowed to change; anything else moving
 *             means the data build produced new artifacts and every page is suspect.
 *             Stat, not content: occurrences.db is large, this runs on every note
 *             write, and a false mismatch costs one full build while a false match
 *             would publish stale pages. Cheap in the safe direction.
 *   site    — hash of the sorted list of _site's relative paths (paths only, not
 *             contents — the contents are exactly what a scoped render changes).
 *             This is the one that catches the nastiest case: `npm run build`
 *             empties _site via build:app and then FAILS, leaving a partial tree
 *             under a receipt whose input components all still match.
 *
 * --check prints the first component that differs, so a publish log says WHY it
 * fell back to a full build rather than just that it did.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { MANIFEST_PATH } from '../lib/vite-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = join(ROOT, '.cache', 'beeatlas-build', 'receipt.json');

// Everything Eleventy reads to produce HTML. Paths relative to the repo root; a
// missing one is simply absent from the digest (a deleted template is a change).
const RENDER_INPUTS = [
  '_pages', '_layouts', '_includes', '_data', 'lib', 'src',
  'eleventy.config.js', 'vite.config.ts', 'vite.sw.config.ts',
];

/** Every file under `path` (or the file itself), as repo-relative paths, sorted. */
function walk(path, base) {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (!st.isDirectory()) return [relative(base, path)];
  return readdirSync(path, { withFileTypes: true })
    .flatMap(e => walk(join(path, e.name), base))
    .sort();
}

const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Content digest: (relpath, sha(bytes)) over every file, order-independent. */
function contentDigest(paths, base) {
  const h = createHash('sha256');
  for (const p of paths.sort()) {
    h.update(p);
    h.update(createHash('sha256').update(readFileSync(join(base, p))).digest());
  }
  return h.digest('hex').slice(0, 16);
}

/** Stat digest: (relpath, size, mtimeMs). Cheap; changes conservatively. */
function statDigest(paths, base) {
  const h = createHash('sha256');
  for (const p of paths.sort()) {
    const st = statSync(join(base, p));
    h.update(`${p}\0${st.size}\0${st.mtimeMs}\n`);
  }
  return h.digest('hex').slice(0, 16);
}

function fingerprint() {
  const dataDir = buildDataDir(ROOT);
  const siteDir = join(ROOT, '_site');
  const manifestPath = join(ROOT, MANIFEST_PATH);

  const renderPaths = RENDER_INPUTS.flatMap(p => walk(join(ROOT, p), ROOT));
  // notes/ is the one thing a note publish is ALLOWED to have changed.
  const dataPaths = walk(dataDir, dataDir).filter(p => !p.startsWith('notes/') && p !== 'notes');
  const sitePaths = walk(siteDir, siteDir);

  return {
    render: contentDigest(renderPaths, ROOT),
    vite: existsSync(manifestPath) ? sha(readFileSync(manifestPath)) : 'absent',
    data: statDigest(dataPaths, dataDir),
    // paths only: their CONTENTS are what a scoped render legitimately rewrites.
    site: sha(sitePaths.join('\n')),
    siteFiles: sitePaths.length,
  };
}

const mode = process.argv[2];

if (mode === '--write') {
  const fp = fingerprint();
  mkdirSync(dirname(RECEIPT), { recursive: true });
  // generated_at for a human reading the file; never compared.
  writeFileSync(RECEIPT, JSON.stringify({ ...fp, at: new Date().toISOString() }, null, 2) + '\n');
  console.log(`build receipt written (${fp.siteFiles} files in _site) → ${relative(ROOT, RECEIPT)}`);
} else if (mode === '--check') {
  if (!existsSync(RECEIPT)) {
    console.error('no build receipt — no full build has been recorded here');
    process.exit(1);
  }
  const want = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const got = fingerprint();
  for (const k of ['render', 'vite', 'data', 'site']) {
    if (want[k] !== got[k]) {
      console.error(`build receipt stale: ${k} changed since the last full build (${want[k]} → ${got[k]})`);
      process.exit(1);
    }
  }
  console.log(`build receipt current (${got.siteFiles} files in _site)`);
} else {
  console.error('usage: build-receipt.mjs --write | --check');
  process.exit(2);
}
