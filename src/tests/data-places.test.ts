// Phase 99 Wave 0 — RED contract for _data/places.js (PPAGE-01, PPAGE-02). Mirrors data-species.test.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import places from '../../_data/places.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/places.js (PPAGE-01, PPAGE-02)', () => {
  test('default export has a placesArray property that is an Array (PPAGE-01)', () => {
    expect(Array.isArray((places as any).placesArray)).toBe(true);
  });

  test('every entry in placesArray has the correct field types (PPAGE-01)', () => {
    for (const p of (places as any).placesArray) {
      expect(typeof p.slug, `slug of ${p.name}`).toBe('string');
      expect(typeof p.name, `name of ${p.slug}`).toBe('string');
      expect(typeof p.land_owner, `land_owner of ${p.slug}`).toBe('string');
      expect(typeof p.specimen_count, `specimen_count of ${p.slug}`).toBe('number');
      expect(typeof p.sample_count, `sample_count of ${p.slug}`).toBe('number');
    }
  });

  test('placesArray.length is greater than 0 (PPAGE-01)', () => {
    expect((places as any).placesArray.length).toBeGreaterThan(0);
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    const src = readFileSync(resolve(ROOT, '_data/places.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
