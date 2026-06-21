import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  queryTablePage,
  queryListPage,
  queryAllFiltered,
  queryOccurrencesByBounds,
  getOccurrences,
  OCCURRENCE_COLUMNS,
  queryVisibleGeoJSON,
} from '../filter.ts';
import type { FilterState } from '../filter.ts';

// Regression coverage for the "ambiguous column name: taxon_id" bug (Phase 131).
//
// filter.test.ts mocks sqlite3 and only inspects the generated SQL *string*, so it
// cannot detect a query that is syntactically present but invalid against the real
// two-table schema. Once `LEFT JOIN taxa t` was added for display_name resolution,
// `taxon_id` existed in BOTH `occurrences` and `taxa`; an unqualified `taxon_id` in
// the shared WHERE clause threw at runtime ("ambiguous column name") but passed the
// string assertions. This suite runs the ACTUAL query functions against a real
// node:sqlite engine seeded with both tables to catch that class of bug.
//
// The adapter below maps the wa-sqlite `sqlite3.exec(db, sql, cb)` API (positional
// row values + column names) onto node:sqlite's DatabaseSync.
const h = vi.hoisted(() => ({ db: null as InstanceType<typeof import('node:sqlite').DatabaseSync> | null }));

vi.mock('../sqlite.ts', () => ({
  getDB: () =>
    Promise.resolve({
      sqlite3: {
        exec: async (
          _db: number,
          sql: string,
          cb?: (rowValues: unknown[], columnNames: string[]) => void
        ) => {
          const rows = h.db!.prepare(sql).all() as Record<string, unknown>[];
          if (cb) {
            for (const row of rows) {
              const cols = Object.keys(row);
              cb(cols.map((c) => row[c]), cols);
            }
          }
        },
      },
      db: 0,
    }),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

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

beforeAll(() => {
  const db = new DatabaseSync(':memory:');
  // Untyped columns are fine — SQLite is dynamically typed and the queries only
  // need the column names present. Mirrors the real OCCURRENCE_COLUMNS set.
  db.exec(`CREATE TABLE occurrences (${OCCURRENCE_COLUMNS.join(', ')})`);
  db.exec(`CREATE TABLE taxa (
    taxon_id INTEGER PRIMARY KEY,
    rank TEXT NOT NULL,
    name TEXT NOT NULL,
    lineage_path TEXT,
    is_anthophila INTEGER NOT NULL
  )`);
  // Bombus (genus 100) -> Bombus vosnesenskii (species 101). lineage_path holds
  // the materialized path used by the descendant filter (instr '/100/').
  db.exec(`INSERT INTO taxa VALUES
    (100, 'genus', 'Bombus', '/630955/100/', 1),
    (101, 'species', 'Bombus vosnesenskii', '/630955/100/101/', 1)`);
  // Row A: identified specimen (taxon_id 101, a descendant of 100).
  //        lat=47.6, lon=-122.3 — exactly at the nearMe fixture center (0 km → inside 10 km).
  // Row B: undetermined occurrence (taxon_id NULL -> display_name must be NULL).
  //        lat=47.7, lon=-122.4 — ~13.4 km from center (outside 10 km).
  db.exec(`INSERT INTO occurrences (taxon_id, lat, lon, year, source, ecdysis_id, date, recordedBy)
    VALUES (101, 47.6, -122.3, 2024, 'ecdysis', 5001, '2024-06-01', 'Alice')`);
  db.exec(`INSERT INTO occurrences (taxon_id, lat, lon, year, source, observation_id, date, recordedBy)
    VALUES (NULL, 47.7, -122.4, 2023, 'inat', 9001, '2023-05-01', 'Bob')`);
  // Row C: lat=47.645, lon=-122.3 — ~4.95 km N of center (inside 10 km).
  //        taxon_id=NULL so it does NOT affect the "taxon filter = 1 descendant" assertion.
  db.exec(`INSERT INTO occurrences (taxon_id, lat, lon, year, source, ecdysis_id, date, recordedBy)
    VALUES (NULL, 47.645, -122.3, 2022, 'ecdysis', 5002, '2022-07-01', 'Carol')`);
  // Row D: lat=48.0, lon=-122.3 — ~44.4 km N of center (outside 10 km).
  //        taxon_id=NULL so it does NOT affect the "taxon filter = 1 descendant" assertion.
  db.exec(`INSERT INTO occurrences (taxon_id, lat, lon, year, source, observation_id, date, recordedBy)
    VALUES (NULL, 48.0, -122.3, 2021, 'inat', 9002, '2021-08-01', 'Dave')`);
  h.db = db;
});

afterAll(() => {
  h.db?.close();
  h.db = null;
});

describe('JOIN queries execute against a real two-table schema with a taxon filter active', () => {
  test('queryTablePage does not throw "ambiguous column name" and resolves display_name', async () => {
    const f = emptyFilter();
    f.taxonId = 100; // genus Bombus — matches descendant species 101 via lineage_path
    const { rows, total } = await queryTablePage(f, 1);
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.taxon_id).toBe(101);
    expect(rows[0]!.display_name).toBe('Bombus vosnesenskii');
    expect(rows[0]!.display_rank).toBe('species');
  });

  test('queryListPage does not throw "ambiguous column name" (the reported failure)', async () => {
    const f = emptyFilter();
    f.taxonId = 100;
    const { rows, total } = await queryListPage(f, 1);
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.display_name).toBe('Bombus vosnesenskii');
  });

  test('queryAllFiltered (CSV export) does not throw with a taxon filter', async () => {
    const f = emptyFilter();
    f.taxonId = 100;
    const rows = await queryAllFiltered(f);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.display_name).toBe('Bombus vosnesenskii');
  });
});

describe('every OccurrenceRow producer resolves display_name via the taxa JOIN', () => {
  // Regression for code-review W-1/INFO-1: getOccurrences and queryOccurrencesByBounds
  // declare OccurrenceRow[] (which has display_name) but previously omitted the JOIN,
  // yielding display_name === undefined for any future consumer.
  test('queryOccurrencesByBounds includes display_name', async () => {
    const f = emptyFilter();
    const rows = await queryOccurrencesByBounds(f, { west: -123, south: 47, east: -122, north: 48 });
    const identified = rows.find((r) => r.taxon_id === 101);
    expect(identified).toBeDefined();
    expect(identified!.display_name).toBe('Bombus vosnesenskii');
  });

  test('getOccurrences includes display_name', async () => {
    const rows = await getOccurrences(['ecdysis:5001']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.display_name).toBe('Bombus vosnesenskii');
  });
});

describe('display_name resolution honors Phase 130 D-07 (null taxon_id)', () => {
  test('undetermined occurrence (taxon_id NULL) yields display_name null, never blank-by-omission', async () => {
    const f = emptyFilter(); // no taxon filter -> all rows returned
    const { rows, total } = await queryTablePage(f, 1);
    expect(total).toBe(4);
    const undetermined = rows.find((r) => r.taxon_id == null);
    expect(undetermined).toBeDefined();
    expect(undetermined!.display_name).toBeNull();
    expect(undetermined!.display_rank).toBeNull();
  });
});

describe('nearMe proximity filter — real node:sqlite engine haversine correctness (NEAR-02)', () => {
  // Fixture center: lat=47.6, lon=-122.3 (Seattle area), radius=10 km.
  //
  // Row A (ecdysis:5001): lat=47.6,   lon=-122.3  — 0 km    from center → INSIDE
  // Row B (inat:9001):   lat=47.7,   lon=-122.4  — ~13.4 km               OUTSIDE
  // Row C (ecdysis:5002): lat=47.645, lon=-122.3  — ~4.95 km               INSIDE
  // Row D (inat:9002):   lat=48.0,   lon=-122.3  — ~44.4 km               OUTSIDE
  //
  // node:sqlite (SQLite 3.x, same math extension as wa-sqlite 3.44.0) supports
  // asin/sqrt/radians/sin/cos/power — the haversine SQL executes for real here.
  const center = { lat: 47.6, lon: -122.3 };

  test('queryListPage with nearMe:true + center returns only in-radius rows (2 of 4)', async () => {
    const f = { ...emptyFilter(), nearMe: true };
    // Wide bounds so all rows pass the outer bounds check; proximity clause does the real work.
    const { rows, total } = await queryListPage(
      f, 1, 'date', [], [], [], [],
      { west: -124, south: 46, east: -121, north: 49 },
      center
    );
    expect(total).toBe(2);
    expect(rows).toHaveLength(2);
    // Exactly rows A and C should be present (ecdysis_id 5001 and 5002)
    const ecdysisIds = rows.map(r => r.ecdysis_id).filter(id => id !== null).sort();
    expect(ecdysisIds).toEqual([5001, 5002]);
  });

  test('queryOccurrencesByBounds with nearMe:true + center returns only in-radius rows (2 of 4)', async () => {
    const f = { ...emptyFilter(), nearMe: true };
    const rows = await queryOccurrencesByBounds(
      f,
      { west: -124, south: 46, east: -121, north: 49 },
      center
    );
    expect(rows).toHaveLength(2);
    const ecdysisIds = rows.map(r => r.ecdysis_id).filter(id => id !== null).sort();
    expect(ecdysisIds).toEqual([5001, 5002]);
  });

  test('queryListPage with nearMe:false returns all 4 rows (proximity off)', async () => {
    const f = { ...emptyFilter(), nearMe: false };
    const { total } = await queryListPage(
      f, 1, 'date', [], [], [], [],
      { west: -124, south: 46, east: -121, north: 49 }
    );
    expect(total).toBe(4);
  });
});
