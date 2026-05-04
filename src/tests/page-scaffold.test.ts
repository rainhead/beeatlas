// Phase 80 Wave 0 — RED contract for PAGE-01 (front-matter) and PAGE-04 (entry script).
// readFileSync + regex pattern from src/tests/seed-species-photos.test.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (PAGE-01, PAGE-04)', () => {
  test('declares layout: default.njk and permalink: /species/index.html (PAGE-01)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references the species entry script (PAGE-04)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species\.ts"/);
  });
});
