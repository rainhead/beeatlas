#!/usr/bin/env node
/**
 * precompress-artifacts.mjs — write the compressed representations of the data
 * artifacts named on argv into `<data dir>/compressed/`.
 *
 * The producing half of ADR 0024, taken OFF the publish path (stelis st-ljy). ADR 0024
 * put it in postbuild-data.mjs, which is the right place for the decision and the wrong
 * place for the work: postbuild-data runs on `build:content`, which is the note-publish
 * path, and rebuilds _site/data wholesale with no cache — so every note write paid ~2.9 s
 * recompressing a database that changes once a night. Here it is a stelis graph node
 * whose inputs are the artifacts themselves, so early cutoff runs it when the data
 * moves and not when a note does.
 *
 * WHICH ARTIFACTS IS ARGV'S JOB, not this script's. It could read RUNTIME_ARTIFACTS —
 * but then the set it compresses could drift from the set stelis declared as the node's
 * inputs, and a directory that changes without a declared input changing is exactly the
 * shape of a wrong cache skip. Taking the list from the caller makes the graph edge
 * authoritative; the failure mode of drift becomes "postbuild compresses that one
 * in-process", which is slow and correct rather than fast and stale.
 *
 * NO SKIPPING HERE, deliberately: this always compresses what it is told. A
 * "is the sibling newer than the source" check would be a fourth hand-rolled cache in
 * this repo, and the whole point of the node is that it already has a real one.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { compressedVariants, precompressedDir } from '../lib/precompress.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const sources = process.argv.slice(2);
if (sources.length === 0) {
  console.error('usage: precompress-artifacts.mjs <artifact-filename>...');
  console.error('  Filenames are relative to the build data dir (EXPORT_DIR, or public/data).');
  process.exit(2);
}

const dataDir = buildDataDir(ROOT);
const outDir = precompressedDir(dataDir);
mkdirSync(outDir, { recursive: true });

// A missing source is fatal, as it is in postbuild-data.mjs: stelis declares these as
// this node's inputs, so an absent one means the graph and the data dir disagree, and
// silently shipping an uncompressed 34 MB database is the failure this whole path exists
// to prevent.
const written = new Set();
for (const source of sources) {
  let content;
  try {
    content = readFileSync(join(dataDir, source));
  } catch {
    console.error(`x precompress: ${source} not in ${dataDir}`);
    process.exit(1);
  }
  const variants = compressedVariants(content);
  for (const { suffix, body } of variants) {
    writeFileSync(join(outDir, source + suffix), body);
    written.add(source + suffix);
  }
  const sizes = variants.map(({ suffix, body }) => `${suffix.slice(1)} ${body.length.toLocaleString()}`);
  console.log(`  ${source}: ${content.length.toLocaleString()} bytes`
    + (sizes.length ? ` -> ${sizes.join('; ')}` : ' -> nothing worth writing'));
}

// The directory is a SET, and stelis content-addresses it as one: anything not written
// just now is a sibling of an artifact that is no longer compressed here — a retired
// artifact, or one that stopped clearing MIN_SAVING. Left in place it would be published
// under a name whose bytes nothing produces any more.
const stale = readdirSync(outDir).filter((name) => !written.has(name));
for (const name of stale) rmSync(join(outDir, name), { recursive: true, force: true });
if (stale.length > 0) console.log(`  pruned ${stale.length} stale sibling(s): ${stale.join(', ')}`);

console.log(`ok compressed/: ${written.size} sibling(s) for ${sources.length} artifact(s) in ${outDir}`);
