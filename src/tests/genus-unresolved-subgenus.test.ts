// beeatlas-cayq. A record identified only to subgenus is a real determination one rank coarser
// than species. The genus page used to sum every unresolved member of a genus into
// one "Genus sp." row, which threw that rank away — on /species/Coelioxys/ the
// single "Coelioxys sp." row hid 9 Cyrtocoelioxys and 1 Boreocoelioxys record, and
// on /species/Bombus/ it hid ~1,956 Pyrobombus ones.
//
// Fixture-driven rather than *.data.test.ts: it supplies its own EXPORT_DIR, so it
// runs in the default suite on a clean checkout with no pipeline artifacts, and the
// numbers stay pinned to the case that was reported instead of drifting with the data.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'genus-unresolved');

let species: any;
const priorExportDir = process.env.EXPORT_DIR;
beforeAll(async () => {
  // _data/species.js resolves its data dir (lib/build-data-dir.js) at MODULE LOAD, so
  // EXPORT_DIR has to be set before it is imported — hence the dynamic import.
  process.env.EXPORT_DIR = FIXTURES;
  // @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
  species = (await import('../../_data/species.js')).default;
});

// Vitest reuses a worker across files, so process.env survives this one. Leaving
// EXPORT_DIR pointing at the fixtures would silently feed them to every *.data.test.ts
// that ran after it in the same worker.
afterAll(() => {
  if (priorExportDir === undefined) delete process.env.EXPORT_DIR;
  else process.env.EXPORT_DIR = priorExportDir;
});

const genus = (name: string) => species.genusList.find((g: any) => g.genus === name);
const subgenus = (g: any, name: string) => g.subgenera.find((sg: any) => sg.subgenus === name);

describe('genus page: records identified only to subgenus', () => {
  test('a subgenus-rank bucket names its subgenus and sits inside that subgenus group', () => {
    const cyrto = subgenus(genus('Coelioxys'), 'Cyrtocoelioxys');
    const entry = cyrto.species.find((sp: any) => sp.scientificName.endsWith(' sp.'));
    expect(entry.scientificName).toBe('Coelioxys (Cyrtocoelioxys) sp.');
    expect(entry.inat_obs_count).toBe(9);
    expect(entry.hexColor).toBe('#aaaaaa');
    // Last within its group, after the epithet-bearing species.
    expect(cyrto.species.at(-1)).toBe(entry);
  });

  test('the genus-level bucket keeps the bare name and stays ungrouped', () => {
    const coelioxys = genus('Coelioxys');
    const entry = coelioxys.ungroupedSpecies.find((sp: any) => sp.scientificName === 'Coelioxys sp.');
    expect(entry).toBeDefined();
    // 90/237 only — NOT the 90/247 the single summed row used to show.
    expect(entry.specimen_count).toBe(90);
    expect(entry.inat_obs_count).toBe(237);
    for (const sg of coelioxys.subgenera) {
      expect(sg.species.some((sp: any) => sp.scientificName === 'Coelioxys sp.')).toBe(false);
    }
  });

  test('a subgenus with no subgenus-rank records gains no "sp." row', () => {
    const xero = subgenus(genus('Coelioxys'), 'Xerocoelioxys');
    expect(xero.species.some((sp: any) => sp.scientificName.endsWith(' sp.'))).toBe(false);
  });

  test('splitting is lossless: the buckets still sum to the genus total', () => {
    const coelioxys = genus('Coelioxys');
    const buckets = coelioxys.species.filter((sp: any) => sp.scientificName.endsWith(' sp.'));
    expect(buckets.map((sp: any) => sp.scientificName).sort()).toEqual([
      'Coelioxys (Boreocoelioxys) sp.',
      'Coelioxys (Cyrtocoelioxys) sp.',
      'Coelioxys sp.',
    ]);
    const sum = (k: string) => buckets.reduce((a: number, sp: any) => a + sp[k], 0);
    expect(sum('specimen_count')).toBe(90);
    expect(sum('inat_obs_count')).toBe(247);
    // 12 species-level + 90 genus-level occurrences, plus 247 observations.
    expect(coelioxys.totalOccurrences).toBe(12 + 90 + 247);
  });

  test('lossless partition survives the split (subgenera + ungrouped === species)', () => {
    const coelioxys = genus('Coelioxys');
    const partitioned = [
      ...coelioxys.subgenera.flatMap((sg: any) => sg.species),
      ...coelioxys.ungroupedSpecies,
    ];
    expect(partitioned.length).toBe(coelioxys.species.length);
    expect(new Set(partitioned)).toEqual(new Set(coelioxys.species));
  });

  test('a genus with no subgenera is untouched: one bare "Genus sp." row', () => {
    const neolarra = genus('Neolarra');
    expect(neolarra.subgenera).toHaveLength(0);
    expect(neolarra.ungroupedSpecies).toEqual(neolarra.species);
    const entry = neolarra.species.find((sp: any) => sp.scientificName.endsWith(' sp.'));
    expect(entry.scientificName).toBe('Neolarra sp.');
  });
});

describe('subgenus page: the "sp." row names its subgenus', () => {
  test('so it cannot be read as a genus-level determination', () => {
    const cyrto = species.subgenusList.find((sg: any) => sg.subgenus === 'Cyrtocoelioxys');
    const entry = cyrto.species.find((sp: any) => sp.scientificName.endsWith(' sp.'));
    expect(entry.scientificName).toBe('Coelioxys (Cyrtocoelioxys) sp.');
    expect(entry.inat_obs_count).toBe(9);
  });
});
