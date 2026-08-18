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
 *      removed here is rebuilt downstream: pages, icons/ and manifest.webmanifest by
 *      Eleventy, sw.js by the service-worker pass, data/ by postbuild-data.
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
import { finishBundle, manifestAssets } from './finish-bundle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_RECEIPT = join(ROOT, '.cache', 'beeatlas-build', 'bundle.json');
const SITE = join(ROOT, '_site');

// Everything the bundle is a function of. pnpm-lock.yaml is here — unlike in the
// site receipt, where it is deliberately absent — because here it is a direct input:
// a dependency bump changes the emitted chunks, and this gate's whole job is to decide
// whether those chunks would come out the same.
//
// The `.env*` files are here because Vite bakes `VITE_*` values INTO the chunks:
// VITE_DATA_BASE_URL (src/manifest.ts), VITE_NOTES_API_BASE_URL (src/auth-client.ts).
// They are gitignored, which is exactly why they are easy to forget — and forgetting
// them is expensive: move the notes API and, with an unchanged src/, this gate would
// skip every night while the live site kept calling the old host. The feature breaks,
// the build stays green, and cause and effect are weeks apart. A missing file hashes
// as absent (walk returns []), so listing variants that do not exist here is free and
// survives someone adding one.
//
// VITE_MAPBOX_TOKEN was the original example here and is gone: the basemap is
// self-hosted as of beeatlas-q73 and no renderer asset sits behind a key.
const BUNDLE_INPUTS = [
  'src', 'vite.config.ts', 'vite.sw.config.ts', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
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




const want = fingerprint();
const why = reasonToRebuild(want);

// 1. Always clean. Vite no longer does this, and it must happen whether or not the
//    bundle is rebuilt — see the header.
const removed = cleanExceptAssets();

if (why) {
  console.log(`build:app — running Vite: ${why}`);
  // Through a shell, matching the `execSync('pnpm run build')` already in
  // build-output.data.test.ts: `npm` is `npm.cmd` on Windows, which execFileSync cannot
  // launch directly. The command is a fixed literal, so there is nothing to inject.
  execSync('pnpm run build:bundle', { cwd: ROOT, stdio: 'inherit' });
  mkdirSync(dirname(BUNDLE_RECEIPT), { recursive: true });
  writeFileSync(
    BUNDLE_RECEIPT,
    JSON.stringify({ fingerprint: want, assets: manifestAssets(), at: new Date().toISOString() }, null, 2) + '\n',
  );
} else {
  console.log('build:app — reusing the bundle: inputs unchanged, every named asset present');
}

// 2. Make assets/ exactly the manifest. `npm run build:bundle` already did this
//    on the rebuild path (it ends in finish-bundle.mjs), so this call is for the
//    REUSE path — where nothing was emitted and a stray file would otherwise
//    survive forever. It is idempotent, so running it on both paths would be
//    correct too; calling it here keeps one statement instead of two branches.
const { named, pruned, touched } = finishBundle();
console.log(
  `build:app — ${named} asset(s) named by the manifest; ` +
  `cleaned ${removed} entr${removed === 1 ? 'y' : 'ies'} from _site, ` +
  `pruned ${pruned} unnamed, refreshed ${touched} mtime(s) so merge-swap's age-prune spares them`,
);
