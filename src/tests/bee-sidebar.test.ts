import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const detailSrc = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');
const paneSrc   = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');
const atlasSrc  = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

// -----------------------------------------------------------------------
// DC-01: bee-occurrence-detail taxonCache property declaration
// -----------------------------------------------------------------------

describe('DC-01: bee-occurrence-detail declares taxonCache @property', () => {
  test('bee-occurrence-detail.ts declares taxonCache property', () => {
    expect(detailSrc).toMatch(/taxonCache/);
  });

  test('bee-occurrence-detail.ts has @property decorator on taxonCache', () => {
    expect(detailSrc).toMatch(/@property[^)]*\)[^;]*taxonCache/);
  });

  test('bee-occurrence-detail.ts taxonCache typed as Map', () => {
    expect(detailSrc).toMatch(/taxonCache.*Map<number/);
  });
});

// -----------------------------------------------------------------------
// DC-02: cache lookup replaces row.scientificName for determination label
// -----------------------------------------------------------------------

describe('DC-02: name resolution uses taxonCache.get lookup by taxon_id', () => {
  test('bee-occurrence-detail.ts resolves determination label via taxonCache.get', () => {
    expect(detailSrc).toMatch(/taxonCache.*get/);
  });

  test('bee-occurrence-detail.ts looks up row.taxon_id in the cache', () => {
    // Must reference taxon_id as the cache key
    expect(detailSrc).toMatch(/\.taxon_id/);
  });

  test('bee-occurrence-detail.ts determination render shows No determination when no cache hit', () => {
    expect(detailSrc).toMatch(/No determination/);
  });

  test('bee-occurrence-detail.ts determination label does NOT read row.scientificName in _renderCollectorGroup', () => {
    // Extract _renderCollectorGroup method body
    const match = detailSrc.match(/_renderCollectorGroup\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(match).not.toBeNull();
    const body = match![0];
    // scientificName must not appear as the primary determination label in this method
    expect(body).not.toMatch(/row\.scientificName/);
  });
});

// -----------------------------------------------------------------------
// DC-03: null/missing taxon_id always shows No determination (never blank)
// -----------------------------------------------------------------------

describe('DC-03: null taxon_id and cache-miss both yield No determination', () => {
  test('bee-occurrence-detail.ts has explicit null guard for taxon_id', () => {
    // taxon_id != null or taxon_id !== null
    expect(detailSrc).toMatch(/taxon_id\s*!=?\s*null/);
  });

  test('bee-occurrence-detail.ts uses nullish coalesce or fallback for cache miss', () => {
    // info?.name ?? null  or  displayName ?? ...  or  ?. chaining
    expect(detailSrc).toMatch(/\?\?/);
  });

  test('bee-occurrence-detail.ts renders no-determination span class', () => {
    expect(detailSrc).toMatch(/class=["']no-determination["']|class=["'][^"']*no-determination[^"']*["']/);
  });
});

// -----------------------------------------------------------------------
// DC-04: prop threading — bee-pane forwards taxonCache to bee-occurrence-detail
// -----------------------------------------------------------------------

describe('DC-04: bee-pane declares and forwards taxonCache', () => {
  test('bee-pane.ts declares taxonCache @property', () => {
    expect(paneSrc).toMatch(/taxonCache/);
  });

  test('bee-pane.ts passes .taxonCache to bee-occurrence-detail', () => {
    expect(paneSrc).toMatch(/\.taxonCache=\$\{this\.taxonCache\}/);
  });
});

// -----------------------------------------------------------------------
// DC-05: bee-atlas passes _taxonCache into bee-pane
// -----------------------------------------------------------------------

describe('DC-05: bee-atlas passes _taxonCache to bee-pane', () => {
  test('bee-atlas.ts passes .taxonCache to bee-pane', () => {
    expect(atlasSrc).toMatch(/\.taxonCache=\$\{this\._taxonCache\}/);
  });
});
