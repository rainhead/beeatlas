import { test, expect, describe, vi } from 'vitest';
import { buildFilterSQL, queryTablePage, SPECIMEN_COLUMNS, SAMPLE_COLUMNS } from '../filter.ts';
import type { FilterState } from '../filter.ts';
import { getDuckDB } from '../duckdb.ts';

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

describe('SPECIMEN_COLUMNS and SAMPLE_COLUMNS', () => {
  test('SPECIMEN_COLUMNS maps species to scientificName', () => {
    expect(SPECIMEN_COLUMNS['species']).toBe('scientificName');
  });

  test('SPECIMEN_COLUMNS maps collector to recordedBy', () => {
    expect(SPECIMEN_COLUMNS['collector']).toBe('recordedBy');
  });

  test('SPECIMEN_COLUMNS maps date, year, month, county, fieldNumber correctly', () => {
    expect(SPECIMEN_COLUMNS['date']).toBe('date');
    expect(SPECIMEN_COLUMNS['year']).toBe('year');
    expect(SPECIMEN_COLUMNS['month']).toBe('month');
    expect(SPECIMEN_COLUMNS['county']).toBe('county');
    expect(SPECIMEN_COLUMNS['fieldNumber']).toBe('fieldNumber');
  });

  test('SPECIMEN_COLUMNS maps ecoregion to ecoregion_l3', () => {
    expect(SPECIMEN_COLUMNS['ecoregion']).toBe('ecoregion_l3');
  });

  test('SAMPLE_COLUMNS maps observer, date, specimenCount, sampleId, county, ecoregion correctly', () => {
    expect(SAMPLE_COLUMNS['observer']).toBe('observer');
    expect(SAMPLE_COLUMNS['date']).toBe('date');
    expect(SAMPLE_COLUMNS['specimenCount']).toBe('specimen_count');
    expect(SAMPLE_COLUMNS['sampleId']).toBe('sample_id');
    expect(SAMPLE_COLUMNS['county']).toBe('county');
    expect(SAMPLE_COLUMNS['ecoregion']).toBe('ecoregion_l3');
  });
});

function mockDuckDB(dataRows: any[], countValue: number) {
  const closeFn = vi.fn(() => Promise.resolve());
  const queryFn = vi.fn((sql: string) => {
    if (sql.includes('COUNT(*)')) {
      return Promise.resolve({
        toArray: () => [{ toJSON: () => ({ n: countValue }) }],
      });
    }
    return Promise.resolve({
      toArray: () => dataRows.map(r => ({ toJSON: () => r })),
    });
  });
  const connectFn = vi.fn(() => Promise.resolve({ query: queryFn, close: closeFn }));
  vi.mocked(getDuckDB).mockResolvedValue({ connect: connectFn } as any);
  return { connectFn, queryFn, closeFn };
}

describe('queryTablePage', () => {
  test('specimens: SQL contains scientificName, recordedBy, date, year, month, county, ecoregion_l3, fieldNumber', async () => {
    const { queryFn } = mockDuckDB([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 'date', 'desc', 1);
    const dataSql = queryFn.mock.calls.find((c: string[]) => !c[0].includes('COUNT(*)'))?.[0] ?? '';
    expect(dataSql).toContain('scientificName');
    expect(dataSql).toContain('recordedBy');
    expect(dataSql).toContain('date');
    expect(dataSql).toContain('year');
    expect(dataSql).toContain('month');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
    expect(dataSql).toContain('fieldNumber');
  });

  test('specimens: SQL contains ORDER BY and LIMIT 100 OFFSET', async () => {
    const { queryFn } = mockDuckDB([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 'date', 'desc', 1);
    const dataSql = queryFn.mock.calls.find((c: string[]) => !c[0].includes('COUNT(*)'))?.[0] ?? '';
    expect(dataSql).toContain('ORDER BY');
    expect(dataSql).toContain('LIMIT 100');
    expect(dataSql).toContain('OFFSET');
  });

  test('samples: SQL contains observer, date, specimen_count, sample_id, county, ecoregion_l3', async () => {
    const { queryFn } = mockDuckDB([], 0);
    await queryTablePage(emptyFilter(), 'samples', 'date', 'desc', 1);
    const dataSql = queryFn.mock.calls.find((c: string[]) => !c[0].includes('COUNT(*)'))?.[0] ?? '';
    expect(dataSql).toContain('observer');
    expect(dataSql).toContain('date');
    expect(dataSql).toContain('specimen_count');
    expect(dataSql).toContain('sample_id');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
  });

  test('returns { rows, total } with total from COUNT(*)', async () => {
    const dataRows = [{ scientificName: 'Bombus', recordedBy: 'Smith', year: 2020, month: 6, county: 'King', ecoregion_l3: 'Cascades', fieldNumber: 'ABC' }];
    mockDuckDB(dataRows, 42);
    const result = await queryTablePage(emptyFilter(), 'specimens', 'year', 'desc', 1);
    expect(result.total).toBe(42);
    expect(result.rows).toHaveLength(1);
  });

  test('invalid sort column falls back to default sort column', async () => {
    const { queryFn } = mockDuckDB([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 'DROP TABLE', 'desc', 1);
    const dataSql = queryFn.mock.calls.find((c: string[]) => !c[0].includes('COUNT(*)'))?.[0] ?? '';
    // Should NOT contain the injection string
    expect(dataSql).not.toContain('DROP TABLE');
    // Should fall back to default 'date'
    expect(dataSql).toContain('ORDER BY date');
  });

  test('conn.close is called even when query throws', async () => {
    const closeFn = vi.fn(() => Promise.resolve());
    const queryFn = vi.fn(() => Promise.reject(new Error('query failed')));
    const connectFn = vi.fn(() => Promise.resolve({ query: queryFn, close: closeFn }));
    vi.mocked(getDuckDB).mockResolvedValue({ connect: connectFn } as any);
    await expect(queryTablePage(emptyFilter(), 'specimens', 'year', 'desc', 1)).rejects.toThrow('query failed');
    expect(closeFn).toHaveBeenCalledOnce();
  });
});
