#!/usr/bin/env node
/**
 * postbuild-data.mjs — publish the runtime data artifacts into _site/data.
 *
 * Runs as npm's `postbuild` lifecycle step (after `npm run build`). For each
 * runtime artifact (lib/runtime-artifacts.js) it content-hashes the source in
 * the build data dir (lib/build-data-dir.js), copies it to
 * _site/data/<basename>-<12-hex>.<ext>, and finally writes the SLIM
 * _site/data/manifest.json = { key -> hashed-name, generated_at }.
 *
 * The manifest is written LAST so every name it resolves already exists by the
 * time a reader can see it. Hashed names are immutable — the serving layer
 * gives them long-lived cache headers; manifest.json is served no-cache.
 *
 * Each hashed artifact also gets pre-compressed `.br` / `.gz` siblings, which the
 * serving layer hands back under the artifact's own URL (lib/precompress.js,
 * infra/maderas/beeatlas-compression.conf, docs/adr/0024). The manifest does not
 * mention them and the client never asks for one by name: the hash is of the
 * UNCOMPRESSED source either way, so the URL keeps meaning the same bytes.
 * Their BYTES are copied from `<data dir>/compressed/` when stelis's `precompress`
 * node has produced them, and compressed here only as a fallback — see writeVariants.
 *
 * generated_at: the data dir's `generated_at` stamp (epoch seconds, written by
 * scripts/fetch-data.sh on a full pipeline run) as ISO-8601; absent = the dev
 * sentinel "local", which the client's freshness label treats as unparseable
 * and hides (D-12). Deliberately NOT this build's clock — see the note at the
 * assignment (beeatlas-923).
 *
 * A missing source artifact is a hard error: publishing a site whose manifest
 * or data dir is incomplete would strand the client (the PWA prime loop and
 * the SQLite worker both resolve these names). Run `npm run fetch-data` (build
 * the data) or `npm run pull-published` (grab what's live) first.
 *
 * _site/data is derived ENTIRELY from the data dir. The eleventy-plugin-vite
 * passthrough copies the whole public/data build-INPUT dir into _site (a
 * mechanism the plugin owns — see eleventy.config.js's do-not-override notes),
 * dragging raw parquets, the unhashed db, and every baked JSON into the
 * output; worse, under EXPORT_DIR the passthrough's copies come from the WRONG
 * place (the repo's public/data, not the export). So this step replaces
 * _site/data wholesale: the hashed runtime binaries, the stable-URL dirs pages
 * reference in place (feeds/, species-maps/, place-maps/ — e.g.
 * /data/species-maps/<slug>.svg, the Atom feed), and manifest.json.
 * A missing stable dir is a warning, not an error — `npm run pull-published`
 * historically fetched feeds/ only, and a dev build without the map SVGs is
 * usable.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { readGeneratedAt } from '../lib/data-freshness.js';
import { compressedVariants, precompressedVariants } from '../lib/precompress.js';
import { RUNTIME_ARTIFACTS } from '../lib/runtime-artifacts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which code produced this publish — the "Build <id>" row in bee-header's menu.
 *
 * It lives HERE, in the slim manifest, rather than being `define`d into the bundle
 * (beeatlas-4uj). Baked into a chunk it was a build INPUT: every commit changed the
 * emitted bee-header chunk, so the bundle-reuse gate had to fingerprint git HEAD and
 * could only skip Vite on a nightly where nothing landed at all. It also made the id
 * dishonest in the one case it exists for — a reused bundle would keep naming the
 * commit that last happened to rebuild it.
 *
 * manifest.json is not content-hashed and is served no-cache, so writing it here costs
 * nothing and is regenerated on every publish. This completes the rule beeatlas-96m
 * established and stopped one step short of: nothing clock- or HEAD-derived belongs
 * inside a content-hashed artifact.
 */
function buildId() {
  let sha = process.env.GITHUB_SHA || '';
  if (!sha) {
    try { sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* no git */ }
  }
  let dirty = '';
  try {
    // Tracked files only: an untracked screenshot in a working copy must not stamp
    // -dirty on a build whose inputs match HEAD exactly.
    if (execSync('git status --porcelain --untracked-files=no', { cwd: ROOT, encoding: 'utf8' }).trim()) dirty = '-dirty';
  } catch { /* no git */ }
  return sha ? `${sha.slice(0, 7)}${dirty}` : 'dev';
}
const dataDir = buildDataDir(ROOT);
const outDir = join(ROOT, '_site', 'data');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/**
 * Write the pre-compressed siblings for one published artifact and describe them for
 * the log — the only place the size that matters (what a reader actually downloads) is
 * visible, since the manifest and the filename both talk about the original.
 *
 * A COPY when the bytes already exist (stelis st-ljy). Compressing here is ~2.9 s, and
 * this script runs on `build:content` — the note-publish path, which reruns the site
 * build synchronously while an HTTP writer waits out a 300 s timeout (ADR 0017) — for a
 * database that changes once a night. Stelis's `precompress` node produces the siblings
 * when the DATA moves and leaves them in the data dir; this prefers them.
 *
 * Compressing in-process stays the fallback, not a legacy path: a dev build, a
 * `npm run pull-published` docroot, and any artifact the graph does not name (taxon_pages
 * is derived below, from this build) all have no precomputed sibling and must still be
 * published compressed. `source` is undefined for those.
 */
function writeVariants(hashedName, content, source) {
  const precomputed = source ? precompressedVariants(dataDir, source) : [];
  if (precomputed.length > 0) {
    return precomputed.map(({ suffix, path }) => {
      copyFileSync(path, join(outDir, hashedName + suffix));
      return `${suffix.slice(1)} ${statSync(path).size.toLocaleString()} (precompressed)`;
    });
  }
  return compressedVariants(content).map(({ suffix, body }) => {
    writeFileSync(join(outDir, hashedName + suffix), body);
    return `${suffix.slice(1)} ${body.length.toLocaleString()}`;
  });
}

const manifest = {};
const missing = [];
for (const [key, { source, basename }] of Object.entries(RUNTIME_ARTIFACTS)) {
  const srcPath = join(dataDir, source);
  let content;
  try {
    content = readFileSync(srcPath);
  } catch {
    missing.push(`${key} (${srcPath})`);
    continue;
  }
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const hashedName = `${basename}-${hash}${extname(source)}`;
  copyFileSync(srcPath, join(outDir, hashedName));
  manifest[key] = hashedName;
  const variants = writeVariants(hashedName, content, source);
  const sizes = [`${content.length.toLocaleString()} bytes`, ...variants].join('; ');
  console.log(`  ${key}: ${source} -> data/${hashedName} (${sizes})`);
}

if (missing.length > 0) {
  console.error(`x postbuild-data: missing runtime artifacts:\n    ${missing.join('\n    ')}`);
  console.error('  Populate the data dir first: npm run fetch-data (build) or npm run pull-published (download).');
  process.exit(1);
}

// A DERIVED artifact, not a copied one (beeatlas-dt7): the taxon_id -> page-href
// map the app's taxa pane uses to decide which rows can link out. It is computed
// by _data/species.js from the very lists Eleventy paginates over, so it cannot
// disagree with which pages this build actually emitted — importing that module
// here is what makes the map authoritative rather than a second guess at the rules.
//
// Written AFTER the copy loop above because it belongs to _site/data (which this
// script owns wholesale), and hashed like any other artifact so a stale cached copy
// can never point at pages a later build stopped generating.
//
// Non-fatal by design, unlike the artifacts above: a data dir without species.json
// cannot produce this map, and a dev build should degrade to "no links in the taxa
// pane" rather than refuse to publish.
try {
  const { default: speciesData } = await import('../_data/species.js');
  const body = Buffer.from(JSON.stringify(speciesData.taxonPages) + '\n');
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const hashedName = `taxon_pages-${hash}.json`;
  writeFileSync(join(outDir, hashedName), body);
  manifest.taxon_pages = hashedName;
  const sizes = [`${body.length.toLocaleString()} bytes`, ...writeVariants(hashedName, body)].join('; ');
  console.log(`  taxon_pages: ${Object.keys(speciesData.taxonPages).length} taxa -> data/${hashedName} (${sizes})`);
} catch (err) {
  console.warn(`! taxon_pages: not derived (${err.message}) — the taxa pane will render names as plain text`);
}

const STABLE_DIRS = ['feeds', 'species-maps', 'place-maps'];
for (const dir of STABLE_DIRS) {
  const src = join(dataDir, dir);
  if (!existsSync(src)) {
    console.warn(`! ${dir}/: not in ${dataDir} — skipped (pages referencing /data/${dir}/ will 404)`);
    continue;
  }
  cpSync(src, join(outDir, dir), { recursive: true });
  console.log(`  ${dir}/ -> data/${dir}/`);
}

// Freshness comes from the DATA (lib/data-freshness.js), never from this build's clock.
// It used to come from SOURCE_DATE_EPOCH, which every publish path sets to its own wall
// clock — so a code deploy reset the "data as of" clock without touching a byte of data,
// and a week-long nightly outage was invisible as long as someone pushed code
// (beeatlas-923). SOURCE_DATE_EPOCH remains, for build determinism only.
manifest.generated_at = readGeneratedAt(dataDir);
manifest.build_id = buildId();

const manifestPath = join(outDir, 'manifest.json');
writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + '\n');
renameSync(`${manifestPath}.tmp`, manifestPath);
console.log(`ok _site/data: ${Object.keys(RUNTIME_ARTIFACTS).length} artifacts + manifest.json (generated_at: ${manifest.generated_at}, build ${manifest.build_id})`);
