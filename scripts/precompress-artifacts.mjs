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
 * EACH SIBLING IS NAMED FOR ITS SOURCE'S CONTENT (`<source>-<hash>.br`). The publish
 * copies a sibling only when the hash matches the bytes it just hashed itself, so a
 * stale `compressed/` cannot put yesterday's database under today's URL — see
 * lib/precompress.js for the paths that reach that, both of which are real.
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
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';
import { artifactHash, compressedVariants, precompressedDir, precompressedPath } from '../lib/precompress.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every artifact is a plain filename directly in the data dir. Enforced rather than
 * assumed, because both ways of violating it are silent-ish and neither is useful: a
 * nested name (`feeds/index.json`) crashes on the write, since nothing creates the
 * subdirectory and the prune below reads only the top level; and a `..` segment reads
 * outside the data dir and writes its siblings outside `compressed/`, where the prune
 * can never reach them. The caller is a literal list in stelis's graph, so this is a
 * guard against an editing mistake, not against an attacker.
 */
function invalidName(source) {
  if (source === '' || basename(source) !== source || source === '.' || source === '..') {
    return `not a plain filename in the data dir: ${JSON.stringify(source)}`;
  }
  return null;
}

function main(sources) {
  if (sources.length === 0) {
    console.error('usage: precompress-artifacts.mjs <artifact-filename>...');
    console.error('  Filenames are relative to the build data dir (EXPORT_DIR, or public/data).');
    return 2;
  }

  const dataDir = buildDataDir(ROOT);

  // PRE-FLIGHT, before anything is written or pruned. A failure partway through the
  // loop would otherwise leave compressed/ half fresh and half stale with no prune and
  // no stelis cache entry — and the next publish would find a matching-hash sibling for
  // some artifacts and not others, which is a worse state than not having run at all.
  // A missing artifact is fatal, as it is in postbuild-data.mjs: stelis declares these
  // as this node's inputs, so an absent one means the graph and the data dir disagree.
  const problems = [];
  for (const source of sources) {
    const bad = invalidName(source);
    if (bad) { problems.push(`  ${bad}`); continue; }
    try {
      if (!statSync(join(dataDir, source)).isFile()) problems.push(`  not a file: ${source}`);
    } catch (err) {
      problems.push(`  unreadable (${err.code ?? err.message}): ${source}`);
    }
  }
  if (problems.length > 0) {
    console.error(`x precompress: nothing written; ${problems.length} artifact(s) unusable in ${dataDir}:`);
    console.error(problems.join('\n'));
    return 1;
  }

  const outDir = precompressedDir(dataDir);
  mkdirSync(outDir, { recursive: true });

  const written = new Set();
  for (const source of sources) {
    const content = readFileSync(join(dataDir, source));
    const hash = artifactHash(content);
    const variants = compressedVariants(content);
    for (const { suffix, body } of variants) {
      // Written to a temp name and renamed, the way postbuild-data.mjs writes the
      // manifest. A SIGKILL mid-write (the note-publish path runs under a 300 s
      // timeout), ENOSPC, or an OOM would otherwise leave a TRUNCATED file under a name
      // the publish accepts — and a truncated .gz has the right name and the right hash.
      const final = precompressedPath(dataDir, source, hash, suffix);
      writeFileSync(`${final}.tmp`, body);
      renameSync(`${final}.tmp`, final);
      written.add(basename(final));
    }
    const sizes = variants.map(({ suffix, body }) => `${suffix.slice(1)} ${body.length.toLocaleString()}`);
    console.log(`  ${source} @${hash}: ${content.length.toLocaleString()} bytes`
      + (sizes.length ? ` -> ${sizes.join('; ')}` : ' -> nothing worth writing'));
  }

  // The directory is a SET, and stelis content-addresses it as one. Anything not written
  // just now is a sibling of an artifact that is no longer compressed here, of content
  // that has moved on, or a leftover .tmp — none of which anything should serve, and all
  // of which would keep the tree digest moving.
  const stale = readdirSync(outDir).filter((name) => !written.has(name));
  for (const name of stale) rmSync(join(outDir, name), { recursive: true, force: true });
  if (stale.length > 0) console.log(`  pruned ${stale.length} stale sibling(s): ${stale.join(', ')}`);

  console.log(`ok compressed/: ${written.size} sibling(s) for ${sources.length} artifact(s) in ${outDir}`);
  return 0;
}

// process.exitCode rather than process.exit(): stelis runs this task with piped stdio,
// and process.exit() does not flush a pending async write to a pipe — so the diagnostic
// above could be dropped and the operator would see only "exit 1".
process.exitCode = main(process.argv.slice(2));
