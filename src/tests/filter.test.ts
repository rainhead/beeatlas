import { test, expect, describe, vi, beforeAll, afterAll } from 'vitest';
import { buildFilterSQL, buildCsvFilename, queryTablePage, OCCURRENCE_COLUMNS, ELEV_SQL, ELEV_SQL_RECORDED_ONLY, elevSql, isFilterActive, isFilterNarrowed, defaultFilterState, emptyFilterState, getOccurrences, getOccurrencePlaceSlugs, occurrencePlacesAvailable, _resetOccurrencePlacesProbe } from '../filter.ts';
import type { FilterState } from '../filter.ts';
import { getDB } from '../sqlite.ts';

vi.mock('../sqlite.ts', () => ({
  // exec is a no-op that yields no rows: <bee-atlas> boots filter-active now (the default
  // view hides the `other` tier, ADR 0041), so mounting it runs a map query straight away.
  // A bare `sqlite3: {}` made that an unhandled `sqlite3.exec is not a function` rejection.
  getDB: vi.fn(() => Promise.resolve({ sqlite3: { exec: vi.fn(() => Promise.resolve()) }, db: 0 })),
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
    bounds: null,
    hiddenTiers: new Set(),
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
      bounds: null,
      hiddenTiers: new Set(),
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
  test('elevMin only: bounded below, nulls excluded', () => {
    const f = { ...emptyFilter(), elevMin: 500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe(`${ELEV_SQL} >= 500`);
  });

  test('elevMax only: bounded above, nulls excluded', () => {
    const f = { ...emptyFilter(), elevMax: 1500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe(`${ELEV_SQL} <= 1500`);
  });

  test('both set: BETWEEN, nulls excluded', () => {
    const f = { ...emptyFilter(), elevMin: 500, elevMax: 1500 };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe(`${ELEV_SQL} BETWEEN 500 AND 1500`);
  });

  test('neither set: no elevation clause; returns 1 = 1', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).toBe('1 = 1');
  });

  // --- beeatlas-yc9 regressions -------------------------------------------
  // The defect was not "the SQL string is wrong"; it was that a one-sided bound
  // admitted every record whose elevation was unknown, so setting a minimum
  // returned exactly what setting no filter returned. These assert the PROPERTY,
  // so they survive a rewrite of the clause that reintroduces the behavior.

  test('a one-sided bound never admits unknown elevation (the yc9 defect)', () => {
    for (const f of [
      { ...emptyFilter(), elevMin: 1700 },
      { ...emptyFilter(), elevMax: 1700 },
      { ...emptyFilter(), elevMin: 500, elevMax: 1500 },
    ]) {
      const { occurrenceWhere } = buildFilterSQL(f);
      expect(occurrenceWhere).not.toMatch(/IS NULL/);
    }
  });

  test('a one-sided bound is not equivalent to no filter at all', () => {
    const none = buildFilterSQL(emptyFilter()).occurrenceWhere;
    expect(buildFilterSQL({ ...emptyFilter(), elevMin: 1700 }).occurrenceWhere).not.toBe(none);
    expect(buildFilterSQL({ ...emptyFilter(), elevMax: 1700 }).occurrenceWhere).not.toBe(none);
  });

  test('one-sided and two-sided bounds agree on null handling', () => {
    // The original bug was an INCONSISTENCY: two-sided excluded nulls, one-sided
    // did not, so the same control meant different things by how many boxes were
    // filled. All three shapes must now treat unknown elevation identically.
    const shapes = [
      buildFilterSQL({ ...emptyFilter(), elevMin: 500 }).occurrenceWhere,
      buildFilterSQL({ ...emptyFilter(), elevMax: 1500 }).occurrenceWhere,
      buildFilterSQL({ ...emptyFilter(), elevMin: 500, elevMax: 1500 }).occurrenceWhere,
    ];
    for (const clause of shapes) expect(clause.startsWith(ELEV_SQL)).toBe(true);
  });

  test('elevation reads recorded elevation in preference to the DEM value', () => {
    // Order inside the COALESCE is load-bearing: a collector's recorded elevation
    // outranks a raster sample. Reversing it would silently prefer derived data.
    expect(ELEV_SQL).toBe('COALESCE(elevation_m, elevation_dem_m)');
  });

  test('a DB without elevation_dem_m narrows the column, never the rule', () => {
    // The stale-DB fallback must degrade to a SMALLER answer, not a wrong one. In
    // particular it must NOT revert to the pre-yc9 `IS NULL OR ...` shape, which
    // would make an offline session silently answer the old, inflated way.
    for (const f of [
      { ...emptyFilter(), elevMin: 1700 },
      { ...emptyFilter(), elevMax: 1700 },
      { ...emptyFilter(), elevMin: 500, elevMax: 1500 },
    ]) {
      const { occurrenceWhere } = buildFilterSQL(f, true, /* hasDemElevation */ false);
      expect(occurrenceWhere).not.toMatch(/IS NULL/);
      expect(occurrenceWhere).not.toMatch(/elevation_dem_m/);
      expect(occurrenceWhere.startsWith(ELEV_SQL_RECORDED_ONLY)).toBe(true);
    }
  });

  test('elevSql picks the expression from the probe result', () => {
    expect(elevSql(true)).toBe(ELEV_SQL);
    expect(elevSql(false)).toBe(ELEV_SQL_RECORDED_ONLY);
    expect(elevSql()).toBe(ELEV_SQL); // default: prod has the column
  });
});

describe('D-03: checklist rows and sub-county geography', () => {
  const BOX = { west: -122.4, south: 47.5, east: -122.2, north: 47.7 };

  test('a bounds filter excludes checklist records', () => {
    const { occurrenceWhere } = buildFilterSQL({ ...emptyFilter(), bounds: BOX });
    expect(occurrenceWhere).toContain("o.record_type <> 'checklist'");
  });

  test('a place filter excludes checklist records', () => {
    const { occurrenceWhere } = buildFilterSQL({ ...emptyFilter(), selectedPlace: 'discovery-park' });
    expect(occurrenceWhere).toContain("o.record_type <> 'checklist'");
  });

  test('a county filter RETAINS checklist records', () => {
    // The county is the authoritative thing a checklist asserts — dropping these
    // would deny published county-range records.
    const { occurrenceWhere } = buildFilterSQL({ ...emptyFilter(), selectedCounties: new Set(['King']) });
    expect(occurrenceWhere).not.toContain('checklist');
  });

  test('an ecoregion filter RETAINS checklist records', () => {
    const { occurrenceWhere } = buildFilterSQL({ ...emptyFilter(), selectedEcoregions: new Set(['Cascades']) });
    expect(occurrenceWhere).not.toContain('checklist');
  });

  test('no geography filter at all leaves checklist records alone', () => {
    expect(buildFilterSQL(emptyFilter()).occurrenceWhere).not.toContain('checklist');
  });

  test('county + bounds together still excludes (the stricter geometry wins)', () => {
    const { occurrenceWhere } = buildFilterSQL({
      ...emptyFilter(), selectedCounties: new Set(['King']), bounds: BOX,
    });
    expect(occurrenceWhere).toContain("o.record_type <> 'checklist'");
    expect(occurrenceWhere).toContain("county IN ('King')");
  });

  test('the clause is o.-qualified (occurrences is always aliased o)', () => {
    const { occurrenceWhere } = buildFilterSQL({ ...emptyFilter(), bounds: BOX });
    expect(occurrenceWhere).not.toMatch(/[^.]record_type <> 'checklist'/);
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

describe('isFilterActive — bounds', () => {
  test('bounds set: returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), bounds: { west: -122, south: 47, east: -121, north: 48 } })).toBe(true);
  });
  test('emptyFilter() bounds null: returns false', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
  });
});

describe('buildCsvFilename', () => {
  // Date frozen to 2026-01-15 → suffix is 20260115.
  test('no filter active: occurrences-all-20260115.csv', () => {
    expect(buildCsvFilename(emptyFilter())).toBe('occurrences-all-20260115.csv');
  });

  // WR-03: a tier-only filter is active (isFilterActive true) but produces no name segment.
  // The filename must collapse to the -all- form, not a malformed `occurrences--20260115.csv`.
  test('tier-only filter: occurrences-all-20260115.csv (no double-dash)', () => {
    const f = { ...emptyFilter(), hiddenTiers: new Set(['other'] as const) };
    const name = buildCsvFilename(f);
    expect(name).toBe('occurrences-all-20260115.csv');
    expect(name).not.toContain('--');
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
    // beeatlas-4dx: DEM elevation ships as its OWN column, in the query and in the
    // CSV export. Merging the two would destroy the recorded-vs-derived distinction
    // the mart maintains on purpose (ADR 0015).
    expect(OCCURRENCE_COLUMNS).toContain('elevation_dem_m');
  });

  // Phase 160 (SC-1/D-02): place_slug is dropped from the occurrences mart;
  // membership now lives in the occurrence_places bridge. RED until 160-04
  // removes 'place_slug' from OCCURRENCE_COLUMNS in src/filter.ts.
  test('OCCURRENCE_COLUMNS does NOT include place_slug', () => {
    expect(OCCURRENCE_COLUMNS).not.toContain('place_slug');
  });

  test('OCCURRENCE_COLUMNS does NOT contain the 4 dropped denormalized columns', () => {
    expect(OCCURRENCE_COLUMNS).not.toContain('scientificName');
    expect(OCCURRENCE_COLUMNS).not.toContain('genus');
    expect(OCCURRENCE_COLUMNS).not.toContain('family');
    expect(OCCURRENCE_COLUMNS).not.toContain('specimen_inat_taxon_name');
  });
});

describe('buildFilterSQL — bounds', () => {
  test('bounds set: occurrenceWhere contains lat BETWEEN and lon BETWEEN', () => {
    const f = { ...emptyFilter(), bounds: { west: -122, south: 47, east: -121, north: 48 } };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('lat BETWEEN 47 AND 48');
    expect(occurrenceWhere).toContain('lon BETWEEN -122 AND -121');
  });

  test('emptyFilter() produces no lat BETWEEN / lon BETWEEN fragment', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).not.toContain('lat BETWEEN');
    expect(occurrenceWhere).not.toContain('lon BETWEEN');
  });

  test('bounds + taxonId AND-compose both clauses into occurrenceWhere', () => {
    const f = { ...emptyFilter(), taxonId: 52775, bounds: { west: -122, south: 47, east: -121, north: 48 } };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('taxon_id = 52775');
    expect(occurrenceWhere).toContain('lat BETWEEN 47 AND 48');
    expect(occurrenceWhere).toContain(' AND ');
  });
});

describe('isFilterActive — hiddenTiers', () => {
  test('one tier hidden: returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), hiddenTiers: new Set(['other'] as const) })).toBe(true);
  });
  test('emptyFilter() hiddenTiers empty: returns false', () => {
    expect(isFilterActive({ ...emptyFilter(), hiddenTiers: new Set() })).toBe(false);
  });
});

describe('the view a reader lands on: "Other records" off by default', () => {
  test('the default hides the other tier; the empty filter still hides nothing', () => {
    expect(defaultFilterState().hiddenTiers).toEqual(new Set(['other']));
    // emptyFilterState() keeps meaning "show absolutely everything" — the catalog-number
    // lookup resets to it to reveal a record the view is hiding, tier included.
    expect(emptyFilterState().hiddenTiers).toEqual(new Set());
  });

  test('the default view is ACTIVE for the machinery but not NARROWED for the reader', () => {
    // Active: the tier really is excluded, so the SQL, the map query and the
    // "is this record hidden?" catalog check all have to see it.
    expect(isFilterActive(defaultFilterState())).toBe(true);
    // Not narrowed: nothing has been filtered BY the reader, so the collapsed pane's
    // "filters are on" highlight stays off until they actually filter something.
    expect(isFilterNarrowed(defaultFilterState())).toBe(false);
  });

  test('turning "Other records" on is not narrowing either; hiding Atlas work is', () => {
    expect(isFilterNarrowed({ ...defaultFilterState(), hiddenTiers: new Set() })).toBe(false);
    expect(isFilterNarrowed({ ...defaultFilterState(), hiddenTiers: new Set(['atlas' as const]) })).toBe(true);
  });

  test('a narrowed dimension still shows through the default tier state', () => {
    expect(isFilterNarrowed({ ...defaultFilterState(), taxonId: 52775 })).toBe(true);
  });

  test("the default view's SQL restricts to o.tier IN ('atlas')", () => {
    const { occurrenceWhere } = buildFilterSQL(defaultFilterState());
    expect(occurrenceWhere).toMatch(/o\.tier IN \('atlas'\)/);
    expect(occurrenceWhere).not.toContain("'other'");
  });
});

describe('buildFilterSQL — tier filter (Phase 170 PROV-02)', () => {
  test("hiddenTiers={other}: occurrenceWhere contains o.tier IN ('atlas')", () => {
    const f = { ...emptyFilter(), hiddenTiers: new Set(['other'] as const) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toMatch(/o\.tier IN \('atlas'\)/);
    expect(occurrenceWhere).not.toContain("'other'");
  });

  test('empty hiddenTiers: occurrenceWhere does NOT contain o.tier', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).not.toContain('o.tier');
  });

  test('both tiers hidden: occurrenceWhere contains 1 = 0 (D-05 honest empty)', () => {
    const f = { ...emptyFilter(), hiddenTiers: new Set(['atlas', 'other'] as const) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('1 = 0');
    expect(occurrenceWhere).not.toMatch(/o\.tier IN/);
  });

  test("hiddenTiers={atlas}: occurrenceWhere contains o.tier IN ('other')", () => {
    const f = { ...emptyFilter(), hiddenTiers: new Set(['atlas'] as const) };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toMatch(/o\.tier IN \('other'\)/);
    expect(occurrenceWhere).not.toContain("'atlas'");
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

  // Phase 160 (SC-1/D-01): the place clause resolves via MEMBERSHIP against the
  // occurrence_places bridge, not a scalar place_slug equality. RED until 160-04
  // rewrites the clause in src/filter.ts to an EXISTS subquery (Option B occ_id).
  test('buildFilterSQL with selectedPlace emits an EXISTS membership subquery against occurrence_places', () => {
    const f = { ...emptyFilter(), selectedPlace: 'ebeys-landing' };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toContain('EXISTS');
    expect(occurrenceWhere).toContain('occurrence_places');
    expect(occurrenceWhere).toContain("op.place_slug = 'ebeys-landing'");
    // No bare scalar place_slug equality on the occurrences row (`o.place_slug`).
    // The membership equality lives on the bridge alias `op.`, never on `o.`.
    expect(occurrenceWhere).not.toContain("o.place_slug =");
  });

  test('buildFilterSQL with selectedPlace null emits no membership place clause', () => {
    const f = { ...emptyFilter(), selectedPlace: null };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).not.toContain('occurrence_places');
    expect(occurrenceWhere).not.toContain('place_slug');
  });

  test("buildFilterSQL escapes single quotes in the membership place clause (o'brien-ranch)", () => {
    const f = { ...emptyFilter(), selectedPlace: "o'brien-ranch" };
    const { occurrenceWhere } = buildFilterSQL(f);
    // Escaping (T-160-01 mitigation) preserved in the EXISTS clause.
    expect(occurrenceWhere).toContain("op.place_slug = 'o''brien-ranch'");
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
    // Skip the COUNT query AND the one-off schema probes (occurrence_places /
    // elevation_dem_m), which also run through exec — the data query is the one
    // that selects from occurrences.
    const dataSql = execFn.mock.calls.find((c: unknown[]) => {
      const sql = String(c[1]);
      return !sql.includes('COUNT(*)') && !sql.includes('pragma_table_info') && !sql.includes('sqlite_master');
    })?.[1] ?? '';
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

describe('Phase 160 robustness — missing occurrence_places bridge (stale-DB skew)', () => {
  test('buildFilterSQL omits the place clause when the bridge is unavailable', () => {
    const f = { ...emptyFilter(), selectedPlace: 'ebeys-landing' };
    const { occurrenceWhere } = buildFilterSQL(f, false);
    expect(occurrenceWhere).not.toContain('occurrence_places');
    expect(occurrenceWhere).not.toContain("'ebeys-landing'");
  });

  test('occurrencePlacesAvailable() resolves false when the bridge table is absent', async () => {
    _resetOccurrencePlacesProbe();
    // sqlite_master probe matches nothing → table treated as absent
    const execFn = vi.fn(() => Promise.resolve());
    vi.mocked(getDB).mockResolvedValue({ sqlite3: { exec: execFn } as any, db: 0 });
    expect(await occurrencePlacesAvailable()).toBe(false);
  });

  test('getOccurrencePlaceSlugs returns [] (never throws) when the bridge is absent', async () => {
    _resetOccurrencePlacesProbe();
    const execFn = vi.fn(() => Promise.resolve());
    vi.mocked(getDB).mockResolvedValue({ sqlite3: { exec: execFn } as any, db: 0 });
    await expect(getOccurrencePlaceSlugs('inat_obs:320276469')).resolves.toEqual([]);
  });
});
