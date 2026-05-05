import { test, expect, describe } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// @ts-expect-error -- .mjs source has no .d.ts; named export is the contract (mirrors validate-species.test.ts)
import { validateBundleSize } from '../../scripts/validate-bundle-size.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

/**
 * Build a fake _site/assets/ directory with one species-*.js file of the given
 * *uncompressed* size. Returns a cleanup function.
 */
function makeFakeAssets(fileSizeBytes: number, filename = 'species-abc123.js'): () => void {
  const assetsDir = join(REPO_ROOT, '_site', 'assets');
  mkdirSync(assetsDir, { recursive: true });
  // Fill with zeros (compresses extremely well) — we need gzipped size, so
  // instead fill with pseudo-random content that compresses poorly:
  // use repeated non-repetitive text to control gzipped output size better.
  const content = Buffer.alloc(fileSizeBytes, 0x61 /* 'a' */); // compressible filler
  writeFileSync(join(assetsDir, filename), content);
  return () => {
    rmSync(join(REPO_ROOT, '_site'), { recursive: true, force: true });
  };
}

/**
 * Build a fake _site/assets/ with a file whose GZIPPED size is approximately
 * targetGzBytes. We write a content that is incompressible (random-ish) to
 * control the gzipped output size. Since random bytes are hard to reason about,
 * we instead generate a buffer that gzips to a predictable size by building
 * a large, non-repetitive payload.
 *
 * Simpler approach: write a large uncompressed payload; for highly-repetitive
 * content gzip ratio is ~1000:1, so we need 100 MB for 100 KB gzipped.
 * Instead, we write content that is intentionally incompressible: alternating
 * non-repeating sequences. We aim for the raw file to be close to targetGzBytes
 * after gzip by writing pseudo-random bytes (XOR pattern).
 */
function makeFileWithGzSize(targetGzBytes: number, filename = 'species-abc123.js'): () => void {
  const assetsDir = join(REPO_ROOT, '_site', 'assets');
  mkdirSync(assetsDir, { recursive: true });

  // Generate incompressible content: cycle through all 256 byte values
  // This should give a gzip ratio close to 1:1 for large buffers.
  const rawSize = Math.ceil(targetGzBytes * 1.05); // slightly over to account for gzip headers
  const content = Buffer.allocUnsafe(rawSize);
  for (let i = 0; i < rawSize; i++) {
    // XOR pattern that avoids repetition — resists gzip LZ77 compression
    content[i] = ((i * 251 + (i >> 8) * 127) ^ (i >> 16)) & 0xff;
  }
  writeFileSync(join(assetsDir, filename), content);

  // Verify actual gzipped size is > 100 KB (budget) for over-budget tests
  const gz = gzipSync(content);
  if (targetGzBytes > 100 * 1024 && gz.length <= 100 * 1024) {
    throw new Error(`makeFileWithGzSize: gzipped size ${gz.length} did not exceed budget — increase rawSize`);
  }

  return () => {
    rmSync(join(REPO_ROOT, '_site'), { recursive: true, force: true });
  };
}

describe('validateBundleSize (PERF-01)', () => {
  test('throws when _site/assets/ does not exist', () => {
    // Ensure directory does not exist
    rmSync(join(REPO_ROOT, '_site'), { recursive: true, force: true });
    expect(() => validateBundleSize()).toThrow(/run eleventy first/i);
  });

  test('throws when zero species-*.js files match (D-05)', () => {
    const assetsDir = join(REPO_ROOT, '_site', 'assets');
    mkdirSync(assetsDir, { recursive: true });
    // Write a non-matching file
    writeFileSync(join(assetsDir, 'index-abc.js'), 'x');
    try {
      expect(() => validateBundleSize()).toThrow(/species-/);
    } finally {
      rmSync(join(REPO_ROOT, '_site'), { recursive: true, force: true });
    }
  });

  test('returns failed=false and budget when file is under budget', () => {
    // Write a tiny, compressible file — gzipped will be well under 100 KB
    const assetsDir = join(REPO_ROOT, '_site', 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, 'species-xyz.js'), 'console.log("hello");');
    try {
      const { results, failed, budget } = validateBundleSize();
      expect(failed).toBe(false);
      expect(budget).toBe(100 * 1024);
      expect(results).toHaveLength(1);
      expect(results[0].overBudget).toBe(false);
      expect(results[0].gzBytes).toBeLessThan(100 * 1024);
    } finally {
      rmSync(join(REPO_ROOT, '_site'), { recursive: true, force: true });
    }
  });

  test('returns failed=true when gzipped size exceeds 100 KB (PERF-01)', () => {
    const cleanup = makeFileWithGzSize(110 * 1024); // 110 KB gzipped
    try {
      const { results, failed } = validateBundleSize();
      expect(failed).toBe(true);
      expect(results[0].overBudget).toBe(true);
      expect(results[0].gzBytes).toBeGreaterThan(100 * 1024);
    } finally {
      cleanup();
    }
  });

  test('exported validateBundleSize is a function', () => {
    expect(typeof validateBundleSize).toBe('function');
  });
});

describe('validate-bundle-size npm script wiring', () => {
  test('package.json has validate-bundle-size script', () => {
    const pkg = JSON.parse(
      require('node:fs').readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8')
    );
    expect(pkg.scripts['validate-bundle-size']).toBe('node scripts/validate-bundle-size.mjs');
  });

  test('package.json build chain ends with validate-bundle-size (D-04)', () => {
    const pkg = JSON.parse(
      require('node:fs').readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8')
    );
    expect(pkg.scripts.build).toContain('validate-bundle-size');
    // validate-bundle-size must come after eleventy
    const buildStr: string = pkg.scripts.build;
    expect(buildStr.indexOf('eleventy')).toBeLessThan(buildStr.indexOf('validate-bundle-size'));
  });
});
