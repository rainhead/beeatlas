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
      // land_owner is null for the Level IV ecoregion places (beeatlas-8gcw) —
      // nobody owns an ecoregion — and a string for every collecting site.
      expect(['string', 'object'], `land_owner of ${p.slug}`).toContain(typeof p.land_owner);
      if (p.kind !== 'ecoregion_l4') expect(typeof p.land_owner, `land_owner of ${p.slug}`).toBe('string');
      expect(typeof p.specimen_count, `specimen_count of ${p.slug}`).toBe('number');
      expect(typeof p.sample_count, `sample_count of ${p.slug}`).toBe('number');
    }
  });

  test('the index splits places by kind: sites, and ecoregions nested under Level III (beeatlas-8gcw)', () => {
    const { placesArray, sites, ecoregionGroups } = places as any;
    expect(Array.isArray(sites)).toBe(true);
    expect(Array.isArray(ecoregionGroups)).toBe(true);
    // Every place lands in exactly one of the two, and nowhere twice.
    const grouped = ecoregionGroups.flatMap((g: any) => g.ecoregions);
    expect(sites.length + grouped.length).toBe(placesArray.length);
    for (const s of sites) expect(s.kind).not.toBe('ecoregion_l4');
    for (const g of ecoregionGroups) {
      expect(typeof g.l3_name).toBe('string');
      for (const e of g.ecoregions) {
        expect(e.kind).toBe('ecoregion_l4');
        expect(e.l3_name).toBe(g.l3_name);
      }
      // Codes read in numeric order — 2f before 10a, not the other way round.
      const nums = g.ecoregions.map((e: any) => parseInt(String(e.code).match(/\d+/)?.[0] ?? '0', 10));
      expect([...nums].sort((a: number, b: number) => a - b)).toEqual(nums);
    }
  });

  test('placesArray.length is greater than 0 (PPAGE-01)', () => {
    expect((places as any).placesArray.length).toBeGreaterThan(0);
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    const src = readFileSync(resolve(ROOT, '_data/places.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });

  // Phase 1 (cyv): place_details.json enrichment. It is a build_time_fetch artifact
  // (gitignored, absent in PR CI), so the loader guards its read with existsSync and
  // these shape checks are CONDITIONAL — vacuous when the artifact is absent, enforced
  // when it is present (deploy CI / local).
  test('loader guards the fetched place_details.json read (degradation, not ENOENT)', () => {
    const src = readFileSync(resolve(ROOT, '_data/places.js'), 'utf-8');
    expect(src).toMatch(/existsSync/);
    expect(src).toMatch(/place_details\.json/);
  });

  test('when present, species_by_genus has the {genus, species[]} shape (cyv)', () => {
    for (const p of (places as any).placesArray) {
      if (p.species_by_genus === undefined) continue;
      expect(Array.isArray(p.species_by_genus), `species_by_genus of ${p.slug}`).toBe(true);
      for (const g of p.species_by_genus) {
        expect(typeof g.genus).toBe('string');
        expect(Array.isArray(g.species)).toBe(true);
        for (const sp of g.species) {
          expect(typeof sp.name).toBe('string');
          expect(typeof sp.slug).toBe('string');
          expect(typeof sp.count).toBe('number');
        }
      }
    }
  });

  test('when present, collection_months is a 12-int array and peak_month is null or 1–12 (cyv)', () => {
    for (const p of (places as any).placesArray) {
      if (p.collection_months === undefined) continue;
      expect(p.collection_months.length, `collection_months of ${p.slug}`).toBe(12);
      for (const n of p.collection_months) expect(typeof n).toBe('number');
      expect(typeof p.dated_total).toBe('number');
      expect(p.peak_month === null || (p.peak_month >= 1 && p.peak_month <= 12)).toBe(true);
    }
  });
});
