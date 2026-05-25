// Phase 80 Wave 0 — RED contract for PAGE-02.
// Asserts _data/species.js exports the expected shape AND does NOT read parquet
// (Pitfall #8: parquet read in _data/*.js would kill HMR).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';

// Reference re-implementation of hslToHex — must match species.js exactly.
// Used by color-algorithm tests to independently verify computed hexColors.
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

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
    expect(list.length).toBeGreaterThan(520); // 527 unique canonical names (SPEC-01: all checklist species present; actual data has 527 unique species, not 565 as estimated)
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
    // WABA species (occurrence_count > 0) are sorted alphabetically by canonical_name.
    // Checklist-only species (occurrence_count === 0, on_checklist) are appended after WABA
    // species in their own alphabetical sort block — the combined list is not fully sorted.
    const list = (species as any).genusList;
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    const wabaSpecies = agapostemon.species.filter((s: any) => s.occurrence_count > 0 && s.slug !== null);
    const names = wabaSpecies.map((s: any) => s.canonical_name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('genusList hexColors match the Python _group_colors algorithm for all genera (D-01)', () => {
    // Verifies color index computation across the full withOcc (including unresolved records),
    // matching Python's `WHERE occurrence_count > 0 ORDER BY canonical_name` input. Data-driven
    // so it stays green regardless of which species have occurrences in the current pipeline run.
    // Checklist-only species (occurrence_count === 0) receive '#cccccc' and are excluded from
    // this check (tested separately in the D-03 test below).
    const flat = (species as any).flat;
    const list = (species as any).genusList;
    for (const g of list) {
      const withOcc = flat
        .filter((s: any) => s.genus === g.genus && s.occurrence_count > 0)
        .sort((a: any, b: any) => a.canonical_name.localeCompare(b.canonical_name));
      const n = withOcc.length;
      const colorByCanon = Object.fromEntries(
        withOcc.map((sp: any, i: number) => [
          sp.canonical_name,
          sp.specific_epithet !== null ? hslToHex(i * 360 / n, 70, 50) : '#aaaaaa',
        ])
      );
      for (const sp of g.species) {
        if (sp.slug === null) continue; // synthetic "Genus sp." key entry — no canonical_name
        if (sp.occurrence_count === 0) continue; // checklist-only species — verified in D-03 test
        expect(sp.hexColor, `${g.genus}/${sp.canonical_name}`).toBe(colorByCanon[sp.canonical_name]);
      }
    }
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

  test('genusList contains at least one species with occurrence_count === 0 and on_checklist (D-03)', () => {
    const list = (species as any).genusList;
    const allSpecies = list.flatMap((g: any) => g.species);
    const checklistOnly = allSpecies.filter((sp: any) =>
      sp.occurrence_count === 0 && sp.on_checklist
    );
    expect(checklistOnly.length).toBeGreaterThan(0);
    for (const sp of checklistOnly) {
      expect(sp.hexColor).toBe('#cccccc');
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
    // WABA species (occurrence_count > 0) are sorted alphabetically by canonical_name.
    // Checklist-only species are appended after WABA species in their own alphabetical sort.
    const list = (species as any).subgenusList;
    const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
    const wabaSpecies = melandrena.species.filter((s: any) => s.occurrence_count > 0 && s.slug !== null);
    const names = wabaSpecies.map((s: any) => s.canonical_name);
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

  test('subgenusList hexColors match the Python _group_colors algorithm for all groups, unresolved counted in index (Pitfall 1)', () => {
    // Verifies color index is computed over the full withOcc (including specific_epithet=null records),
    // not just the resolved-species subset. Data-driven across all subgenus groups.
    // Checklist-only species (occurrence_count === 0) receive '#cccccc' and are excluded from
    // this check (their color is verified by the zero-occurrence test above).
    const flat = (species as any).flat;
    const list = (species as any).subgenusList;
    for (const g of list) {
      const withOcc = flat
        .filter((s: any) => s.genus === g.genus && s.subgenus === g.subgenus && s.occurrence_count > 0)
        .sort((a: any, b: any) => a.canonical_name.localeCompare(b.canonical_name));
      const n = withOcc.length;
      const colorByCanon = Object.fromEntries(
        withOcc.map((sp: any, i: number) => [
          sp.canonical_name,
          sp.specific_epithet !== null ? hslToHex(i * 360 / n, 70, 50) : '#aaaaaa',
        ])
      );
      for (const sp of g.species) {
        if (sp.slug === null) continue; // synthetic "Genus sp." key entry — no canonical_name
        if (sp.occurrence_count === 0) continue; // checklist-only species — verified separately
        expect(sp.hexColor, `${g.genus}/${g.subgenus}/${sp.canonical_name}`).toBe(colorByCanon[sp.canonical_name]);
      }
    }
  });

  test('subgenusList.every(g => g.totalOccurrences > 0 || g.checklistCount > 0)', () => {
    const list = (species as any).subgenusList;
    expect(list.every((g: any) => g.totalOccurrences > 0 || g.checklistCount > 0)).toBe(true);
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
