#!/usr/bin/env node
/**
 * build-app.mjs — run the app bundle only when its inputs moved (beeatlas-bon).
 *
 * `vite build` takes ~1.5s of work plus ~0.7s of startup and produces byte-identical
 * output when `src/` has not changed (true only since beeatlas-96m removed the build
 * clock from `__APP_VERSION__` — before that every build minted new hashes, so there
 * was nothing to reuse). A note publish that falls back to a full build, and every
 * nightly, paid it regardless.
 *
 * THE TRAP, and the reason this is a script rather than an `if`: `build:app` runs Vite
 * with `emptyOutDir: true`, and that is not incidental — it is the site's CLEANING
 * BOUNDARY (ADR 0016). A full build wipes `_site` and rebuilds it; a bare `eleventy`
 * rerun is deliberately additive. Skipping the Vite step naively would remove the only
 * thing that ever deletes from `_site`, so a page dropped from the data would sit there
 * forever — and `merge-swap.sh` rsyncs pages with `--delete`, which makes `_site` the
 * authority, so it would sit on the live site forever too.
 *
 * So a skip still cleans. It removes everything in `_site` EXCEPT `assets/`, which is
 * exactly the set Vite would have re-emitted identically. Everything else is rebuilt
 * downstream: pages and `app/` by Eleventy, `app/sw.js` by the service-worker pass,
 * `data/` by postbuild-data. The result is indistinguishable from having run Vite,
 * which the tests assert by byte-comparing the two trees.
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

/** The build id vite.config.ts bakes into __APP_VERSION__ — mirrored, not imported,
 * because that file is TypeScript. It is a bundle input like any other: it lands inside
 * a content-hashed chunk, so a commit that touches nothing else still changes the
 * emitted bee-header chunk. Leaving it out would make this gate skip while `vite build`
 * would have produced something different — and the "Build <id>" popover, whose whole
 * job is telling you which code is deployed, would then name a commit that is not.
 *
 * The cost is that every commit rebuilds the bundle (~1.5s), which is most of what this
 * gate could otherwise skip. beeatlas-4uj is the fix: move the id out of the bundle and
 * into the slim manifest, which is not content-hashed — then the bundle is a function of
 * src/ + config + deps alone and this input disappears. */
function buildIdInputs() {
  // The two git calls are caught INDEPENDENTLY, mirroring buildVersion(): it keeps
  // GITHUB_SHA even when git is unavailable, so collapsing both failures into one
  // constant here would let this gate skip across commits that DO change
  // __APP_VERSION__.
  let sha = process.env.GITHUB_SHA || '';
  if (!sha) {
    try { sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { sha = 'no-sha'; }
  }
  let dirty = 'clean';
  try {
    if (execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim()) dirty = 'dirty';
  } catch { dirty = 'unknown'; }
  return `${sha}\0${dirty}`;
}

function fingerprint() {
  const h = createHash('sha256');
  for (const p of BUNDLE_INPUTS.flatMap(p => walk(join(ROOT, p), ROOT)).sort()) {
    h.update(p);
    h.update(createHash('sha256').update(readFileSync(join(ROOT, p))).digest());
  }
  h.update(buildIdInputs());
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

if (why) {
  console.log(`build:app — running Vite: ${why}`);
  // Vite's own emptyOutDir does the cleaning on this path.
  //
  // Through a shell, matching the `execSync('npm run build')` already in
  // build-output.data.test.ts: `npm` is `npm.cmd` on Windows, which execFileSync cannot
  // launch directly. The command is a fixed literal, so there is nothing to inject.
  execSync('npm run build:bundle', { cwd: ROOT, stdio: 'inherit' });
  mkdirSync(dirname(BUNDLE_RECEIPT), { recursive: true });
  writeFileSync(
    BUNDLE_RECEIPT,
    JSON.stringify({ fingerprint: want, assets: manifestAssets(), at: new Date().toISOString() }, null, 2) + '\n',
  );
  console.log(`build:app — bundle recorded (${manifestAssets().length} assets)`);
} else {
  const named = manifestAssets();
  const removed = cleanExceptAssets();
  const pruned = pruneUnnamedAssets(named);
  const touched = refreshAssetMtimes();
  console.log(
    `build:app — reusing the bundle: inputs unchanged, all ${named.length} assets present ` +
    `(cleaned ${removed} other entr${removed === 1 ? 'y' : 'ies'} from _site as a full build must; ` +
    `pruned ${pruned} unnamed; refreshed ${touched} mtimes so merge-swap's age-prune spares them)`,
  );
}
