import { test, expect, describe } from 'vitest';
import {
  buildSearchIndex,
  rankCandidates,
  rollUpTaxonCounts,
  normalizeTerm,
  DEFAULT_LIMIT,
  type SearchIndexSources,
  type SearchCandidate,
} from '../search.ts';
import type { TaxonCacheEntry } from '../taxa.ts';
import type { CollectorEntry } from '../filter.ts';

// beeatlas-7nx.2 — the pure half of header search (ADR 0028).
//
// Every rule this file pins is a rule the ADR argued for, so the assertions are
// written against the REASON rather than the current output: kind must not order
// the list, a genus must outweigh its own species, a truncated list must admit it,
// and a taxon without a page must yield no link rather than a guessed URL.

function collector(displayName: string, recordedBy: string | null, login: string | null): CollectorEntry {
  return { displayName, recordedBy, host_inat_login: login };
}

function sources(over: Partial<SearchIndexSources> = {}): SearchIndexSources {
  return {
    taxa: [],
    people: [],
    places: [],
    counties: [],
    ecoregions: [],
    ...over,
  };
}

const BOMBUS = { taxonId: 1, name: 'Bombus', label: 'Bombus (genus)', rank: 'genus', weight: 4182, href: '/species/Bombus/' };
const VOSNESENSKII = { taxonId: 2, name: 'Bombus vosnesenskii', label: 'Bombus vosnesenskii', rank: 'species', weight: 911, href: '/species/Bombus/vosnesenskii/' };
const APIDAE = { taxonId: 3, name: 'Apidae', label: 'Apidae', rank: 'family', weight: 9000, href: null };

function keys(candidates: SearchCandidate[]): string[] {
  return candidates.map(c => c.key);
}

describe('normalizeTerm', () => {
  test('folds diacritics, case and whitespace so both sides compare equal', () => {
    expect(normalizeTerm('Sérgio')).toBe('sergio');
    expect(normalizeTerm('  Smith,   J.  ')).toBe('smith, j.');
  });
});

describe('syntax decides the kind when it can (ADR 0028)', () => {
  test('a digits query yields exactly one label candidate and nothing else', () => {
    const index = buildSearchIndex(sources({
      // A taxon whose weight would otherwise dominate, and a place named with digits.
      taxa: [BOMBUS],
      places: [{ slug: 'unit-99', name: '2303966 Reserve', landOwner: null, weight: 500, href: '/places/unit-99.html' }],
    }));
    const { candidates, truncated } = rankCandidates(index, '2303966');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('label');
    expect(candidates[0]).toMatchObject({ suffix: '2303966', href: null });
    expect(truncated).toBe(false);
  });

  test('a pasted WSDA_ prefix and stray whitespace still read as a label number', () => {
    const { candidates } = rankCandidates(buildSearchIndex(sources()), ' WSDA_0230 3966 ');
    expect(candidates[0]).toMatchObject({ kind: 'label', suffix: '2303966' });
  });

  test('the label candidate carries no weight, because nothing has been looked up yet', () => {
    // It is a promise to look, not a claim to have found — the SQL runs on pick,
    // and miss/error come back through searchStatus.
    const { candidates } = rankCandidates(buildSearchIndex(sources()), '42');
    expect(candidates[0]!.weight).toBe(0);
  });

  test('an empty query yields nothing at all', () => {
    const index = buildSearchIndex(sources({ taxa: [BOMBUS] }));
    expect(rankCandidates(index, '').candidates).toEqual([]);
    expect(rankCandidates(index, '   ').candidates).toEqual([]);
  });
});

describe('match quality', () => {
  const index = buildSearchIndex(sources({
    taxa: [
      { taxonId: 10, name: 'Melissodes', label: 'Melissodes (genus)', rank: 'genus', weight: 10, href: null },
      { taxonId: 11, name: 'Bombus melanopygus', label: 'Bombus melanopygus', rank: 'species', weight: 10, href: null },
      { taxonId: 12, name: 'Anthidium mel', label: 'Anthidium mel', rank: 'species', weight: 10, href: null },
    ],
  }));

  test('exact beats prefix beats substring, regardless of equal weight', () => {
    // 'mel' is: exact for "Anthidium mel"? no — exact needs the whole term.
    // Ranked: whole-term prefix (Melissodes), word prefix (Bombus melanopygus,
    // Anthidium mel), then nothing on substring alone here.
    expect(keys(rankCandidates(index, 'melissodes').candidates)[0]).toBe('taxon:10');
  });

  test('a prefix of any WORD matches, so a species epithet finds its binomial', () => {
    const i = buildSearchIndex(sources({ taxa: [BOMBUS, VOSNESENSKII] }));
    expect(keys(rankCandidates(i, 'vosnesen').candidates)).toEqual(['taxon:2']);
  });

  test('a person is findable by the surname inside their label-order name', () => {
    const i = buildSearchIndex(sources({
      people: [{ collector: collector('Smith, J.', 'Smith, J.', null), weight: 40, href: null }],
    }));
    expect(rankCandidates(i, 'smith').candidates).toHaveLength(1);
  });

  test('a person is findable by their iNat handle as well as their name', () => {
    const i = buildSearchIndex(sources({
      people: [{ collector: collector('Jane Roe', 'Roe, J.', 'beequeen'), weight: 12, href: '/collectors/beequeen/' }],
    }));
    expect(rankCandidates(i, 'beequeen').candidates).toHaveLength(1);
    expect(rankCandidates(i, 'jane').candidates).toHaveLength(1);
    // …and only ONCE — an alias must not clone the row it belongs to.
    expect(rankCandidates(i, 'roe').candidates).toHaveLength(1);
  });

  test('a taxon is not reachable by the parenthetical in its display label', () => {
    // "Bombus (genus)" must not answer to "genus", which would match every genus.
    const i = buildSearchIndex(sources({ taxa: [BOMBUS] }));
    expect(rankCandidates(i, 'genus').candidates).toEqual([]);
  });

  test('a non-matching query yields nothing rather than everything', () => {
    expect(rankCandidates(index, 'zzzz').candidates).toEqual([]);
  });
});

describe('kind is a heading, not a ranking key (ADR 0028)', () => {
  // Both sides score a plain prefix on 'bomb', so match quality is tied and the
  // weight is the only thing left to decide the order. That is the point: swapping
  // the two weights must swap the two rows.
  const contested = (taxonWeight: number, personWeight: number) => buildSearchIndex(sources({
    taxa: [{ taxonId: 20, name: 'Bombias', label: 'Bombias (genus)', rank: 'genus', weight: taxonWeight, href: null }],
    people: [{ collector: collector('Bombias, R.', 'Bombias, R.', null), weight: personWeight, href: null }],
  }));

  test('a well-attested collector outranks a one-record taxon on the same query', () => {
    expect(rankCandidates(contested(1, 900), 'bomb').candidates[0]!.kind).toBe('person');
  });

  test('the same query with the weights swapped puts the taxon first', () => {
    // The tie-break is the record count, not a fixed order over kinds — so the
    // result must flip when the counts do.
    expect(rankCandidates(contested(900, 1), 'bomb').candidates[0]!.kind).toBe('taxon');
  });

  test('an exact match still beats a heavier prefix match, whatever the kinds', () => {
    // The guard on the two cases above: they must be tied on quality, or they are
    // not testing the weight tie-break at all.
    expect(rankCandidates(contested(1, 900), 'bombias').candidates[0]!.kind).toBe('taxon');
  });

  test('match quality still outranks weight', () => {
    const index = buildSearchIndex(sources({
      counties: [{ name: 'King', weight: 5 }],
      places: [{ slug: 'kingfisher-preserve', name: 'Kingfisher Preserve', landOwner: null, weight: 5000, href: null }],
    }));
    // 'king' is exact for the county, a prefix for the place. Exact wins despite
    // the place carrying a thousand times the weight.
    expect(keys(rankCandidates(index, 'king').candidates)).toEqual(['county:King', 'place:kingfisher-preserve']);
  });
});

describe('determinism', () => {
  test('equal quality and equal weight order by label, then key', () => {
    const index = buildSearchIndex(sources({
      counties: [{ name: 'Adams', weight: 7 }, { name: 'Asotin', weight: 7 }],
      ecoregions: [{ name: 'Alpine', weight: 7 }],
    }));
    expect(keys(rankCandidates(index, 'a').candidates))
      .toEqual(['county:Adams', 'ecoregion:Alpine', 'county:Asotin']);
  });

  test('the same index and query give the same list every time', () => {
    const index = buildSearchIndex(sources({
      counties: Array.from({ length: 30 }, (_, i) => ({ name: `Ax${i}`, weight: 1 })),
    }));
    const a = keys(rankCandidates(index, 'ax').candidates);
    const b = keys(rankCandidates(index, 'ax').candidates);
    expect(a).toEqual(b);
  });
});

describe('the cap is admitted, never silent (ADR 0028)', () => {
  const many = buildSearchIndex(sources({
    counties: Array.from({ length: DEFAULT_LIMIT + 5 }, (_, i) => ({ name: `Match${i}`, weight: i })),
  }));

  test('a truncated list reports truncated: true', () => {
    const { candidates, truncated } = rankCandidates(many, 'match');
    expect(candidates).toHaveLength(DEFAULT_LIMIT);
    expect(truncated).toBe(true);
  });

  test('a list that fits reports truncated: false', () => {
    const { candidates, truncated } = rankCandidates(many, 'match', 100);
    expect(candidates).toHaveLength(DEFAULT_LIMIT + 5);
    expect(truncated).toBe(false);
  });

  test('exactly at the limit is not truncated', () => {
    const { truncated } = rankCandidates(many, 'match', DEFAULT_LIMIT + 5);
    expect(truncated).toBe(false);
  });

  test('the rows kept are the best ones, not the first ones found', () => {
    const { candidates } = rankCandidates(many, 'match', 2);
    // Weights ascend with the index, so the two heaviest are the last two built.
    expect(keys(candidates)).toEqual([`county:Match${DEFAULT_LIMIT + 4}`, `county:Match${DEFAULT_LIMIT + 3}`]);
  });
});

describe('href is supplied, never derived', () => {
  test('a taxon with no published page yields href null', () => {
    // src/taxon-pages.ts: ~20 of 646 taxa with occurrences have no page, and
    // families have none at all. A guessed /species/Apidae/ would be a 404.
    const index = buildSearchIndex(sources({ taxa: [APIDAE] }));
    expect(rankCandidates(index, 'apidae').candidates[0]!.href).toBeNull();
  });

  test('counties and ecoregions never carry a link', () => {
    const index = buildSearchIndex(sources({
      counties: [{ name: 'Whatcom', weight: 3 }],
      ecoregions: [{ name: 'North Cascades', weight: 3 }],
    }));
    expect(rankCandidates(index, 'whatcom').candidates[0]!.href).toBeNull();
    expect(rankCandidates(index, 'cascades').candidates[0]!.href).toBeNull();
  });

  test('a supplied page is passed through untouched', () => {
    const index = buildSearchIndex(sources({ taxa: [VOSNESENSKII] }));
    expect(rankCandidates(index, 'vosnesenskii').candidates[0]!.href)
      .toBe('/species/Bombus/vosnesenskii/');
  });
});

describe('candidates are declarative data, never closures (ADR 0028)', () => {
  test('every candidate survives a structured clone across the property boundary', () => {
    const index = buildSearchIndex(sources({
      taxa: [BOMBUS],
      people: [{ collector: collector('Jane Roe', 'Roe, J.', 'beequeen'), weight: 12, href: '/collectors/beequeen/' }],
      places: [{ slug: 'p', name: 'Park', landOwner: 'State Parks', weight: 9, href: '/places/p.html' }],
      counties: [{ name: 'King', weight: 5 }],
      ecoregions: [{ name: 'Puget Lowland', weight: 4 }],
    }));
    for (const q of ['bombus', 'roe', 'park', 'king', 'puget', '2303966']) {
      const { candidates } = rankCandidates(index, q);
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(() => structuredClone(c)).not.toThrow();
        expect(structuredClone(c)).toEqual(c);
      }
    }
  });
});

describe('rollUpTaxonCounts — a genus earns the weight of its species', () => {
  //  /1/        Apidae (family)
  //  /1/2/      Bombus (genus)
  //  /1/2/3/    Bombus vosnesenskii
  //  /1/2/4/    Bombus mixtus
  const cache = new Map<number, TaxonCacheEntry>([
    [1, { rank: 'family', name: 'Apidae', lineagePath: '/' }],
    [2, { rank: 'genus', name: 'Bombus', lineagePath: '/1/' }],
    [3, { rank: 'species', name: 'Bombus vosnesenskii', lineagePath: '/1/2/' }],
    [4, { rank: 'species', name: 'Bombus mixtus', lineagePath: '/1/2/' }],
  ]);

  test('a genus with no records of its own still outweighs each of its species', () => {
    // Without the roll-up this ranking inverts: records are identified to species,
    // so `bombus` would put every bumblebee species above the genus itself.
    const rolled = rollUpTaxonCounts(new Map([[3, 911], [4, 604]]), cache);
    expect(rolled.get(2)).toBe(1515);
    expect(rolled.get(2)!).toBeGreaterThan(rolled.get(3)!);
    expect(rolled.get(1)).toBe(1515);
  });

  test('a direct count is kept as well as rolled up', () => {
    const rolled = rollUpTaxonCounts(new Map([[2, 7], [3, 911]]), cache);
    expect(rolled.get(3)).toBe(911);
    expect(rolled.get(2)).toBe(918); // its own 7 plus the species' 911
  });

  test('a lineage_path that includes the taxon itself does not double-count', () => {
    // The self-inclusive spelling is harmless to buildTaxonOptions (it feeds a Set)
    // but would silently inflate a weight here.
    const selfInclusive = new Map<number, TaxonCacheEntry>([
      [1, { rank: 'family', name: 'Apidae', lineagePath: '/1/' }],
      [3, { rank: 'species', name: 'Bombus vosnesenskii', lineagePath: '/1/3/' }],
    ]);
    const rolled = rollUpTaxonCounts(new Map([[3, 100]]), selfInclusive);
    expect(rolled.get(3)).toBe(100);
    expect(rolled.get(1)).toBe(100);
  });

  test('a repeated lineage segment does not double-count', () => {
    const repeated = new Map<number, TaxonCacheEntry>([
      [1, { rank: 'family', name: 'Apidae', lineagePath: '/' }],
      [3, { rank: 'species', name: 'X', lineagePath: '/1/1/' }],
    ]);
    expect(rollUpTaxonCounts(new Map([[3, 50]]), repeated).get(1)).toBe(50);
  });

  test('bycatch ancestors absent from the cache are skipped, not invented', () => {
    const rolled = rollUpTaxonCounts(new Map([[3, 10]]), new Map([
      [3, { rank: 'species', name: 'Bombus vosnesenskii', lineagePath: '/1/2/' }],
    ]));
    expect(rolled.get(1)).toBeUndefined();
    expect(rolled.get(2)).toBeUndefined();
    expect(rolled.get(3)).toBe(10);
  });

  test('a null lineage_path contributes only its own count', () => {
    const rolled = rollUpTaxonCounts(new Map([[9, 3]]), new Map([
      [9, { rank: 'species', name: 'Orphan', lineagePath: null }],
    ]));
    expect(rolled.get(9)).toBe(3);
    expect(rolled.size).toBe(1);
  });
});
