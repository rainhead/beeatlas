import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest';
import { buildFilterSQL, buildCsvFilename, queryTablePage, OCCURRENCE_COLUMNS, isFilterActive, getOccurrences } from '../filter.ts';
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
    taxonId: null,
    taxonDisplayName: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
    selectedPlace: null,
    nearMe: false,
  };
}

describe('empty filter', () => {
  test('returns 1 = 1 for the unified clause', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).toBe('1 = 1');
  });
});

describe('individual filter fields', () => {
  // Descendant taxon_id clause tests (MFILT-01)
  test('taxonId set: occurrenceWhere contains taxon_id = N self-match', () => {
    const f = { ...emptyFilter(), taxonId: 52775 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('taxon_id = 52775');
  });

  test('taxonId set: occurrenceWhere contains instr(lineage_path) descendant subquery', () => {
    const f = { ...emptyFilter(), taxonId: 52775 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain("instr(lineage_path, '/52775/')");
  });

  test('taxonId set: occurrenceWhere does NOT contain family =, genus =, or scientificName =', () => {
    const f = { ...emptyFilter(), taxonId: 52775 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).not.toContain('family =');
    expect(occurrenceWhere).not.toContain('genus =');
    expect(occurrenceWhere).not.toContain('scientificName =');
  });

  test('taxonId null: no taxon_id reference in occurrenceWhere', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).not.toContain('taxon_id');
  });

  test('taxonId set: composes with county filter using AND', () => {
    const f = { ...emptyFilter(), taxonId: 52775, selectedCounties: new Set(['King']) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('taxon_id = 52775');
    expect(occurrenceWhere).toContain("county IN ('King')");
    expect(occurrenceWhere).toContain(' AND ');
  });

  test('isFilterActive: taxonId non-null returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), taxonId: 52775 })).toBe(true);
  });

  test('isFilterActive: emptyFilter (taxonId null) returns false (when no other fields set)', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
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
      taxonId: 52775,
      taxonDisplayName: 'Bombus (genus)',
      yearFrom: 2020,
      yearTo: 2023,
      months: new Set([6, 7]),
      selectedCounties: new Set(['King']),
      selectedEcoregions: new Set(['Cascades']),
      selectedCollectors: [],
      elevMin: null,
      elevMax: null,
      selectedPlace: null,
    };
    const { occurrenceWhere } = buildFilterSQL(f);

    expect(occurrenceWhere).toContain('taxon_id = 52775');
    expect(occurrenceWhere).toContain("instr(lineage_path, '/52775/')");
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
  test('no filter active: occurrences-all-20260115.csv', () => {
    expect(buildCsvFilename(emptyFilter())).toBe('occurrences-all-20260115.csv');
  });

  test('taxon only: occurrences-bombus-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus' };
    expect(buildCsvFilename(f)).toBe('occurrences-bombus-20260115.csv');
  });

  test('taxon + same yearFrom/yearTo: occurrences-bombus-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus', yearFrom: 2023, yearTo: 2023 };
    expect(buildCsvFilename(f)).toBe('occurrences-bombus-2023-20260115.csv');
  });

  test('taxon + year range: occurrences-bombus-2020-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus', yearFrom: 2020, yearTo: 2023 };
    expect(buildCsvFilename(f)).toBe('occurrences-bombus-2020-2023-20260115.csv');
  });

  test('taxon + county: occurrences-bombus-king-20260115.csv (at most 2 segments)', () => {
    const f = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus', selectedCounties: new Set(['King']) };
    expect(buildCsvFilename(f)).toBe('occurrences-bombus-king-20260115.csv');
  });

  test('county only: occurrences-king-20260115.csv', () => {
    const f = { ...emptyFilter(), selectedCounties: new Set(['King']) };
    expect(buildCsvFilename(f)).toBe('occurrences-king-20260115.csv');
  });

  test('collector only: slugified displayName', () => {
    const f = { ...emptyFilter(), selectedCollectors: [{ displayName: 'Roy D. Smith', recordedBy: 'Roy D. Smith', host_inat_login: null }] };
    expect(buildCsvFilename(f)).toBe('occurrences-roy-d-smith-20260115.csv');
  });

  test('only yearFrom set: occurrences-2023-20260115.csv', () => {
    const f = { ...emptyFilter(), yearFrom: 2023 };
    expect(buildCsvFilename(f)).toBe('occurrences-2023-20260115.csv');
  });

  test('taxon with spaces: slugified to lowercase hyphens', () => {
    const f = { ...emptyFilter(), taxonId: 12345, taxonDisplayName: 'Bombus occidentalis' };
    expect(buildCsvFilename(f)).toBe('occurrences-bombus-occidentalis-20260115.csv');
  });

  test('segment truncated to 20 chars max', () => {
    const f = { ...emptyFilter(), taxonId: 12345, taxonDisplayName: 'Averyverylongtaxonnamethatexceeds' };
    const result = buildCsvFilename(f);
    expect(result).toBe('occurrences-averyverylongtaxonna-20260115.csv');
  });
});

describe('single-quote escaping', () => {
  test("taxonId is an integer — integer value appears directly, no user-supplied string is quoted", () => {
    const f = { ...emptyFilter(), taxonId: 42 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('taxon_id = 42');
    // The integer 42 is not wrapped in quotes — no user-controlled string reaches the SQL
    expect(occurrenceWhere).not.toContain("taxon_id = '42'");
    expect(occurrenceWhere).not.toContain("taxon_id = \"42\"");
  });
});

describe('OCCURRENCE_COLUMNS', () => {
  test('OCCURRENCE_COLUMNS includes retained column names', () => {
    expect(OCCURRENCE_COLUMNS).toContain('recordedBy');
    expect(OCCURRENCE_COLUMNS).toContain('date');
    expect(OCCURRENCE_COLUMNS).toContain('county');
    expect(OCCURRENCE_COLUMNS).toContain('ecoregion_l3');
    expect(OCCURRENCE_COLUMNS).toContain('host_inat_login');
    expect(OCCURRENCE_COLUMNS).toContain('specimen_count');
    expect(OCCURRENCE_COLUMNS).toContain('elevation_m');
  });

  test('OCCURRENCE_COLUMNS includes place_slug', () => {
    expect(OCCURRENCE_COLUMNS).toContain('place_slug');
  });

  test('OCCURRENCE_COLUMNS does NOT contain the 4 dropped denormalized columns', () => {
    expect(OCCURRENCE_COLUMNS).not.toContain('scientificName');
    expect(OCCURRENCE_COLUMNS).not.toContain('genus');
    expect(OCCURRENCE_COLUMNS).not.toContain('family');
    expect(OCCURRENCE_COLUMNS).not.toContain('specimen_inat_taxon_name');
  });
});

describe('place filter', () => {
  test('emptyFilter() includes selectedPlace: null', () => {
    const f = emptyFilter();
    expect(f.selectedPlace).toBeNull();
  });

  test('isFilterActive: selectedPlace set returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), selectedPlace: 'ebeys-landing' })).toBe(true);
  });

  test('buildFilterSQL with selectedPlace emits place_slug = clause', () => {
    const f = { ...emptyFilter(), selectedPlace: 'ebeys-landing' };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain("place_slug = 'ebeys-landing'");
  });

  test('buildFilterSQL with selectedPlace null does not mention place_slug', () => {
    const f = { ...emptyFilter(), selectedPlace: null };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).not.toContain('place_slug');
  });

  test("buildFilterSQL escapes single quotes in selectedPlace (o'brien-ranch)", () => {
    const f = { ...emptyFilter(), selectedPlace: "o'brien-ranch" };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain("place_slug = 'o''brien-ranch'");
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
  test('SQL contains recordedBy, date, year, month, county, ecoregion_l3, fieldNumber', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('recordedBy');
    expect(dataSql).toContain('date');
    expect(dataSql).toContain('year');
    expect(dataSql).toContain('month');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
    expect(dataSql).toContain('fieldNumber');
  });

  test('SQL contains LEFT JOIN taxa and t.name AS display_name', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('LEFT JOIN taxa');
    expect(dataSql).toContain('display_name');
    expect(dataSql).toContain('display_rank');
  });

  test('SQL contains FROM occurrences and does NOT contain ecdysis_id IS NOT NULL discriminator', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const allSqls = execFn.mock.calls.map((c: unknown[]) => String(c[1]));
    for (const sql of allSqls) {
      expect(sql).toContain('FROM occurrences');
      expect(sql).not.toContain('ecdysis_id IS NOT NULL');
    }
  });

  test('SQL contains host_inat_login, specimen_count, sample_id alongside specimen columns', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('host_inat_login');
    expect(dataSql).toContain('specimen_count');
    expect(dataSql).toContain('sample_id');
    expect(dataSql).toContain('county');
    expect(dataSql).toContain('ecoregion_l3');
  });

  test('SQL does NOT contain observation_id IS NOT NULL discriminator', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const allSqls = execFn.mock.calls.map((c: unknown[]) => String(c[1]));
    for (const sql of allSqls) {
      expect(sql).not.toContain('observation_id IS NOT NULL');
    }
  });

  test('SQL contains ORDER BY and LIMIT 100 OFFSET', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('ORDER BY');
    expect(dataSql).toContain('LIMIT 100');
    expect(dataSql).toContain('OFFSET');
  });

  test('returns { rows, total } with total from COUNT(*)', async () => {
    const dataRows = [{ display_name: 'Bombus', recordedBy: 'Smith', year: 2020, month: 6, county: 'King', ecoregion_l3: 'Cascades', fieldNumber: 'ABC' }];
    mockSQLite(dataRows, 42);
    const result = await queryTablePage(emptyFilter(), 1);
    expect(result.total).toBe(42);
    expect(result.rows).toHaveLength(1);
  });

  test('error propagates when exec throws', async () => {
    const execFn = vi.fn(() => Promise.reject(new Error('query failed')));
    vi.mocked(getDB).mockResolvedValue({ sqlite3: { exec: execFn } as any, db: 0 });
    await expect(queryTablePage(emptyFilter(), 1)).rejects.toThrow('query failed');
  });

  test('with sortBy=modified: SQL contains modified DESC', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1, 'modified');
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('modified DESC');
  });

  test('with no sortBy (default): SQL contains date DESC', async () => {
    const { execFn } = mockSQLite([], 0);
    await queryTablePage(emptyFilter(), 1);
    const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
    expect(dataSql).toContain('date DESC');
  });
});

describe('getOccurrences', () => {
  test('empty input returns [] without querying SQLite', async () => {
    const { execFn } = mockSQLite([], 0);
    const result = await getOccurrences([]);
    expect(result).toEqual([]);
    expect(execFn).not.toHaveBeenCalled();
  });

  test('ecdysis ID generates ecdysis_id IN clause', async () => {
    const { execFn } = mockSQLite([], 0);
    await getOccurrences(['ecdysis:42']);
    const sql = execFn.mock.calls[0]?.[1] as string;
    expect(sql).toContain('ecdysis_id IN (42)');
    expect(sql).not.toContain('observation_id IN');
  });

  test('inat ID generates observation_id IN clause', async () => {
    const { execFn } = mockSQLite([], 0);
    await getOccurrences(['inat:99']);
    const sql = execFn.mock.calls[0]?.[1] as string;
    expect(sql).toContain('observation_id IN (99)');
    expect(sql).not.toContain('ecdysis_id IN');
  });

  test('inat_obs ID generates specimen_observation_id IN clause', async () => {
    const { execFn } = mockSQLite([], 0);
    await getOccurrences(['inat_obs:7']);
    const sql = execFn.mock.calls[0]?.[1] as string;
    expect(sql).toContain('specimen_observation_id IN (7)');
  });

  test('mixed IDs combine all three clauses with OR', async () => {
    const { execFn } = mockSQLite([], 0);
    await getOccurrences(['ecdysis:1', 'inat:2', 'inat_obs:3']);
    const sql = execFn.mock.calls[0]?.[1] as string;
    expect(sql).toContain('ecdysis_id IN (1)');
    expect(sql).toContain('observation_id IN (2)');
    expect(sql).toContain('specimen_observation_id IN (3)');
    expect(sql).toContain(' OR ');
  });

  test('returns mapped rows from callback', async () => {
    const execFn = vi.fn((_db: number, _sql: string, callback?: (rowValues: unknown[], columnNames: string[]) => void) => {
      callback?.([42, 'Bombus vosnesenskii'], ['ecdysis_id', 'display_name']);
      return Promise.resolve();
    });
    vi.mocked(getDB).mockResolvedValue({ sqlite3: { exec: execFn } as any, db: 0 });
    const rows = await getOccurrences(['ecdysis:42']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ecdysis_id: 42, display_name: 'Bombus vosnesenskii' });
  });
});

describe('nearMe filter (NEAR-01 / NEAR-02)', () => {
  const seattleCenter = { lat: 47.6, lon: -122.3 };

  test('emptyFilter() includes nearMe: false', () => {
    expect(emptyFilter().nearMe).toBe(false);
  });

  test('isFilterActive: nearMe:true returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), nearMe: true })).toBe(true);
  });

  test('isFilterActive: nearMe:false (empty filter) returns false', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
  });

  test('buildFilterSQL with nearMe:true + center emits lat BETWEEN bbox clause', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, seattleCenter);
    expect(occurrenceWhere).toContain('lat BETWEEN');
  });

  test('buildFilterSQL with nearMe:true + center emits lon BETWEEN bbox clause', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, seattleCenter);
    expect(occurrenceWhere).toContain('lon BETWEEN');
  });

  test('buildFilterSQL with nearMe:true + center emits haversine fragment (asin + radians)', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, seattleCenter);
    expect(occurrenceWhere).toContain('asin');
    expect(occurrenceWhere).toContain('radians');
  });

  test('buildFilterSQL with nearMe:true + null center returns 1 = 1 (center is the gate)', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, null);
    expect(occurrenceWhere).toBe('1 = 1');
  });

  test('buildFilterSQL with nearMe:false + center returns 1 = 1 (boolean gates proximity)', () => {
    const f = { ...emptyFilter(), nearMe: false };
    const { occurrenceWhere } = buildFilterSQL(f, seattleCenter);
    expect(occurrenceWhere).toBe('1 = 1');
  });

  test('buildFilterSQL with nearMe:true + NaN lat returns 1 = 1 (isFinite guard)', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, { lat: NaN, lon: -122.3 });
    expect(occurrenceWhere).toBe('1 = 1');
  });

  test('buildFilterSQL with nearMe:true + Infinity lon returns 1 = 1 (isFinite guard)', () => {
    const f = { ...emptyFilter(), nearMe: true };
    const { occurrenceWhere } = buildFilterSQL(f, { lat: 47.6, lon: Infinity });
    expect(occurrenceWhere).toBe('1 = 1');
  });

  test('buildFilterSQL AND-composition: nearMe:true + yearFrom:2020 + center emits both clauses joined by AND', () => {
    const f = { ...emptyFilter(), nearMe: true, yearFrom: 2020 };
    const { occurrenceWhere } = buildFilterSQL(f, seattleCenter);
    expect(occurrenceWhere).toContain('year >= 2020');
    expect(occurrenceWhere).toContain('asin');
    expect(occurrenceWhere).toContain(' AND ');
  });
});
