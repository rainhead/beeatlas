import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  parseCatalogSuffix,
  lookupByCatalogSuffix,
  emptyFilterState,
  OCCURRENCE_COLUMNS,
} from '../filter.ts';

// beeatlas-8zs — quick lookup: find a specimen by catalog/label number.
//
// The lookup runs against the REAL engine (node:sqlite), not a SQL-string mock:
// its whole substance is a piece of SQLite string arithmetic standing in for the
// pipeline's `regexp_extract(catalog_number, '[0-9]+$', 0)` (wa-sqlite ships no
// REGEXP). A string assertion could not tell a correct suffix match from one that
// also swallows `WSDA_12303966` when the user typed `2303966`.
//
// Adapter mirrors filter-join-execution.test.ts: maps wa-sqlite's
// `sqlite3.exec(db, sql, cb)` (positional values + column names) onto DatabaseSync.
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

beforeAll(() => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE occurrences (${OCCURRENCE_COLUMNS.join(', ')})`);
  db.exec(`CREATE TABLE taxa (
    taxon_id INTEGER PRIMARY KEY,
    rank TEXT NOT NULL,
    name TEXT NOT NULL,
    lineage_path TEXT,
    is_anthophila INTEGER NOT NULL
  )`);
  db.exec(`INSERT INTO taxa VALUES (101, 'species', 'Bombus vosnesenskii', '/630955/100/101/', 1)`);

  const insert = (cols: string, values: string) =>
    db.exec(`INSERT INTO occurrences (${cols}) VALUES ${values}`);
  const cols = 'taxon_id, lat, lon, year, county, tier, record_type, ecdysis_id, catalog_number, date, recordedBy';
  insert(cols, `
    -- the target: a 7-digit suffix
    (101, 47.6, -122.3, 2024, 'King', 'atlas', 'specimen', 5001, 'WSDA_2303966', '2024-06-01', 'Alice'),
    -- the trap: ends with the same 7 digits, but they are preceded by another digit
    (101, 48.1, -119.9, 2024, 'Chelan', 'atlas', 'specimen', 5002, 'WSDA_12303966', '2024-06-02', 'Bob'),
    -- an 8-digit suffix, and its exact duplicate row (same ecdysis_id -> one record)
    (101, 46.2, -123.1, 2023, 'Clark', 'atlas', 'specimen', 5003, 'WSDA_25023610', '2023-07-03', 'Cleo'),
    (101, 46.2, -123.1, 2023, 'Clark', 'atlas', 'specimen', 5003, 'WSDA_25023610', '2023-07-03', 'Cleo')`);
  // A catalogue-less record, to prove the NULL guard never matches.
  insert('taxon_id, lat, lon, year, tier, record_type, observation_id, date', `(101, 47.7, -122.4, 2023, 'other', 'inat_expert', 9001, '2023-05-01')`);
  h.db = db;
});

afterAll(() => {
  h.db?.close();
  h.db = null;
});

describe('parseCatalogSuffix normalizes what a user types off a physical label', () => {
  test('a bare number passes through', () => {
    expect(parseCatalogSuffix('2303966')).toBe('2303966');
  });

  test('a pasted WSDA_ prefix is tolerated, in either case and with a hyphen', () => {
    expect(parseCatalogSuffix('WSDA_2303966')).toBe('2303966');
    expect(parseCatalogSuffix('wsda_2303966')).toBe('2303966');
    expect(parseCatalogSuffix('WSDA-2303966')).toBe('2303966');
    expect(parseCatalogSuffix('WSDA2303966')).toBe('2303966');
  });

  test('surrounding and embedded whitespace is stripped', () => {
    expect(parseCatalogSuffix('  2303966 ')).toBe('2303966');
    expect(parseCatalogSuffix('WSDA_ 230 3966')).toBe('2303966');
  });

  test('leading zeros are dropped — no suffix in the corpus carries one', () => {
    expect(parseCatalogSuffix('0002303966')).toBe('2303966');
  });

  test('non-numeric input, an empty field, and zero are all rejected', () => {
    expect(parseCatalogSuffix('')).toBeNull();
    expect(parseCatalogSuffix('   ')).toBeNull();
    expect(parseCatalogSuffix('Bombus')).toBeNull();
    expect(parseCatalogSuffix('WSDA_')).toBeNull();
    expect(parseCatalogSuffix('23039-66')).toBeNull();
    expect(parseCatalogSuffix('0')).toBeNull();
    expect(parseCatalogSuffix('000')).toBeNull();
  });

  test('an ecdysis-style prefix is NOT silently accepted as a catalog number', () => {
    // ecdysis_id and catalog suffix are different numbers; conflating them would
    // mis-resolve to a real but wrong specimen.
    expect(parseCatalogSuffix('ecdysis:5001')).toBeNull();
  });
});

describe('lookupByCatalogSuffix resolves a label number to exactly one specimen', () => {
  test('a 7-digit suffix resolves the specimen and joins its taxon name', async () => {
    const res = await lookupByCatalogSuffix('2303966', emptyFilterState());
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.ecdysis_id).toBe(5001);
    expect(res.rows[0]!.catalog_number).toBe('WSDA_2303966');
    expect(res.rows[0]!.display_name).toBe('Bombus vosnesenskii');
    expect(res.hiddenByFilter).toBe(false);
  });

  test('the match is the trailing DIGIT RUN, so a longer number is not a match', async () => {
    // WSDA_12303966 ends with "2303966" but is preceded by a digit — the regression
    // a bare LIKE '%2303966' would introduce.
    const res = await lookupByCatalogSuffix('2303966', emptyFilterState());
    expect(res.rows.map(r => r.catalog_number)).toEqual(['WSDA_2303966']);
  });

  test('the longer number resolves to its own record', async () => {
    const res = await lookupByCatalogSuffix('12303966', emptyFilterState());
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.ecdysis_id).toBe(5002);
  });

  test('an 8-digit suffix resolves, and duplicate mart rows collapse to one record', async () => {
    const res = await lookupByCatalogSuffix('25023610', emptyFilterState());
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.ecdysis_id).toBe(5003);
  });

  test('an unknown number is a clean miss, not an error', async () => {
    const res = await lookupByCatalogSuffix('9999999', emptyFilterState());
    expect(res.rows).toEqual([]);
    expect(res.hiddenByFilter).toBe(false);
  });

  test('a non-normalized suffix is refused rather than interpolated', async () => {
    // The digits-only assertion is the interpolation guard on the raw SQL string.
    const res = await lookupByCatalogSuffix("2303966' OR '1'='1", emptyFilterState());
    expect(res.rows).toEqual([]);
  });
});

describe('lookupByCatalogSuffix reports whether the ACTIVE filter would hide the match', () => {
  test('no active filter — nothing can be hidden', async () => {
    const res = await lookupByCatalogSuffix('2303966', emptyFilterState());
    expect(res.hiddenByFilter).toBe(false);
  });

  test('a filter that admits the specimen leaves it visible', async () => {
    const f = { ...emptyFilterState(), selectedCounties: new Set(['King']) };
    const res = await lookupByCatalogSuffix('2303966', f);
    expect(res.rows).toHaveLength(1);
    expect(res.hiddenByFilter).toBe(false);
  });

  test('a filter that excludes the specimen still resolves it, and flags it hidden', async () => {
    // The record is found corpus-wide — a label number names one record whether or
    // not the current view includes it — but the caller is told the view would not
    // show it, so it can clear the filter instead of rendering an empty card.
    const f = { ...emptyFilterState(), selectedCounties: new Set(['Chelan']) };
    const res = await lookupByCatalogSuffix('2303966', f);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.ecdysis_id).toBe(5001);
    expect(res.hiddenByFilter).toBe(true);
  });

  test('a year filter that excludes the specimen flags it hidden too', async () => {
    const f = { ...emptyFilterState(), yearFrom: 2025 };
    const res = await lookupByCatalogSuffix('2303966', f);
    expect(res.hiddenByFilter).toBe(true);
  });

  test('a miss under an active filter is a miss, not a hidden match', async () => {
    const f = { ...emptyFilterState(), selectedCounties: new Set(['King']) };
    const res = await lookupByCatalogSuffix('9999999', f);
    expect(res.rows).toEqual([]);
    expect(res.hiddenByFilter).toBe(false);
  });
});
