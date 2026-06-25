// Phase 169 Wave 0 — RED contract for _data/collectors.js (PAGE-01, D-09). Mirrors data-places.test.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import collectors from '../../_data/collectors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/collectors.js (PAGE-01, D-09)', () => {
  test('default export has a collectorsArray property that is an Array', () => {
    expect(Array.isArray((collectors as any).collectorsArray)).toBe(true);
  });

  test('collectorsArray.length is >= 100 (D-09 floor)', () => {
    expect((collectors as any).collectorsArray.length).toBeGreaterThanOrEqual(100);
  });

  test('every entry has required fields with correct types', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(typeof c.login).toBe('string');
      expect(typeof c.display_name).toBe('string');
      expect(typeof c.specimen_count).toBe('number');
      expect(typeof c.sample_count).toBe('number');
      expect(typeof c.species_count).toBe('number');
      expect(typeof c.status_denominator).toBe('number');
      expect(typeof c.status_identified).toBe('number');
      expect(typeof c.status_awaiting).toBe('number');
      // recordedBy may be string or null (sample-host-only collectors)
    }
  });

  test('status_identified + status_awaiting === status_denominator for every record (PAGE-03)', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(
        c.status_identified + c.status_awaiting,
        `split invariant for ${c.login}`
      ).toBe(c.status_denominator);
    }
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    const src = readFileSync(resolve(ROOT, '_data/collectors.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
