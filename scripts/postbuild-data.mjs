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
 * generated_at: SOURCE_DATE_EPOCH (seconds, exported by the data build /
 * nightly) as ISO-8601; absent = the dev sentinel "local", which the client's
 * freshness label treats as unparseable and hides (D-12).
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
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { RUNTIME_ARTIFACTS } from '../lib/runtime-artifacts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = buildDataDir(ROOT);
const outDir = join(ROOT, '_site', 'data');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

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
  console.log(`  ${key}: ${source} -> data/${hashedName} (${content.length.toLocaleString()} bytes)`);
}

if (missing.length > 0) {
  console.error(`x postbuild-data: missing runtime artifacts:\n    ${missing.join('\n    ')}`);
  console.error('  Populate the data dir first: npm run fetch-data (build) or npm run pull-published (download).');
  process.exit(1);
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

const epoch = process.env.SOURCE_DATE_EPOCH;
manifest.generated_at = epoch ? new Date(Number(epoch) * 1000).toISOString() : 'local';

const manifestPath = join(outDir, 'manifest.json');
writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + '\n');
renameSync(`${manifestPath}.tmp`, manifestPath);
console.log(`ok _site/data: ${Object.keys(RUNTIME_ARTIFACTS).length} artifacts + manifest.json (generated_at: ${manifest.generated_at})`);
