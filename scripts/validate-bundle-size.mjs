#!/usr/bin/env node
/**
 * PERF-01: fail the build if the species-page Vite chunk exceeds the
 * gzipped budget. Pairs with ARCH-04 (src/tests/arch.test.ts) — that
 * test catches forbidden imports; this gate catches everything else
 * (vendor bloat, side-effect imports via allowed paths, dynamic-import
 * promotion).
 *
 * Mirrors scripts/validate-schema.mjs idiom: top-of-file constants,
 * hard fail on any miss, helpful diagnostic output.
 */

import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// PERF-01: 100 KB gzipped budget for the species-page chunk.
const BUDGET_BYTES = 100 * 1024;
const ASSETS_DIR = new URL('../_site/assets/', import.meta.url).pathname;
const SPECIES_SUBDIR = 'species';
const CHUNK_SUFFIX = '.js';

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function findSpeciesChunks(dir) {
  if (!existsSync(dir)) {
    throw new Error(`_site/assets/ does not exist — run eleventy first`);
  }
  // Vite emits the species entry under `_site/assets/species/index-*.js`
  // (own environment / output dir). Tolerate the flat `species-*.js` shape
  // too in case Vite output naming reverts.
  const speciesDir = join(dir, SPECIES_SUBDIR);
  if (existsSync(speciesDir)) {
    return readdirSync(speciesDir)
      .filter(n => n.endsWith(CHUNK_SUFFIX))
      .map(n => join(speciesDir, n));
  }
  return readdirSync(dir)
    .filter(n => n.startsWith(`${SPECIES_SUBDIR}-`) && n.endsWith(CHUNK_SUFFIX))
    .map(n => join(dir, n));
}

/**
 * @param {string} [assetsDir] - override for _site/assets/ (used in tests)
 */
export function validateBundleSize(assetsDir = ASSETS_DIR) {
  const chunks = findSpeciesChunks(assetsDir);
  if (chunks.length === 0) {
    // D-05: catch Vite output-naming drift.
    throw new Error(
      `No files matched _site/assets/${SPECIES_SUBDIR}/*${CHUNK_SUFFIX} or _site/assets/${SPECIES_SUBDIR}-*${CHUNK_SUFFIX} — Vite output naming may have drifted (PERF-01 / D-05)`
    );
  }
  const results = [];
  let failed = false;
  for (const path of chunks) {
    const raw = readFileSync(path);
    const gz = gzipSync(raw);
    const overBudget = gz.length > BUDGET_BYTES;
    if (overBudget) failed = true;
    results.push({ path, rawBytes: raw.length, gzBytes: gz.length, overBudget });
  }
  return { results, failed, budget: BUDGET_BYTES };
}

// CLI guard (mirrors validate-species.mjs): only run when invoked directly.
const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1]);

if (isCli) {
  try {
    const { results, failed, budget } = validateBundleSize();
    for (const r of results) {
      const name = r.path.split('/').pop();
      if (r.overBudget) {
        console.error(`x ${name}: ${fmtKB(r.gzBytes)} / ${fmtKB(budget)} — OVER BUDGET (PERF-01)`);
      } else {
        const headroom = budget - r.gzBytes;
        console.log(`ok ${name}: ${fmtKB(r.gzBytes)} / ${fmtKB(budget)} (${fmtKB(headroom)} headroom)`);
      }
    }
    if (failed) {
      console.error('\nBundle-size gate failed (PERF-01).');
      process.exit(1);
    }
  } catch (e) {
    console.error(`x validate-bundle-size: ${e.message}`);
    process.exit(1);
  }
}
