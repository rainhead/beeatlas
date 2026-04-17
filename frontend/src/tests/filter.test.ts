import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest';
import { buildFilterSQL, buildCsvFilename, queryTablePage, SPECIMEN_COLUMNS, SAMPLE_COLUMNS, isFilterActive } from '../filter.ts';
import type { FilterState } from '../filter.ts';
import { getDB } from '../sqlite.ts';

vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

// Freeze date for deterministic buildCsvFilename tests (date suffix = 20260115).
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-15')); });
afterAll(() => { vi.useRealTimers(); });

function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
  };
}

describe('empty filter', () => {
  test('returns 1 = 1 for the unified clause', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).toBe('1 = 1');
  });
});

describe('individual filter fields', () => {
  test('taxon family: occurrenceWhere contains family clause', () => {
    const f = { ...emptyFilter(), taxonName: 'Apidae', taxonRank: 'family' as const };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("family = 'Apidae'");
  });

  test('taxon genus: occurrenceWhere contains genus clause', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("genus = 'Bombus'");
  });

  test('taxon species: occurrenceWhere contains scientificName clause', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus occidentalis', taxonRank: 'species' as const };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("scientificName = 'Bombus occidentalis'");
  });

  test('yearFrom: occurrenceWhere contains year >= 2020', () => {
    const f = { ...emptyFilter(), yearFrom: 2020 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('year >= 2020');
  });

  test('yearTo: occurrenceWhere contains year <= 2023', () => {
    const f = { ...emptyFilter(), yearTo: 2023 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('year <= 2023');
  });

  test('single month: occurrenceWhere contains month IN (6)', () => {
    const f = { ...emptyFilter(), months: new Set([6]) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('month IN (6)');
  });

  test('multiple months: occurrenceWhere contains comma-separated month list', () => {
    const f = { ...emptyFilter(), months: new Set([3, 7, 11]) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('month IN (3,7,11)');
  });

  test('single county: occurrenceWhere contains county IN', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King']) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("county IN ('King')");
  });

  test('multiple counties: occurrenceWhere contains all county names', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King', 'Pierce']) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain("county IN ('King','Pierce')");
  });

  test('ecoregion: occurrenceWhere contains ecoregion_l3 IN', () => {
    const f = { ...emptyFilter(), selectedEcoregions: new Set(['Cascades']) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("ecoregion_l3 IN ('Cascades')");
  });
});

describe('combined filters', () => {
  test('all fields: occurrenceWhere contains all clauses joined by AND', () => {
    const f: FilterState = {
      taxonName: 'Bombus',
      taxonRank: 'genus',
      yearFrom: 2020,
      yearTo: 2023,
      months: new Set([6, 7]),
      selectedCounties: new Set(['King']),
      selectedEcoregions: new Set(['Cascades']),
      selectedCollectors: [],
      elevMin: null,
      elevMax: null,
    };
    const { occurrenceWhere } = buildFilterSQL(f);

    expect(occurrenceWhere).toContain("genus = 'Bombus'");
    expect(occurrenceWhere).toContain('year >= 2020');
    expect(occurrenceWhere).toContain('year <= 2023');
    expect(occurrenceWhere).toContain('month IN (6,7)');
    expect(occurrenceWhere).toContain("county IN ('King')");
    expect(occurrenceWhere).toContain("ecoregion_l3 IN ('Cascades')");
    expect(occurrenceWhere).toContain(' AND ');
  });
});

describe('elevation filter', () => {
  test('elevMin only: clause uses IS NULL OR >= pattern', () => {
    const f = { ...emptyFilter(), elevMin: 500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('(elevation_m IS NULL OR elevation_m >= 500)');
  });

  test('elevMax only: clause uses IS NULL OR <= pattern', () => {
    const f = { ...emptyFilter(), elevMax: 1500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('(elevation_m IS NULL OR elevation_m <= 1500)');
  });

  test('both set: clause uses BETWEEN (nulls excluded)', () => {
    const f = { ...emptyFilter(), elevMin: 500, elevMax: 1500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe('elevation_m IS NOT NULL AND elevation_m BETWEEN 500 AND 1500');
  });

  test('neither set: no elevation clause; returns 1 = 1', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).toBe('1 = 1');
  });
});

describe('isFilterActive — elevation', () => {
  test('elevMin set: returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), elevMin: 100 })).toBe(true);
  });
  test('elevMax set: returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), elevMax: 2000 })).toBe(true);
  });
  test('both null with no other fields: returns false', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
  });
});

describe('buildCsvFilename', () => {
  // Date frozen to 2026-01-15 → suffix is 20260115.
  test('no filter active: specimens => specimens-all-20260115.csv', () => {
    expect(buildCsvFilename(emptyFilter(), 'specimens')).toBe('specimens-all-20260115.csv');
  });

  test('no filter active: samples => samples-all-20260115.csv', () => {
    expect(buildCsvFilename(emptyFilter(), 'samples')).toBe('samples-all-20260115.csv');
  });

  test('taxon only: specimens-bombus-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-bombus-20260115.csv');
  });

  test('taxon + same yearFrom/yearTo: specimens-bombus-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const, yearFrom: 2023, yearTo: 2023 };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-bombus-2023-20260115.csv');
  });

  test('taxon + year range: specimens-bombus-2020-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const, yearFrom: 2020, yearTo: 2023 };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-bombus-2020-2023-20260115.csv');
  });

  test('taxon + county: specimens-bombus-king-20260115.csv (at most 2 segments)', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const, selectedCounties: new Set(['King']) };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-bombus-king-20260115.csv');
  });

  test('county only: specimens-king-20260115.csv', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King']) };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-king-20260115.csv');
  });

  test('collector only: slugified displayName', () => {
    const f = { ...emptyFilter(), selectedCollectors: [{ displayName: 'Roy D. Smith', recordedBy: 'Roy D. Smith', observer: null }] };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-roy-d-smith-20260115.csv');
  });

  test('only yearFrom set: specimens-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), yearFrom: 2023 };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-2023-20260115.csv');
  });

  test('samples with filter: samples-all-20260115.csv when no filter', () => {
    expect(buildCsvFilename(emptyFilter(), 'samples')).toBe('samples-all-20260115.csv');
  });

  test('taxon with spaces: slugified to lowercase hyphens', () => {
    const f = { ...emptyFilter(), taxonName: 'Bombus occidentalis', taxonRank: 'species' as const };
    expect(buildCsvFilename(f, 'specimens')).toBe('specimens-bombus-occidentalis-20260115.csv');
  });

  test('segment truncated to 20 chars max', () => {
    const f = { ...emptyFilter(), taxonName: 'Averyverylongtaxonnamethatexceeds', taxonRank: 'genus' as const };
    const result = buildCsvFilename(f, 'specimens');
    expect(result).toBe('specimens-averyverylongtaxonna-20260115.csv');
  });
});

describe('single-quote escaping', () => {
  test("taxon with single-quote is doubled in SQL output", () => {
    const f = { ...emptyFilter(), taxonName: "O'Brien", taxonRank: 'genus' as const };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain("genus = 'O''Brien'");
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

function mockSQLite(dataRows: Record<string, unknown>[], countValue: number) {
  const execFn = vi.fn((_db: number, sql: string, callback?: (rowValues: unknown[], columnNames: string[]) => void) => {
    if (sql.includes('COUNT(*)') && callback) {
      callback([countValue], ['n']);
    } else if (callback) {
      const cols = dataRows.length > 0 ? Object.keys(dataRows[0]!) : [];
      for (const row of dataRows) {
        callback(cols.map(c => row[c]), cols);
      }
    }
    return Promise.resolve();
  });
  const mockSqlite3 = { exec: execFn };
  vi.mocked(getDB).mockResolvedValue({ sqlite3: mockSqlite3 as any, db: 0 });
  return { execFn };
}

describe('queryTablePage', () => {
  test('specimens: SQL contains scientificName, recordedBy, date, year, month, county, ecoregion_l3, fieldNumber', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('scientificName');
    expect(dataSql).toContain('recordedBy');
    expect(dataSql).toContain('date');
    expect(dataSql).toContain('year');
    expect(dataSql).toContain('month');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
    expect(dataSql).toContain('fieldNumber');
  });

  test('specimens: SQL contains FROM occurrences and ecdysis_id IS NOT NULL', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 1);
    const allSqls = execFn.mock.calls.map((c: unknown[]) => String(c[1]));
    for (const sql of allSqls) {
      expect(sql).toContain('FROM occurrences');
      expect(sql).toContain('ecdysis_id IS NOT NULL');
    }
  });

  test('specimens: SQL contains ORDER BY and LIMIT 100 OFFSET', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('ORDER BY');
    expect(dataSql).toContain('LIMIT 100');
    expect(dataSql).toContain('OFFSET');
  });

  test('samples: SQL contains observer, date, specimen_count, sample_id, county, ecoregion_l3', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'samples', 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('observer');
    expect(dataSql).toContain('date');
    expect(dataSql).toContain('specimen_count');
    expect(dataSql).toContain('sample_id');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
  });

  test('samples: SQL contains FROM occurrences and observation_id IS NOT NULL', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'samples', 1);
    const allSqls = execFn.mock.calls.map((c: unknown[]) => String(c[1]));
    for (const sql of allSqls) {
      expect(sql).toContain('FROM occurrences');
      expect(sql).toContain('observation_id IS NOT NULL');
    }
  });

  test('returns { rows, total } with total from COUNT(*)', async () => {
    const dataRows = [{ scientificName: 'Bombus', recordedBy: 'Smith', year: 2020, month: 6, county: 'King', ecoregion_l3: 'Cascades', fieldNumber: 'ABC' }];
    mockSQLite(dataRows, 42);
    const result = await queryTablePage(emptyFilter(), 'specimens', 1);
    expect(result.total).toBe(42);
    expect(result.rows).toHaveLength(1);
  });

  test('error propagates when exec throws', async () => {
    const execFn = vi.fn(() => Promise.reject(new Error('query failed')));
    vi.mocked(getDB).mockResolvedValue({ sqlite3: { exec: execFn } as any, db: 0 });
    await expect(queryTablePage(emptyFilter(), 'specimens', 1)).rejects.toThrow('query failed');
  });

  test('specimens with sortBy=modified: SQL contains modified DESC', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 1, 'modified');
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('modified DESC');
  });

  test('specimens with no sortBy (default): SQL contains date DESC', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'specimens', 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('date DESC');
  });

  test('samples with sortBy=modified: SQL still uses date DESC (sample order unchanged)', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 'samples', 1, 'modified');
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('date DESC');
  });
});
