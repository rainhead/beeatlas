// Phase 96 Wave 0 — RED contract for IDX-01..04 + URL-05.
// Source-level assertions against _pages/species.njk (template) and
// src/entries/species-index.ts (entry wiring). Uses readFileSync against source
// files so these run in the fast unit suite (VITEST_SKIP_BUILD=1 npm test).
// All tests are RED until Plan 02 rewrites the template and creates the entry.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 96 — index page, IDX-01..04)', () => {
  test('declares layout: default.njk and permalink: /species/index.html', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references species-index entry (not old species.ts)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species-index\.ts"/);
    expect(src).not.toContain('species.ts');
  });

  test('contains groupby("family") and groupby("genus") for IDX-01', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('groupby("family")');
    expect(src).toContain('groupby("genus")');
  });

  test('contains #species-filter input for IDX-02', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/id="species-filter"/);
    expect(src).toMatch(/type="search"/);
  });

  test('does not contain <bee-species-page> or <bee-species-card> (URL-05)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).not.toContain('bee-species-page');
    expect(src).not.toContain('bee-species-card');
  });
});

describe('src/entries/species-index.ts (IDX-02 entry wiring)', () => {
  test('imports index.css and taxon-pages.css side-effects', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("'../index.css'");
    expect(src).toContain("'../styles/taxon-pages.css'");
  });

  test('wires input event listener to #species-filter', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("getElementById('species-filter')");
    expect(src).toContain("addEventListener('input'");
  });

  test('toggles hidden on .family-section, .genus-row, and li elements', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain('.family-section');
    expect(src).toContain('.genus-row');
    expect(src).toContain('hidden');
  });
});
