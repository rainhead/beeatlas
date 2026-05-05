import { test, expect, describe, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

// @ts-expect-error -- .mjs source has no .d.ts; named export is the contract (mirrors validate-species.test.ts)
import { validateBundleSize } from '../../scripts/validate-bundle-size.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
// Use a test-specific temp dir so tests never touch the real _site/assets/
const TEST_ASSETS_DIR = join(REPO_ROOT, '_test-assets-tmp');

afterEach(() => {
  rmSync(TEST_ASSETS_DIR, { recursive: true, force: true });
});

/**
 * Write a species-*.js file into TEST_ASSETS_DIR and return the dir path.
 * Content is small ASCII (compressible) — suitable for under-budget tests.
 */
function writeSpeciesFile(rawBytes: number, filename = 'species-abc123.js'): string {
  mkdirSync(TEST_ASSETS_DIR, { recursive: true });
  // Simple repetitive ASCII — gzips to a fraction of rawBytes (well under budget)
  const content = Buffer.alloc(rawBytes, 0x20); // spaces compress well
  writeFileSync(join(TEST_ASSETS_DIR, filename), content);
  return TEST_ASSETS_DIR;
}

/**
 * Write a species-*.js file whose gzipped size is reliably OVER 100 KB.
 * Uses crypto.getRandomValues() for true high-entropy (incompressible) content.
 */
function writeOverBudgetSpeciesFile(): string {
  mkdirSync(TEST_ASSETS_DIR, { recursive: true });
  // 150 KB of cryptographically random bytes — gzip ratio ~1:1, reliably over budget
  const rawSize = 150 * 1024;
  const content = randomBytes(rawSize);
  writeFileSync(join(TEST_ASSETS_DIR, 'species-abc123.js'), content);
  return TEST_ASSETS_DIR;
}

describe('validateBundleSize (PERF-01)', () => {
  test('throws when _site/assets/ does not exist', () => {
    // Use a path that definitely does not exist
    const missingDir = join(REPO_ROOT, '_nonexistent-assets-12345');
    rmSync(missingDir, { recursive: true, force: true });
    expect(() => validateBundleSize(missingDir)).toThrow(/run eleventy first/i);
  });

  test('throws when zero species-*.js files match (D-05)', () => {
    mkdirSync(TEST_ASSETS_DIR, { recursive: true });
    // Write a non-matching file
    writeFileSync(join(TEST_ASSETS_DIR, 'index-abc.js'), 'x');
    expect(() => validateBundleSize(TEST_ASSETS_DIR)).toThrow(/species-/);
  });

  test('returns failed=false when file is under budget', () => {
    // Write a tiny compressible file — well under 100 KB gzipped
    const dir = writeSpeciesFile(100); // 100 bytes raw → tiny gzipped
    const { results, failed, budget } = validateBundleSize(dir);
    expect(failed).toBe(false);
    expect(budget).toBe(100 * 1024);
    expect(results).toHaveLength(1);
    expect(results[0].overBudget).toBe(false);
    expect(results[0].gzBytes).toBeLessThan(100 * 1024);
  });

  test('returns failed=true when gzipped size exceeds 100 KB (PERF-01)', () => {
    const dir = writeOverBudgetSpeciesFile();
    // Verify the test helper actually produces an over-budget file
    const content = readFileSync(join(dir, 'species-abc123.js'));
    const gz = gzipSync(content);
    expect(gz.length, `helper must produce file >100 KB gzipped, got ${gz.length}`).toBeGreaterThan(100 * 1024);

    const { results, failed } = validateBundleSize(dir);
    expect(failed).toBe(true);
    expect(results[0].overBudget).toBe(true);
    expect(results[0].gzBytes).toBeGreaterThan(100 * 1024);
  });

  test('exported validateBundleSize is a function', () => {
    expect(typeof validateBundleSize).toBe('function');
  });
});

describe('validate-bundle-size npm script wiring', () => {
  test('package.json has validate-bundle-size script', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts['validate-bundle-size']).toBe('node scripts/validate-bundle-size.mjs');
  });

  test('package.json build chain ends with validate-bundle-size (D-04)', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts.build).toContain('validate-bundle-size');
    // validate-bundle-size must come after eleventy
    const buildStr: string = pkg.scripts.build;
    expect(buildStr.indexOf('eleventy')).toBeLessThan(buildStr.indexOf('validate-bundle-size'));
  });
});
