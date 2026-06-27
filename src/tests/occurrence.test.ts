import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional, isSpecimenId } from '../occurrence.ts';
import { OCC_ID_SQL_CASE } from '../filter.ts';
import type { OccurrenceRow } from '../filter.ts';

// Base row with every OccurrenceRow field populated to null / 0 / false defaults.
const BASE_ROW: OccurrenceRow = {
  taxon_id: null,
  lat: 47.6,
  lon: -122.3,
  date: '2024-06-01',
  county: null,
  ecoregion_l3: null,
  ecdysis_id: null,
  catalog_number: null,
  recordedBy: null,
  fieldNumber: null,
  floralHost: null,
  host_observation_id: null,
  inat_host: null,
  inat_quality_grade: null,
  modified: null,
  specimen_observation_id: null,
  elevation_m: null,
  year: 2024,
  month: 6,
  observation_id: null,
  host_inat_login: null,
  is_provisional: false,
  specimen_inat_quality_grade: null,
  specimen_count: null,
  sample_id: null,
  sample_host: null,
  checklist_id: null,
  verbatim_name: null,
  locality: null,
  collapsed_count: null,
  tier: null,
  record_type: null,
  image_url: null,
  obs_url: null,
  user_login: null,
  license: null,
  display_name: null,
  display_rank: null,
};

// Factory helpers: spread BASE_ROW with the discriminating fields set.

function specimenRow(overrides: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return { ...BASE_ROW, ecdysis_id: 42, observation_id: 99, is_provisional: false, ...overrides };
}

function sampleRow(overrides: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return { ...BASE_ROW, ecdysis_id: null, observation_id: 456, is_provisional: false, ...overrides };
}

function provisionalRow(overrides: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return { ...BASE_ROW, ecdysis_id: null, observation_id: null, is_provisional: true, ...overrides };
}

describe('occIdFromRow', () => {
  test('returns ecdysis:N for a specimen-backed row (ecdysis_id takes precedence)', () => {
    expect(occIdFromRow(specimenRow())).toBe('ecdysis:42');
  });

  test('returns inat:N for a sample-only row (ecdysis_id null, observation_id non-null)', () => {
    expect(occIdFromRow(sampleRow())).toBe('inat:456');
  });

  test('returns null when both ecdysis_id and observation_id are null', () => {
    expect(occIdFromRow(provisionalRow())).toBeNull();
  });

  test('ecdysis_id is used even when observation_id is also present', () => {
    expect(occIdFromRow(specimenRow({ ecdysis_id: 99, observation_id: 777 }))).toBe('ecdysis:99');
  });

  test('returns checklist:N for a checklist row (only checklist_id set)', () => {
    expect(occIdFromRow({ ...BASE_ROW, checklist_id: 1234, tier: 'other', record_type: 'checklist' })).toBe('checklist:1234');
  });

  // D-03/D-11: category-3 provisional sample rows now carry the host/plant observation_id
  // and resolve to inat:N, NOT null. The legacy provisionalRow() fixture (observation_id null →
  // null) remains valid for old-shape rows, but the corrected ARM 2 shape has observation_id set.
  test('returns inat:N for a provisional sample row that has observation_id (new category-3 ARM 2 shape)', () => {
    expect(occIdFromRow({ ...BASE_ROW, observation_id: 351027987, is_provisional: true })).toBe('inat:351027987');
  });
});

describe('parseOccId', () => {
  test('parses a valid ecdysis: ID', () => {
    expect(parseOccId('ecdysis:42')).toEqual({ source: 'ecdysis', numericId: 42 });
  });

  test('parses a valid inat: ID', () => {
    expect(parseOccId('inat:456')).toEqual({ source: 'inat', numericId: 456 });
  });

  // WR-04 (load-bearing ordering): parseOccId checks `inat_obs:` BEFORE `inat:`.
  // A naive reorder (e.g. alphabetizing the branches) would misroute every
  // inat_obs:N into the inat bucket (observation_id instead of
  // specimen_observation_id), silently corrupting selection queries. Pin it so a
  // future reorder is caught.
  test('parses inat_obs: ID without misrouting it to the inat bucket', () => {
    expect(parseOccId('inat_obs:42')).toEqual({ source: 'inat_obs', numericId: 42 });
  });

  // Phase 138 (UIX-01): checklist points are clickable; a checklist:N selection
  // must parse so it reaches the list/table query and shows in the sidebar.
  test('parses a valid checklist: ID', () => {
    expect(parseOccId('checklist:1234')).toEqual({ source: 'checklist', numericId: 1234 });
  });

  test('returns null for an unknown prefix (garbage)', () => {
    expect(parseOccId('garbage')).toBeNull();
  });

  test('returns null for ecdysis: with non-numeric suffix', () => {
    expect(parseOccId('ecdysis:notanumber')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(parseOccId('')).toBeNull();
  });

  test('returns null for inat: with non-numeric suffix', () => {
    expect(parseOccId('inat:abc')).toBeNull();
  });
});

describe('isSpecimenBacked', () => {
  test('returns true when ecdysis_id is non-null', () => {
    expect(isSpecimenBacked(specimenRow())).toBe(true);
  });

  test('returns false when ecdysis_id is null', () => {
    expect(isSpecimenBacked(sampleRow())).toBe(false);
  });

  test('returns false for a provisional row (ecdysis_id null)', () => {
    expect(isSpecimenBacked(provisionalRow())).toBe(false);
  });
});

describe('isSampleOnly', () => {
  test('returns true when ecdysis_id is null and is_provisional is false', () => {
    expect(isSampleOnly(sampleRow())).toBe(true);
  });

  test('returns false when ecdysis_id is non-null (specimen-backed)', () => {
    expect(isSampleOnly(specimenRow())).toBe(false);
  });

  test('returns false when is_provisional is true (even with ecdysis_id null)', () => {
    expect(isSampleOnly(provisionalRow())).toBe(false);
  });

  test('explicitly: ecdysis_id=null + is_provisional=true => false (not isSampleOnly)', () => {
    expect(isSampleOnly({ ...BASE_ROW, ecdysis_id: null, is_provisional: true })).toBe(false);
  });
});

describe('isProvisional', () => {
  test('returns true when is_provisional is true', () => {
    expect(isProvisional(provisionalRow())).toBe(true);
  });

  test('returns false when is_provisional is false', () => {
    expect(isProvisional(sampleRow())).toBe(false);
  });

  test('returns false for a specimen-backed row', () => {
    expect(isProvisional(specimenRow())).toBe(false);
  });
});

describe('isSpecimenId', () => {
  test('returns true for an ecdysis: ID', () => {
    expect(isSpecimenId('ecdysis:1')).toBe(true);
  });

  test('returns false for an inat: ID', () => {
    expect(isSpecimenId('inat:1')).toBe(false);
  });

  test('returns false for garbage input', () => {
    expect(isSpecimenId('garbage')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(isSpecimenId('')).toBe(false);
  });
});

// PROV-03 (Phase 170, D-07/D-11): the synthetic occ_id is reconstructed in THREE coupled
// sites — occIdFromRow (src/occurrence.ts), OCC_ID_SQL_CASE (src/filter.ts, the wa-sqlite
// query path), and the CASE in data/dbt/models/marts/occurrence_places.sql (the bridge join
// key). Their branch PRIORITY ORDER must stay identical (ecdysis → inat → inat_obs →
// checklist) or the place-membership join silently fails to match. This assertion pins the
// coupling WITHOUT changing any CASE — the occ_id prefix `inat_obs:` is unchanged by the
// 170 source→tier/record_type decomposition (only the record_type VALUE inat_obs→inat_expert
// moved; the prefix is independent, D-07).
describe('occ_id CASE coupling (PROV-03)', () => {
  // Canonical priority order — mirrors the occIdFromRow branch order in src/occurrence.ts.
  const TS_ORDER = ['ecdysis', 'inat', 'inat_obs', 'checklist'];

  // Pull the prefix literal from each "THEN 'prefix:'" branch, in source order.
  function extractCaseOrder(sql: string): string[] {
    return [...sql.matchAll(/THEN\s+'([a-z_]+):'/g)].map(m => m[1]!);
  }

  test('OCC_ID_SQL_CASE (filter.ts) matches occIdFromRow priority order', () => {
    expect(extractCaseOrder(OCC_ID_SQL_CASE)).toEqual(TS_ORDER);
  });

  test('occurrence_places.sql CASE matches occIdFromRow priority order', () => {
    const sql = readFileSync('data/dbt/models/marts/occurrence_places.sql', 'utf8');
    // Isolate the occ_id CASE block (between the SELECT-clause CASE and END AS occ_id) so the
    // regex only sees the three coupled branches, not unrelated SQL.
    const caseBlock = sql.slice(sql.indexOf('CASE'), sql.indexOf('END AS occ_id'));
    expect(extractCaseOrder(caseBlock)).toEqual(TS_ORDER);
  });

  test('all three sites share the identical occ_id prefix order', () => {
    const sql = readFileSync('data/dbt/models/marts/occurrence_places.sql', 'utf8');
    const bridgeOrder = extractCaseOrder(sql.slice(sql.indexOf('CASE'), sql.indexOf('END AS occ_id')));
    const filterOrder = extractCaseOrder(OCC_ID_SQL_CASE);
    expect(filterOrder).toEqual(bridgeOrder);
    expect(filterOrder).toEqual(TS_ORDER);
  });
});
