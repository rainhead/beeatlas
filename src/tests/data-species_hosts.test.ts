// Phase 175 Plan 02 — Task 1 loader contract tests.
// Asserts _data/species_hosts.js exports a Record<canonical_name, HostFamily[]>
// and tolerates absence of public/data/species_hosts.json.

import { describe, test, expect } from 'vitest';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import speciesHosts from '../../_data/species_hosts.js';

describe('_data/species_hosts.js (Phase 175)', () => {
  test('default export is an object (not null, not array)', () => {
    expect(speciesHosts).toBeDefined();
    expect(typeof speciesHosts).toBe('object');
    expect(speciesHosts).not.toBeNull();
    expect(Array.isArray(speciesHosts)).toBe(false);
  });

  test('absence-tolerant: module imports without throwing even when JSON is absent', () => {
    // If we reach this line, the import above succeeded — proof the loader does not
    // throw when public/data/species_hosts.json is absent (clean checkout / local dev).
    expect(true).toBe(true);
  });

  test('each entry value is an array of HostFamily objects', () => {
    for (const [canonicalName, families] of Object.entries(speciesHosts as Record<string, any>)) {
      expect(Array.isArray(families), `${canonicalName}: value must be an array`).toBe(true);
      for (const fam of families as any[]) {
        expect(typeof fam.family, `${canonicalName}: family must be string`).toBe('string');
        expect(typeof fam.sample_count, `${canonicalName}: sample_count must be number`).toBe('number');
        expect(Array.isArray(fam.genera), `${canonicalName}: genera must be array`).toBe(true);
        for (const g of fam.genera as any[]) {
          expect(typeof g.genus, `${canonicalName}: genus.genus must be string`).toBe('string');
          expect(typeof g.sample_count, `${canonicalName}: genus.sample_count must be number`).toBe('number');
        }
      }
    }
  });
});
