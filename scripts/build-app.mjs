#!/usr/bin/env node
/**
 * build-app.mjs — run the app bundle only when its inputs moved (beeatlas-bon).
 *
 * `vite build` takes ~1.5s of work plus ~0.7s of startup and produces byte-identical
 * output when `src/` has not changed. That became true in two steps: beeatlas-96m took
 * the wall clock out of `__APP_VERSION__`, and beeatlas-4uj took the git sha out of the
 * bundle altogether (the build id now travels in the slim manifest). Until the second,
 * this gate had to fingerprint git HEAD and so could only skip on a build where no
 * commit had landed — which is most of what it was supposed to save.
 *
 * THIS SCRIPT OWNS THE CLEANING, on every path (beeatlas-8df). It used to be a side
 * effect of `vite build`'s `emptyOutDir: true` — the site's cleaning boundary (ADR
 * 0016) — which meant a SKIP had to impersonate it, and the two paths had to be kept
 * byte-indistinguishable and verified by comparing trees (ADR 0019). Vite no longer
 * empties anything; the sequence below runs identically whether or not Vite ran, so
 * there is nothing left to impersonate.
 *
 * The order matters and each step answers a distinct failure:
 *   1. clean _site except assets/ — because merge-swap.sh rsyncs pages with --delete,
 *      which makes _site the authority for the live site. Without this a page dropped
 *      from the data sits in _site, and therefore on the site, forever. Everything
 *      removed here is rebuilt downstream: pages and app/ by Eleventy, app/sw.js by
 *      the service-worker pass, data/ by postbuild-data.
 *   2. run Vite ONLY if the bundle's inputs moved.
 *   3. prune anything in assets/ the manifest does not name. This is what actually
 *      kills stale hashed chunks, and it now does so whether or not Vite ran — with
 *      emptyOutDir off, a Vite run leaves the OLD chunks beside the new ones, and
 *      vite-plugin-pwa's glob would precache both (21 asset URLs against 15 on a
 *      clean build; unbounded across builds).
 *   4. touch the reused files so merge-swap's age-prune spares them.
 *
 * Keeping the extent of assets/ equal to exactly what the manifest names is also the
 * invariant a graph node will own when the bundle re-enters the Stelis graph as a
 * 'dir artifact whose identity is its tree digest (stelis st-hdm).
 *
 * Deliberately NOT gated: the service-worker pass (`build:sw`). It is ~73ms of work
 * behind ~1.2s of startup, and its input is the BUILT SITE, so deciding whether it can
 * be skipped means knowing the rendered page set — which is only knowable after
 * Eleventy has run, i.e. a different and later gate. Against that, shipping a stale
 * service worker means clients precaching URLs that no longer exist, which breaks
 * offline cold-start. Wrong trade at 1.2s.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_PATH } from '../lib/vite-manifest.js';
import { manifestAssetPaths, unnamedAssetPaths } from '../lib/bundle-assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_RECEIPT = join(ROOT, '.cache', 'beeatlas-build', 'bundle.json');
const SITE = join(ROOT, '_site');
const ASSETS = join(SITE, 'assets');

// Everything the bundle is a function of. package-lock.json is here — unlike in the
// site receipt, where it is deliberately absent — because here it is a direct input:
// a dependency bump changes the emitted chunks, and this gate's whole job is to decide
// whether those chunks would come out the same.
//
// The `.env*` files are here because Vite bakes `VITE_*` values INTO the chunks:
// VITE_MAPBOX_TOKEN (src/bee-map.ts), VITE_DATA_BASE_URL (src/manifest.ts),
// VITE_NOTES_API_BASE_URL (src/auth-client.ts). They are gitignored, which is exactly
// why they are easy to forget — and forgetting them is expensive: rotate the Mapbox
// token and, with an unchanged src/, this gate would skip every night while the live
// site kept serving the revoked one. Maps break, the build stays green, and cause and
// effect are weeks apart. A missing file hashes as absent (walk returns []), so listing
// variants that do not exist here is free and survives someone adding one.
const BUNDLE_INPUTS = [
  'src', 'vite.config.ts', 'vite.sw.config.ts', 'package.json', 'package-lock.json',
  '.env', '.env.local', '.env.production', '.env.production.local',
];

function walk(path, base) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [relative(base, path)];
  return readdirSync(path, { withFileTypes: true })
    .flatMap(e => walk(join(path, e.name), base))
    .sort();
}

function fingerprint() {
  const h = createHash('sha256');
  for (const p of BUNDLE_INPUTS.flatMap(p => walk(join(ROOT, p), ROOT)).sort()) {
    h.update(p);
    h.update(createHash('sha256').update(readFileSync(join(ROOT, p))).digest());
  }
  return h.digest('hex').slice(0, 16);
}

/** Every file the manifest claims the bundle produced, as _site-relative paths.
 *
 * Read fresh each call rather than through lib/vite-manifest.js's loadManifest, which
 * caches per process: this runs both BEFORE and AFTER `vite build`, and a cached read
 * would describe the pre-build manifest in the receipt we then write. */
function manifestAssets() {
  return manifestAssetPaths(JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), 'utf8')));
}

/** Why we must rebuild, or null to reuse what is on disk. */
function reasonToRebuild(want) {
  if (!existsSync(BUNDLE_RECEIPT)) return 'no bundle receipt — the bundle has never been recorded here';
  if (!existsSync(join(ROOT, MANIFEST_PATH))) return 'the stashed Vite manifest is gone';
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(BUNDLE_RECEIPT, 'utf8'));
  } catch {
    return 'the bundle receipt is unreadable';
  }
  if (receipt.fingerprint !== want) return `bundle inputs changed (${receipt.fingerprint} → ${want})`;
  // The receipt can be current while the output is not: `build:app` empties _site, so
  // any interrupted build leaves a tree the manifest describes but does not contain.
  // Ask the manifest what it produced and check every file is actually there.
  let assets;
  try {
    assets = manifestAssets();
  } catch (err) {
    return `could not read the manifest (${err.message})`;
  }
  const missing = assets.filter(a => !existsSync(join(SITE, a)));
  if (missing.length) return `${missing.length} asset(s) named by the manifest are missing from _site (e.g. ${missing[0]})`;
  return null;
}

/** Clean _site the way emptyOutDir does, but keep `assets/` — see the header. */
function cleanExceptAssets() {
  if (!existsSync(SITE)) return 0;
  let removed = 0;
  for (const entry of readdirSync(SITE)) {
    if (entry === 'assets') continue;
    rmSync(join(SITE, entry), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

/** Delete anything in assets/ the manifest does not name, so the reused directory is
 * exactly what Vite would have emitted rather than merely a superset of it. Without
 * this the presence check is one-directional (manifest ⊆ disk) and a stray file would
 * survive every skipped build, get precached by the service worker's assets/** glob,
 * and be published — the unbounded dead-chunk accumulation ADR 0016 fixed once. */
function pruneUnnamedAssets(named) {
  if (!existsSync(ASSETS)) return 0;
  // walk gives FULL assets/-relative paths, so a nested chunk is compared as
  // 'species/index-x.js' rather than as the directory 'species' — see
  // lib/bundle-assets.js for why that distinction is load-bearing.
  const unnamed = unnamedAssetPaths(named, walk(ASSETS, ASSETS));
  for (const rel of unnamed) rmSync(join(ASSETS, rel), { force: true });
  // ...and remove any directory left empty, because an empty one is NOT inert.
  // scripts/validate-bundle-size.mjs tests `existsSync(_site/assets/species/)` FIRST
  // and only falls back to the flat `species-*.js` shape when that directory is absent
  // — so an emptied `species/` sends it down the nested branch, where it finds no
  // chunks and fails the build. Vite would have left no such directory behind.
  pruneEmptyDirs(ASSETS);
  return unnamed.length;
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

/** Mark the reused assets as part of THIS publish.
 *
 * data/merge-swap.sh does not --delete assets (a cached page may still reference last
 * publish's hashed names); it age-prunes them instead, and its header states the
 * assumption that makes that safe: "new URLs each publish, so nothing stale is ever
 * re-served under a current name". Every real `vite build` rewrote these files, so
 * anything still referenced was always younger than a day and only dead names aged out.
 *
 * Reusing the bundle breaks precisely that. `rsync -a` preserves mtimes, so the served
 * copies would keep aging while remaining live, and after 30 days of skipped builds the
 * prune would delete the entire bundle out from under pages that reference it — nightly,
 * with a green build and a healthy ping, and invisible to every local check because
 * `_site` is intact. Touching them restores the invariant the prune relies on: these
 * files ARE part of this publish, so they should look it. */
function refreshAssetMtimes() {
  const now = new Date();
  let touched = 0;
  for (const rel of walk(ASSETS, ASSETS)) {
    utimesSync(join(ASSETS, rel), now, now);
    touched += 1;
  }
  return touched;
}

const want = fingerprint();
const why = reasonToRebuild(want);

// 1. Always clean. Vite no longer does this, and it must happen whether or not the
//    bundle is rebuilt — see the header.
const removed = cleanExceptAssets();

if (why) {
  console.log(`build:app — running Vite: ${why}`);
  // Through a shell, matching the `execSync('npm run build')` already in
  // build-output.data.test.ts: `npm` is `npm.cmd` on Windows, which execFileSync cannot
  // launch directly. The command is a fixed literal, so there is nothing to inject.
  execSync('npm run build:bundle', { cwd: ROOT, stdio: 'inherit' });
  mkdirSync(dirname(BUNDLE_RECEIPT), { recursive: true });
  writeFileSync(
    BUNDLE_RECEIPT,
    JSON.stringify({ fingerprint: want, assets: manifestAssets(), at: new Date().toISOString() }, null, 2) + '\n',
  );
} else {
  console.log('build:app — reusing the bundle: inputs unchanged, every named asset present');
}

// 2. Always prune, and always against the manifest as it stands NOW — which is the
//    one Vite just wrote when it ran, and the stashed one when it did not. This is
//    the step that removes stale chunks; with emptyOutDir off, the Vite path needs
//    it just as much as the skip path does.
const named = manifestAssets();
const pruned = pruneUnnamedAssets(named);
const touched = refreshAssetMtimes();
console.log(
  `build:app — ${named.length} asset(s) named by the manifest; ` +
  `cleaned ${removed} entr${removed === 1 ? 'y' : 'ies'} from _site, ` +
  `pruned ${pruned} unnamed, refreshed ${touched} mtime(s) so merge-swap's age-prune spares them`,
);
