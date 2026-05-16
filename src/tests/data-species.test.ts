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

  test('exports speciesList (only entries with specific_epithet)', () => {
    const list = (species as any).speciesList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(500); // 527 confirmed
    expect(list.every((s: any) => s.specific_epithet !== null)).toBe(true);
  });

  test('exports genusList with speciesCount and totalOccurrences', () => {
    const list = (species as any).genusList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0); // 42 genera
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    expect(agapostemon).toBeDefined();
    expect(typeof agapostemon.speciesCount).toBe('number');
    expect(typeof agapostemon.totalOccurrences).toBe('number');
  });

  test('genusList species sorted alphabetically by canonical_name (D-02)', () => {
    const list = (species as any).genusList;
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    const names = agapostemon.species.map((s: any) => s.canonical_name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('first Agapostemon species has hexColor matching Python _group_colors (D-01)', () => {
    const list = (species as any).genusList;
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    // Python includes unresolved records in color index computation (occurrence_count > 0).
    // Agapostemon: n=4 (agapostemon null, femoratus, agapostemon subtilior null, virescens).
    // femoratus is i=1 → hue=90 → #80d926. Unresolved get #aaaaaa.
    expect(agapostemon.species[0].hexColor).toBe('#80d926');
  });

  test('zero-occurrence species gets grey swatch #cccccc', () => {
    const list = (species as any).genusList;
    for (const g of list) {
      for (const sp of g.species) {
        if (sp.occurrence_count === 0) {
          expect(sp.hexColor).toBe('#cccccc');
        }
      }
    }
  });

  // Phase 95 — subgenusList tests (SUBG-01, SUBG-02, SUBG-03, URL-03)

  test('exports subgenusList as array with length > 50 (103 expected groups)', () => {
    const list = (species as any).subgenusList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(50);
  });

  test('subgenusList Andrena/Melandrena entry has numeric speciesCount and totalOccurrences', () => {
    const list = (species as any).subgenusList;
    const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
    expect(melandrena).toBeDefined();
    expect(typeof melandrena.speciesCount).toBe('number');
    expect(typeof melandrena.totalOccurrences).toBe('number');
  });

  test('subgenusList display list excludes unresolved records (specific_epithet !== null)', () => {
    const list = (species as any).subgenusList;
    const allSpecies = list.flatMap((g: any) => g.species);
    expect(allSpecies.every((sp: any) => sp.specific_epithet !== null)).toBe(true);
  });

  test('subgenusList Andrena/Melandrena species sorted alphabetically by canonical_name', () => {
    const list = (species as any).subgenusList;
    const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
    const names = melandrena.species.map((s: any) => s.canonical_name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('subgenusList Andrena/Melandrena species all have valid hexColor', () => {
    const list = (species as any).subgenusList;
    const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
    for (const sp of melandrena.species) {
      expect(sp.hexColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('subgenusList color parity: first resolved Andrena/Melandrena species matches index in withOcc array (Pitfall 1)', () => {
    const list = (species as any).subgenusList;
    const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
    // From species.json analysis:
    // withOcc (n=9) sorted by canonical_name:
    //   i=0: andrena commoda (resolved) -> hslToHex(0 * 360 / 9, 70, 50) = #d92626
    //   i=4: andrena pertristis (null) -> #aaaaaa
    // First resolved species is 'andrena commoda commoda' at i=0 -> #d92626
    const firstResolved = melandrena.species[0];
    expect(firstResolved.hexColor).toBe('#d92626');
  });

  test('subgenusList.every(g => g.totalOccurrences > 0) — zero-occurrence groups excluded', () => {
    const list = (species as any).subgenusList;
    expect(list.every((g: any) => g.totalOccurrences > 0)).toBe(true);
  });

  // Phase 95 Plan 02 — tribeList tests (TRIBE-01, TRIBE-02, TRIBE-03, URL-04)

  test('exports tribeList as array with length > 10 (19 expected tribes)', () => {
    const list = (species as any).tribeList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(10);
  });

  test('tribeList Andrenini entry has numeric generaCount and totalOccurrences > 0', () => {
    const list = (species as any).tribeList;
    const andrenini = list.find((t: any) => t.tribe === 'Andrenini');
    expect(andrenini).toBeDefined();
    expect(typeof andrenini.generaCount).toBe('number');
    expect(andrenini.generaCount).toBeGreaterThan(0);
    expect(typeof andrenini.totalOccurrences).toBe('number');
    expect(andrenini.totalOccurrences).toBeGreaterThan(0);
  });

  test('tribeList Halictini genera sorted alphabetically by genus', () => {
    const list = (species as any).tribeList;
    const halictini = list.find((t: any) => t.tribe === 'Halictini');
    expect(halictini).toBeDefined();
    const names = halictini.genera.map((g: any) => g.genus);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('tribeList every genus entry has occurrence_count > 0', () => {
    const list = (species as any).tribeList;
    const allGenera = list.flatMap((t: any) => t.genera);
    expect(allGenera.every((g: any) => g.occurrence_count > 0)).toBe(true);
  });

  test('tribeList.every(t => t.totalOccurrences > 0) — zero-occurrence tribes excluded', () => {
    const list = (species as any).tribeList;
    expect(list.every((t: any) => t.totalOccurrences > 0)).toBe(true);
  });

  test('tribeList Ammobatini is excluded (zero occurrences)', () => {
    const list = (species as any).tribeList;
    expect(list.find((t: any) => t.tribe === 'Ammobatini')).toBeUndefined();
  });

  test('tribeList Andrenini has family === Andrenidae', () => {
    const list = (species as any).tribeList;
    const andrenini = list.find((t: any) => t.tribe === 'Andrenini');
    expect(andrenini).toBeDefined();
    expect(andrenini.family).toBe('Andrenidae');
  });
});
