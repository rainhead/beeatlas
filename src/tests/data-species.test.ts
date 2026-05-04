// Phase 80 Wave 0 — RED contract for PAGE-02.
// Asserts _data/species.js exports the expected shape AND does NOT read parquet
// (Pitfall #8: parquet read in _data/*.js would kill HMR).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/species.js (PAGE-02)', () => {
  test('exports { tree, flat, byScientificName }', () => {
    expect(Array.isArray((species as any).flat)).toBe(true);
    expect((species as any).flat.length).toBeGreaterThan(0);
    expect(typeof (species as any).byScientificName).toBe('object');
    expect(typeof (species as any).tree).toBe('object');
  });

  test('flat is sorted alphabetically by scientificName (D-01)', () => {
    const names = (species as any).flat.map((s: any) => s.scientificName);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('does NOT read parquet (Pitfall #8)', () => {
    const src = readFileSync(resolve(ROOT, '_data/species.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
