#!/usr/bin/env node
/**
 * finish-bundle.mjs — make `_site/assets` be EXACTLY what the Vite manifest names.
 *
 * Split out of scripts/build-app.mjs (beeatlas-8df → stelis st-hdm) so that
 * *producing the bundle* and *deciding whether to produce it* are different jobs.
 * The decision is a cache question and is moving to Stelis, which owns
 * content-addressed skipping; this part is not a cache at all. It is the producer
 * finishing its own output, and it has to run on every path that leaves a bundle
 * behind:
 *
 *   - after a real `vite build`. Since beeatlas-8df, Vite no longer empties
 *     `_site` (see vite.config.ts), so a rebuild leaves the OLD hashed chunk
 *     sitting beside the new one. vite-plugin-pwa's `assets/**` glob would
 *     precache both — the unbounded dead-chunk accumulation ADR 0016 fixed once.
 *   - after a REUSED bundle, where nothing was emitted and a stray file from any
 *     earlier state would otherwise survive forever.
 *
 * Two steps, in this order:
 *   1. delete anything under assets/ the manifest does not name, and then any
 *      directory that leaves empty;
 *   2. touch every surviving file, so data/merge-swap.sh's age-prune counts them
 *      as part of THIS publish.
 *
 * Step 2 is the one that looks like decoration and is not. merge-swap does not
 * --delete assets (a cached page may still reference last publish's hashed names);
 * it age-prunes at `-mtime +30`, and its header states the assumption that makes
 * that safe: "new URLs each publish, so nothing stale is ever re-served under a
 * current name". Every real `vite build` used to rewrite these files, so anything
 * still referenced was young. Reuse breaks exactly that: `rsync -a` preserves
 * mtimes, so after 30 days of reuse the prune would delete the live bundle out
 * from under the pages referencing it — nightly, with a green build and a healthy
 * ping, invisible locally because `_site` is intact. If you change either side,
 * change both.
 *
 * Run standalone (`node scripts/finish-bundle.mjs`, which is what `npm run
 * build:bundle` does after Vite) or import `finishBundle()`.
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_PATH } from '../lib/vite-manifest.js';
import { manifestAssetPaths, unnamedAssetPaths } from '../lib/bundle-assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, '_site', 'assets');

/** Every file under `path`, as `base`-relative paths, sorted. */
function walk(path, base) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [relative(base, path)];
  return readdirSync(path, { withFileTypes: true })
    .flatMap(e => walk(join(path, e.name), base))
    .sort();
}

/**
 * Every file the manifest claims the bundle produced, as _site-relative paths.
 *
 * Read fresh rather than through lib/vite-manifest.js's loadManifest, which caches
 * per process: callers run this both before and after `vite build`, and a cached
 * read would describe the pre-build manifest.
 */
export function manifestAssets() {
  return manifestAssetPaths(JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), 'utf8')));
}

/** Depth-first removal of empty directories under `dir` (never `dir` itself). */
function pruneEmptyDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    pruneEmptyDirs(child);
    if (readdirSync(child).length === 0) rmSync(child, { recursive: true, force: true });
  }
}

/**
 * Delete anything in assets/ the manifest does not name.
 *
 * Two details here are easy to get wrong, and ADR 0019 records getting both wrong
 * first. The comparison must be over FULL assets/-relative paths — matching
 * manifest basenames against top-level directory entries yields the keep-entry
 * 'species/index-abc.js' against the directory 'species', deleting the whole
 * directory. And emptied directories must go too, because
 * scripts/validate-bundle-size.mjs tests `existsSync(_site/assets/species/)` BEFORE
 * falling back to the flat `species-*.js` shape, so an empty `species/` routes it
 * down a branch containing no chunks and fails the build. Vite would have left
 * neither.
 */
function pruneUnnamedAssets(named) {
  if (!existsSync(ASSETS)) return 0;
  const unnamed = unnamedAssetPaths(named, walk(ASSETS, ASSETS));
  for (const rel of unnamed) rmSync(join(ASSETS, rel), { force: true });
  pruneEmptyDirs(ASSETS);
  return unnamed.length;
}

/** Mark every surviving asset as part of this publish — see the header. */
function refreshAssetMtimes() {
  const now = new Date();
  let touched = 0;
  for (const rel of walk(ASSETS, ASSETS)) {
    utimesSync(join(ASSETS, rel), now, now);
    touched += 1;
  }
  return touched;
}

/** @returns {{named: number, pruned: number, touched: number}} */
export function finishBundle() {
  const named = manifestAssets();
  const pruned = pruneUnnamedAssets(named);
  const touched = refreshAssetMtimes();
  return { named: named.length, pruned, touched };
}

// Direct invocation (npm run build:bundle) — importers call finishBundle() themselves.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { named, pruned, touched } = finishBundle();
  console.log(
    `finish-bundle — assets/ is exactly the ${named} file(s) the manifest names ` +
    `(pruned ${pruned} unnamed, refreshed ${touched} mtime(s))`,
  );
}
