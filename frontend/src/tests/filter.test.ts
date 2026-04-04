import { test, expect, describe, vi } from 'vitest';
import { buildFilterSQL } from '../filter.ts';
import type { FilterState } from '../filter.ts';

// filter.ts imports getDuckDB and tablesReady from duckdb.ts at module level;
// mock to avoid WASM initialization side effects.
vi.mock('../duckdb.ts', () => ({
  getDuckDB: vi.fn(() => Promise.resolve({})),
  loadAllTables: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
  };
}

describe('empty filter', () => {
  test('returns 1 = 1 for both clauses', () => {
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(emptyFilter());
    expect(ecdysisWhere).toBe('1 = 1');
    expect(samplesWhere).toBe('1 = 1');
  });
});

describe('individual filter fields', () => {
  test('taxon family: ecdysisWhere contains family clause; samplesWhere is 1 = 0', () => {
    const f = { ...emptyFilter(), taxonName: 'Apidae', taxonRank: 'family' as const };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe("family = 'Apidae'");
    expect(samplesWhere).toBe('1 = 0');
  });

  test('taxon genus: ecdysisWhere contains genus clause; samplesWhere is 1 = 0', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe("genus = 'Bombus'");
    expect(samplesWhere).toBe('1 = 0');
  });

  test('taxon species: ecdysisWhere contains scientificName clause; samplesWhere is 1 = 0', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus occidentalis', taxonRank: 'species' as const };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe("scientificName = 'Bombus occidentalis'");
    expect(samplesWhere).toBe('1 = 0');
  });

  test('yearFrom: both clauses contain year >= 2020', () => {
    const f = { ...emptyFilter(), yearFrom: 2020 };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('year >= 2020');
    expect(samplesWhere).toBe('year(date::TIMESTAMP) >= 2020');
  });

  test('yearTo: both clauses contain year <= 2023', () => {
    const f = { ...emptyFilter(), yearTo: 2023 };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('year <= 2023');
    expect(samplesWhere).toBe('year(date::TIMESTAMP) <= 2023');
  });

  test('single month: both clauses contain month IN (6)', () => {
    const f = { ...emptyFilter(), months: new Set([6]) };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('month IN (6)');
    expect(samplesWhere).toBe('month(date::TIMESTAMP) IN (6)');
  });

  test('multiple months: both clauses contain comma-separated month list', () => {
    const f = { ...emptyFilter(), months: new Set([3, 7, 11]) };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toContain('month IN (3,7,11)');
    expect(samplesWhere).toContain('month(date::TIMESTAMP) IN (3,7,11)');
  });

  test('single county: both clauses contain county IN', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King']) };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe("county IN ('King')");
    expect(samplesWhere).toBe("county IN ('King')");
  });

  test('multiple counties: both clauses contain all county names', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King', 'Pierce']) };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toContain("county IN ('King','Pierce')");
    expect(samplesWhere).toContain("county IN ('King','Pierce')");
  });

  test('ecoregion: both clauses contain ecoregion_l3 IN', () => {
    const f = { ...emptyFilter(), selectedEcoregions: new Set(['Cascades']) };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe("ecoregion_l3 IN ('Cascades')");
    expect(samplesWhere).toBe("ecoregion_l3 IN ('Cascades')");
  });
});

describe('combined filters', () => {
  test('all fields: ecdysisWhere contains all clauses; samplesWhere has ghost + date clauses', () => {
    const f: FilterState = {
      taxonName: 'Bombus',
      taxonRank: 'genus',
      yearFrom: 2020,
      yearTo: 2023,
      months: new Set([6, 7]),
      selectedCounties: new Set(['King']),
      selectedEcoregions: new Set(['Cascades']),
    };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);

    // ecdysisWhere — all clauses joined by AND
    expect(ecdysisWhere).toContain("genus = 'Bombus'");
    expect(ecdysisWhere).toContain('year >= 2020');
    expect(ecdysisWhere).toContain('year <= 2023');
    expect(ecdysisWhere).toContain('month IN (6,7)');
    expect(ecdysisWhere).toContain("county IN ('King')");
    expect(ecdysisWhere).toContain("ecoregion_l3 IN ('Cascades')");
    expect(ecdysisWhere).toContain(' AND ');

    // samplesWhere — taxon ghosts + date-based year/month + shared county/ecoregion
    expect(samplesWhere).toContain('1 = 0');
    expect(samplesWhere).toContain('year(date::TIMESTAMP) >= 2020');
    expect(samplesWhere).toContain('year(date::TIMESTAMP) <= 2023');
    expect(samplesWhere).toContain('month(date::TIMESTAMP) IN (6,7)');
    expect(samplesWhere).toContain("county IN ('King')");
    expect(samplesWhere).toContain("ecoregion_l3 IN ('Cascades')");
    expect(samplesWhere).toContain(' AND ');
  });
});

describe('single-quote escaping', () => {
  test("taxon with single-quote is doubled in SQL output", () => {
    const f = { ...emptyFilter(), taxonName: "O'Brien", taxonRank: 'genus' as const };
    const { ecdysisWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toContain("genus = 'O''Brien'");
  });
});
