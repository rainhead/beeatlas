// Phase 80 Wave 0 — RED contract for PAGE-07 / PAGE-09 + D-04 skip-slot.
// Post-build assertions on _site/. Wraps the whole describe block in a guard
// so it can be skipped via VITEST_SKIP_BUILD=1 when local feedback latency
// matters; CI runs without the flag.

import { describe, test, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';

describe.skipIf(SKIP_BUILD)('build output (PAGE-07, PAGE-09)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);

  test('emits _site/species/index.html with one <bee-species-card> per species (PAGE-01)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    const cardCount = (html.match(/<bee-species-card\b/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(700); // ~735 species
  });

  test('every <img> tag has loading="lazy" (PAGE-07)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('emits _site/assets/species-*.js chunk distinct from index-*.js (PAGE-09)', () => {
    const files = readdirSync(resolve(ROOT, '_site/assets'));
    const speciesChunks = files.filter(f => /^species-.*\.js$/.test(f));
    expect(speciesChunks.length).toBeGreaterThan(0);
  });

  test('species chunk does NOT contain mapboxgl symbol (PAGE-09)', () => {
    const files = readdirSync(resolve(ROOT, '_site/assets'));
    const speciesChunk = files.find(f => /^species-.*\.js$/.test(f));
    expect(speciesChunk).toBeDefined();
    const src = readFileSync(resolve(ROOT, '_site/assets', speciesChunk!), 'utf-8');
    expect(src).not.toMatch(/mapboxgl/);
  });
});
