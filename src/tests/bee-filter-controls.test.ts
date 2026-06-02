import { test, expect, describe } from 'vitest';
import { buildTaxonLabel, RANK_ORDER, buildTaxonOptions, resolveTaxonDisplayName, type TaxonCacheEntry } from '../taxa.ts';
import { getSuggestions } from '../bee-filter-controls.ts';
import type { TaxonOption } from '../filter.ts';

// ---- D-03 label builder tests ----

describe('buildTaxonLabel (D-03)', () => {
  test('family rank: returns plain name', () => {
    expect(buildTaxonLabel('Apidae', 'family')).toBe('Apidae');
  });

  test('subfamily rank: returns plain name', () => {
    expect(buildTaxonLabel('Apinae', 'subfamily')).toBe('Apinae');
  });

  test('tribe rank: returns plain name', () => {
    expect(buildTaxonLabel('Bombini', 'tribe')).toBe('Bombini');
  });

  test('subtribe rank: returns plain name', () => {
    expect(buildTaxonLabel('Bumblebeeina', 'subtribe')).toBe('Bumblebeeina');
  });

  test('genus rank: returns name with (genus) suffix', () => {
    expect(buildTaxonLabel('Bombus', 'genus')).toBe('Bombus (genus)');
  });

  test('subgenus rank: returns name with (subgenus) suffix', () => {
    expect(buildTaxonLabel('Bombus', 'subgenus')).toBe('Bombus (subgenus)');
  });

  test('complex rank: returns name with "complex" suffix (not parenthetical)', () => {
    expect(buildTaxonLabel('Bombus fervidus', 'complex')).toBe('Bombus fervidus complex');
  });

  test('species rank: returns plain name', () => {
    expect(buildTaxonLabel('Bombus fervidus', 'species')).toBe('Bombus fervidus');
  });
});

// ---- URL-restore display-name resolution (MFILT-03 regression) ----
// On URL/history restore the filter carries only the integer taxon_id; the
// "Species or group" input must show the resolved label, not an empty box.

describe('resolveTaxonDisplayName (URL restore)', () => {
  const cache = new Map<number, TaxonCacheEntry>([
    [52775, { rank: 'genus', name: 'Bombus', lineagePath: '/1/52775/' }],
    [538903, { rank: 'subgenus', name: 'Bombus', lineagePath: '/1/52775/538903/' }],
    [11977, { rank: 'subfamily', name: 'Halictinae', lineagePath: '/1/11977/' }],
  ]);

  test('resolves a restored genus taxon_id to its autocomplete label', () => {
    expect(resolveTaxonDisplayName(52775, cache)).toBe('Bombus (genus)');
  });

  test('disambiguates the genus/subgenus twin by rank', () => {
    expect(resolveTaxonDisplayName(538903, cache)).toBe('Bombus (subgenus)');
  });

  test('subfamily (previously-absent rank) resolves to a plain name', () => {
    expect(resolveTaxonDisplayName(11977, cache)).toBe('Halictinae');
  });

  test('returns null for an unknown id (stale bookmark) — input left empty', () => {
    expect(resolveTaxonDisplayName(999999, cache)).toBeNull();
  });

  test('label matches what buildTaxonOptions emits for the same taxon', () => {
    const opts = buildTaxonOptions(new Set([538903]), cache);
    const selected = opts.find(o => o.taxonId === 538903)!;
    expect(resolveTaxonDisplayName(538903, cache)).toBe(selected.label);
  });
});

// ---- D-05 ordering tests ----

describe('D-05 sort ordering', () => {
  test('RANK_ORDER has family=0 and species=7', () => {
    expect(RANK_ORDER['family']).toBe(0);
    expect(RANK_ORDER['species']).toBe(7);
  });

  test('broader ranks sort before narrower ranks (tribe < genus < subgenus < complex < species)', () => {
    const options: TaxonOption[] = [
      { label: 'Bombus appositus', taxonId: 1, rank: 'species' },
      { label: 'Bombus (subgenus)', taxonId: 2, rank: 'subgenus' },
      { label: 'Bombus fervidus complex', taxonId: 3, rank: 'complex' },
      { label: 'Bombus (genus)', taxonId: 4, rank: 'genus' },
      { label: 'Bombini', taxonId: 5, rank: 'tribe' },
      { label: 'Bombus bifarius', taxonId: 6, rank: 'species' },
    ];
    const sorted = [...options].sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    });
    const ranks = sorted.map(o => o.rank);
    // tribe before genus before subgenus before complex before species
    expect(ranks[0]).toBe('tribe');
    expect(ranks[1]).toBe('genus');
    expect(ranks[2]).toBe('subgenus');
    expect(ranks[3]).toBe('complex');
    expect(ranks[4]).toBe('species');
    expect(ranks[5]).toBe('species');
  });

  test('alphabetical within rank: "bomb" prefix — Bombus appositus before Bombus bifarius', () => {
    const options: TaxonOption[] = [
      { label: 'Bombus bifarius', taxonId: 6, rank: 'species' },
      { label: 'Bombus appositus', taxonId: 1, rank: 'species' },
    ];
    const sorted = [...options].sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    });
    expect(sorted[0]!.label).toBe('Bombus appositus');
    expect(sorted[1]!.label).toBe('Bombus bifarius');
  });
});

// ---- Enumeration helper tests ----

describe('buildTaxonOptions (D-01 enumeration)', () => {
  // Fixture: taxa cache with a simple lineage
  // Apidae (family, is_anthophila=1, taxon_id=1) lineage: /1/
  // Bombus (genus, is_anthophila=1, taxon_id=2) lineage: /1/2/
  // Bombus fervidus (species, is_anthophila=1, taxon_id=3) lineage: /1/2/3/
  // Apis (genus, is_anthophila=1, taxon_id=4) lineage: /1/4/
  // Vespula (genus, is_anthophila=0, taxon_id=5) — bycatch

  const taxonCache = new Map([
    [1, { rank: 'family', name: 'Apidae', lineagePath: null }],
    [2, { rank: 'genus', name: 'Bombus', lineagePath: '/1/2/' }],
    [3, { rank: 'species', name: 'Bombus fervidus', lineagePath: '/1/2/3/' }],
    [4, { rank: 'genus', name: 'Apis', lineagePath: '/1/4/' }],
    // taxon_id=5 (bycatch) is NOT in the is_anthophila=1 cache — correct by construction
  ]);

  test('present taxon (species) is included in eligible set', () => {
    const presentIds = new Set([3]); // Bombus fervidus present
    const options = buildTaxonOptions(presentIds, taxonCache);
    const ids = options.map(o => o.taxonId);
    expect(ids).toContain(3); // species itself
  });

  test('anthophila ancestors of present taxon are included', () => {
    const presentIds = new Set([3]); // Bombus fervidus present
    const options = buildTaxonOptions(presentIds, taxonCache);
    const ids = options.map(o => o.taxonId);
    expect(ids).toContain(2); // Bombus (genus) is ancestor
    expect(ids).toContain(1); // Apidae (family) is ancestor
  });

  test('taxa with no descendant occurrences are excluded', () => {
    const presentIds = new Set([3]); // Only Bombus fervidus present — Apis has no occurrences
    const options = buildTaxonOptions(presentIds, taxonCache);
    const ids = options.map(o => o.taxonId);
    expect(ids).not.toContain(4); // Apis has no occurrences
  });

  test('bycatch taxa (not in anthophila cache) are excluded', () => {
    // taxon_id=5 is bycatch (is_anthophila=0) — it's not in taxonCache at all
    const presentIds = new Set([5]); // Vespula present in occurrences
    const options = buildTaxonOptions(presentIds, taxonCache);
    const ids = options.map(o => o.taxonId);
    expect(ids).not.toContain(5);
  });

  test('uses D-03 labels for options', () => {
    const presentIds = new Set([3]);
    const options = buildTaxonOptions(presentIds, taxonCache);
    const bombusOption = options.find(o => o.taxonId === 2);
    expect(bombusOption?.label).toBe('Bombus (genus)');
    const apidaeOption = options.find(o => o.taxonId === 1);
    expect(apidaeOption?.label).toBe('Apidae');
  });
});

// ---- getSuggestions taxon token shape test ----

describe('getSuggestions taxon token shape', () => {
  const taxaOptions: TaxonOption[] = [
    { label: 'Bombus (genus)', taxonId: 52775, rank: 'genus' },
    { label: 'Bombini', taxonId: 100, rank: 'tribe' },
    { label: 'Bombus fervidus', taxonId: 200, rank: 'species' },
  ];

  test('yields tokens of shape {type:"taxon", taxonId, taxonDisplayName}', () => {
    const results = getSuggestions('bomb', taxaOptions, [], [], [], []);
    const taxonResults = results.filter(r => r.token.type === 'taxon');
    expect(taxonResults.length).toBeGreaterThan(0);
    for (const r of taxonResults) {
      const token = r.token as { type: 'taxon'; taxonId: number; taxonDisplayName: string };
      expect(typeof token.taxonId).toBe('number');
      expect(typeof token.taxonDisplayName).toBe('string');
      expect(token.taxonDisplayName).toBe(r.label);
    }
  });

  test('preserves array order from taxaOptions (D-05 order inherited)', () => {
    const results = getSuggestions('bomb', taxaOptions, [], [], [], []);
    const taxonResults = results.filter(r => r.token.type === 'taxon');
    // taxaOptions has tribe(100) before genus(52775) but we passed genus first —
    // since order is preserved, Bombus (genus) should appear before Bombini
    // Wait: taxaOptions is [genus, tribe, species] — result should match
    const ids = taxonResults.map(r => (r.token as any).taxonId);
    expect(ids[0]).toBe(52775); // Bombus (genus) — first in array
    expect(ids[1]).toBe(100);   // Bombini — second
    expect(ids[2]).toBe(200);   // Bombus fervidus — third
  });

  test('label in suggestion matches opt.label', () => {
    const results = getSuggestions('bomb', taxaOptions, [], [], [], []);
    const taxonResult = results.find(r => r.token.type === 'taxon' && (r.token as any).taxonId === 52775);
    expect(taxonResult?.label).toBe('Bombus (genus)');
  });
});
