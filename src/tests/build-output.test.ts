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
    expect(cardCount).toBeGreaterThan(500); // ~629 bee species (Anthophila only)
  });

  test('every <img> tag has loading="lazy" (PAGE-07)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  // plugin-vite (MPA mode) emits the species page entry under either:
  //   _site/assets/species-<hash>.js     (flat layout)
  //   _site/assets/species/index-<hash>.js  (nested layout, current Rollup default for /species/ MPA entry)
  // Either is acceptable as long as a species-scoped chunk exists distinct from index-*.js.
  function findSpeciesChunk(): string | undefined {
    const assetsDir = resolve(ROOT, '_site/assets');
    const flat = readdirSync(assetsDir).filter(f => /^species-.*\.js$/.test(f));
    if (flat.length > 0) return resolve(assetsDir, flat[0]!);
    const nestedDir = resolve(assetsDir, 'species');
    try {
      const nested = readdirSync(nestedDir).filter(f => /\.js$/.test(f));
      if (nested.length > 0) return resolve(nestedDir, nested[0]!);
    } catch { /* directory absent */ }
    return undefined;
  }

  function findTaxonChunk(): string | undefined {
    const assetsDir = resolve(ROOT, '_site/assets');
    const flat = readdirSync(assetsDir).filter(f => /^taxon-page-.*\.js$/.test(f));
    if (flat.length > 0) return resolve(assetsDir, flat[0]!);
    const nestedDir = resolve(assetsDir, 'taxon-page');
    try {
      const nested = readdirSync(nestedDir).filter(f => /\.js$/.test(f));
      if (nested.length > 0) return resolve(nestedDir, nested[0]!);
    } catch { /* directory absent */ }
    return undefined;
  }

  test('emits a species-page chunk distinct from index-*.js (PAGE-09)', () => {
    const speciesChunk = findSpeciesChunk();
    expect(speciesChunk, 'no species page chunk emitted under _site/assets/').toBeDefined();
    const indexChunks = readdirSync(resolve(ROOT, '_site/assets')).filter(f => /^index-.*\.js$/.test(f));
    expect(indexChunks.length, 'SPA index chunk missing — cannot prove distinctness').toBeGreaterThan(0);
  });

  test('species chunk does NOT contain mapboxgl symbol (PAGE-09)', () => {
    const speciesChunk = findSpeciesChunk();
    expect(speciesChunk).toBeDefined();
    const src = readFileSync(speciesChunk!, 'utf-8');
    expect(src).not.toMatch(/mapboxgl/);
  });

  test('emits _site/species/Agapostemon/femoratus/index.html (SPE-01, URL-01, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Agapostemon femoratus</em>');
    expect(html).toContain('<seasonality-viz');
    expect(html).toContain('/data/species-maps/Agapostemon/femoratus.svg');
    expect(html).toMatch(/View \d+ occurrences on the atlas/);
  });

  test('every <img> on a species page has loading="lazy" (PAGE-07 carry-forward, SPE-02/SPE-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('emits _site/species/Agapostemon/index.html (GEN-01, URL-02, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Agapostemon</em>');
    expect(html).toContain('/data/species-maps/genus/Agapostemon.svg');
    expect(html).toContain('class="species-list"');
    expect(html).toMatch(/background:\s*#80d926/);
  });

  test('genus page links each species to its species page (GEN-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
    );
    expect(html).toMatch(/href="\/species\/Agapostemon\/femoratus\/"/);
  });

  test('emits a taxon-page chunk distinct from species chunk (Pattern 4)', () => {
    const taxonChunk = findTaxonChunk();
    const assetsDir = resolve(ROOT, '_site/assets');
    const hasFlatTaxon = readdirSync(assetsDir).some(f => /^taxon-page-.*\.js$/.test(f));
    let hasNestedTaxon = false;
    try {
      const nestedDir = resolve(assetsDir, 'taxon-page');
      hasNestedTaxon = readdirSync(nestedDir).some(f => /\.js$/.test(f));
    } catch { /* directory absent */ }
    // taxonChunk defined => at least one layout found; check both layouts explicitly
    expect(taxonChunk, 'no taxon-page chunk emitted').toBeDefined();
    expect(hasFlatTaxon || hasNestedTaxon, 'no taxon-page chunk emitted').toBe(true);
  });
});
