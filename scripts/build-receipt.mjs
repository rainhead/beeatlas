#!/usr/bin/env node
/**
 * build-receipt.mjs — the precondition for a SCOPED render (beeatlas-4oa).
 *
 *   node scripts/build-receipt.mjs --write   # the last step of a full `pnpm run build`
 *   node scripts/build-receipt.mjs --check   # before a scoped render; exit 0 = allowed
 *   node scripts/build-receipt.mjs --check-deploy  # on a deploy; exit 0 = the site is current
 *   node scripts/build-receipt.mjs --invalidate  # after a FAILED publish; forces a full render next
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
 * A fifth, `deploy`, is written with the others and read only by --check-deploy
 * (beeatlas-ky6d, ADR 0045). A deploy asks a different question from a note save: not
 * "may I render a few pages over this tree?" but "would a full build of this image
 * produce the site already served?" A full build reads more than `render` covers: the
 * lockfile (so node_modules), public/, .nvmrc, the .env files and the bundle scripts.
 * So `deploy` hashes every file in the repo EXCEPT the paths in DEPLOY_IGNORE, which
 * cannot reach a page. Listing what to leave out, rather than what to include, means a
 * new file defaults to forcing a render, the safe direction. The note path keeps
 * ignoring `deploy`: a dependency bump does not make a scoped render unsound (see
 * RENDER_INPUTS), and a deploy that changes any of it renders in full anyway.
 *
 * The receipt fingerprints the inputs when it is written, at the end of the build, and
 * validate checked them at the start. A file edited during a local build is vouched
 * for unchecked; on the Machine nothing can edit them then (code is in the image, and
 * the publish lock serialises every writer of the data dir).
 *
 * --check prints the first component that differs, so a publish log says WHY it
 * fell back to a full build rather than just that it did.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { MANIFEST_PATH } from '../lib/vite-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = join(ROOT, '.cache', 'beeatlas-build', 'receipt.json');

// Everything that PRODUCES _site — not merely everything Eleventy reads. Paths are
// relative to the repo root; a missing one is simply absent from the digest (a
// deleted template is a change).
//
// postbuild-data.mjs is here because it writes _site/data (hashed runtime artifacts
// + the slim manifest), so a change to it means the last full build's _site/data
// came from different logic. package.json is here because its `build` script defines
// what a full build DOES — add a step to it and the tree the receipt vouches for was
// made without that step.
//
// pnpm-lock.yaml is deliberately NOT here, and the reason is the same one that
// makes a src/ change acceptable to a scoped render: bumping a dependency does not
// touch _site until a build runs, and until then the manifest and the assets on disk
// are the old ones and mutually CONSISTENT. Pages render against assets that exist.
// That is stale-but-correct — a note publish is not a code deploy — and the nightly's
// full build is what deploys it.
//
// content/ is here because _data/photos.js renders from content/species-photos.toml.
// It also makes the receipt cover every input `pnpm run validate` reads in the repo
// and the data dir (that file, species.json and occurrences.db, and src/ and
// tsconfig.json for tsc), which is why build:content can skip
// validate: a matching receipt means those inputs are the ones the last full build
// validated before it wrote the receipt (ADR 0017, amendment of 2026-10-24).
const RENDER_INPUTS = [
  '_pages', '_layouts', '_includes', '_data', 'content', 'lib', 'src',
  'eleventy.config.js', 'vite.config.ts', 'vite.sw.config.ts', 'tsconfig.json',
  'scripts/postbuild-data.mjs', 'package.json',
  // The rules of the validations: a changed rule must run on the next publish, which only
  // a full build does now that build:content skips validate.
  'scripts/validate-species.mjs', 'scripts/validate-db.mjs',
  // Outside src/, but src/ imports it, so tsc reads it.
  'scripts/sw-precache-globs.ts',
];

// What --check-deploy leaves out of `deploy`: paths no page is built from. Everything
// else in the repo counts, so a mistake here can only ever cost a needless render, not
// a stale site, EXCEPT by listing something a build does read. Keep entries to code
// that runs the pipeline, the server or the operator, and documents.
const DEPLOY_IGNORE = [
  // Not in the image, or put there at run time.
  '.git', '.beads', '.dolt', 'node_modules', '_site', '.cache', 'public/data',
  // The pipeline (its output is the data dir, which `data` covers), the API, the
  // Machine's own config, AWS, CI and editor settings.
  'data', 'api', 'fly', 'fly.toml', 'infra', '.github', '.claude', '.vscode',
  '.mcp.json', '.coderabbit.yaml', '.dockerignore', '.gitignore', '.editorconfig',
  // Documents. Root *.md files are left out by the rule in deployPaths.
  'docs', 'lychee.toml', 'LICENSE',
  // Tools in scripts/ that drive the pipeline or run by hand, never in `pnpm run build`.
  'scripts/fetch-data.sh', 'scripts/pull-published.sh', 'scripts/photo-pipeline',
  'scripts/check-photo-availability.mjs', 'scripts/seed-species-photos.mjs',
  'scripts/precompress-artifacts.mjs', 'scripts/make-local-manifest.js',
  'scripts/gen-app-icons.sh', 'scripts/measure-lcp.sh', 'scripts/smoke-boot.mjs',
  'scripts/offline-leak-check.sh', 'scripts/offline-uat.mjs',
  // Records the build; does not shape it.
  'scripts/build-receipt.mjs',
];

/** The repo files `deploy` hashes: all of them but DEPLOY_IGNORE and root *.md. */
function deployPaths() {
  const ignored = new Set(DEPLOY_IGNORE);
  const base = p => p.slice(p.lastIndexOf('/') + 1);
  const skip = p => ignored.has(p)
    || ['node_modules', '__pycache__', '.pytest_cache'].includes(base(p))
    // Root documents, and the beads files a local checkout keeps beside .beads/.
    || (!p.includes('/') && (p.endsWith('.md') || p.startsWith('.beads')));
  const visit = rel => {
    if (skip(rel)) return [];
    const abs = join(ROOT, rel);
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st) return [];
    if (!st.isDirectory()) return [rel];
    return readdirSync(abs).flatMap(name => visit(rel ? `${rel}/${name}` : name));
  };
  return readdirSync(ROOT).flatMap(name => visit(name)).sort();
}

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
    deploy: contentDigest(deployPaths(), ROOT),
  };
}

const mode = process.argv[2];

if (mode === '--write') {
  const fp = fingerprint();
  mkdirSync(dirname(RECEIPT), { recursive: true });
  // generated_at for a human reading the file; never compared.
  writeFileSync(RECEIPT, JSON.stringify({ ...fp, at: new Date().toISOString() }, null, 2) + '\n');
  console.log(`build receipt written (${fp.siteFiles} files in _site) → ${relative(ROOT, RECEIPT)}`);
} else if (mode === '--invalidate') {
  // Force the NEXT publish down the full-render path.
  //
  // This closes a hole the receipt alone cannot see. A publish harvests notes/ FIRST
  // and renders second, and stelis records the harvest's per-key observation as it
  // goes. If the run then dies before the render lands, that observation is spent:
  // the next publish's harvest cache-skips, `--moved-keys` truthfully reports "no
  // keys moved", and a zero-key scoped render publishes a site missing the note —
  // while the author is told "live". notes/ is excluded from the data fingerprint by
  // design (it is the one thing a note publish may change), so no component here
  // notices.
  //
  // A full render reads the notes/ dir directly and therefore always heals it. So a
  // failed publish invalidates the receipt and the next one rebuilds in full: one
  // extra full build as the price of never silently dropping a note.
  if (existsSync(RECEIPT)) {
    rmSync(RECEIPT);
    console.log(`build receipt invalidated → next publish renders in full (${relative(ROOT, RECEIPT)})`);
  } else {
    console.log('no build receipt to invalidate — the next publish already renders in full');
  }
} else if (mode === '--check' || mode === '--check-deploy') {
  if (!existsSync(RECEIPT)) {
    console.error('no build receipt — no full build has been recorded here');
    process.exit(1);
  }
  const want = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const got = fingerprint();
  // A receipt written before `deploy` existed lacks it, and so fails --check-deploy:
  // one more full render, the safe direction.
  const components = mode === '--check' ? ['render', 'vite', 'data', 'site'] : ['render', 'vite', 'data', 'site', 'deploy'];
  for (const k of components) {
    if (want[k] !== got[k]) {
      console.error(`build receipt stale: ${k} changed since the last full build (${want[k]} → ${got[k]})`);
      process.exit(1);
    }
  }
  console.log(`build receipt current (${got.siteFiles} files in _site)`);
} else {
  console.error('usage: build-receipt.mjs --write | --check | --check-deploy | --invalidate');
  process.exit(2);
}
