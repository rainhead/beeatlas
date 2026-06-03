// Phase 133 Plan 02 Wave 0 — RED contract for TREE-01/02/04 template markup.
// Source-level assertions against _pages/species.njk (template) and
// src/entries/species-index.ts (entry wiring). Uses readFileSync against source
// files so these run in the fast unit suite (VITEST_SKIP_BUILD=1 npm test).
// Template assertions are RED until Task 2 rewrites the template.
// Entry assertions remain GREEN (entry is unchanged structurally).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 133 — tree index, TREE-01/02/04)', () => {
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

  test('contains taxon-page species-index wrapper class (unchanged dual class)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('class="taxon-page species-index"');
  });

  test('control bar: contains species-index-controls, species-filter, show-all-ranks', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('class="species-index-controls"');
    expect(src).toMatch(/id="species-filter"/);
    expect(src).toMatch(/type="search"/);
    expect(src).toMatch(/aria-label="Filter taxa"/);
    expect(src).toMatch(/placeholder="Filter taxa…"/);
    expect(src).toMatch(/id="show-all-ranks"/);
  });

  test('filter-empty paragraph carries hidden and No taxa match with filter-query span and role=status', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/id="filter-empty"[^>]*hidden/);
    expect(src).toContain('No taxa match');
    expect(src).toMatch(/id="filter-query"/);
    expect(src).toMatch(/role="status"/);
  });

  test('tree node markup: contains details class="tree-node, summary, node-name, node-counts, node-map, data-rank=', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('details class="tree-node');
    expect(src).toContain('<summary>');
    expect(src).toContain('node-name');
    expect(src).toContain('node-counts');
    expect(src).toContain('node-map');
    expect(src).toContain('data-rank=');
  });

  test('count separator: source contains middle dot U+00B7 in a node-counts span', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    // U+00B7 middle dot between count values
    expect(src).toContain('·');
    expect(src).toContain('node-counts');
  });

  test('map affordance: contains taxonRank= and aria-label="Map: and world map glyph', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('taxonRank=');
    expect(src).toMatch(/aria-label="Map:/);
    // U+1F5FA world map emoji
    expect(src).toContain('\u{1F5FA}');
  });

  test('family is plain text: family-rank summary uses span.node-name (no <a>) for name, not a link', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    // Template must have a branch that emits <span class="node-name"> for family rank
    // (no link — D-07). The pattern must differentiate family from page-backed ranks.
    expect(src).toContain('<span class="node-name">');
    // Template must have an <a class="node-name" branch for other ranks (genus, etc.)
    expect(src).toContain('<a class="node-name"');
  });

  test('subgenus URL uses node.genusName and does NOT contain /species/undefined/', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    // The subgenus branch must use genusName for URL construction
    expect(src).toContain('node.genusName');
    // Must never produce a /species/undefined/ literal
    expect(src).not.toContain('/species/undefined/');
  });

  test('does NOT contain stale flat markup: no groupby("family"), .family-section, or old aria-label', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).not.toContain('groupby("family")');
    expect(src).not.toContain('.family-section');
    expect(src).not.toContain('aria-label="Filter genera and species"');
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
});
