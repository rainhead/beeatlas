import { describe, test, expect } from 'vitest';
import { occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional, isSpecimenId } from '../occurrence.ts';
import type { OccurrenceRow } from '../filter.ts';

// Base row with every OccurrenceRow field populated to null / 0 / false defaults.
const BASE_ROW: OccurrenceRow = {
  taxon_id: null,
  lat: 47.6,
  lon: -122.3,
  date: '2024-06-01',
  county: null,
  ecoregion_l3: null,
  place_slug: null,
  ecdysis_id: null,
  catalog_number: null,
  scientificName: null,
  recordedBy: null,
  fieldNumber: null,
  genus: null,
  family: null,
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
  specimen_inat_taxon_name: null,
  specimen_inat_quality_grade: null,
  specimen_count: null,
  sample_id: null,
  sample_host: null,
  source: null,
  image_url: null,
  obs_url: null,
  user_login: null,
  license: null,
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
});

describe('parseOccId', () => {
  test('parses a valid ecdysis: ID', () => {
    expect(parseOccId('ecdysis:42')).toEqual({ source: 'ecdysis', numericId: 42 });
  });

  test('parses a valid inat: ID', () => {
    expect(parseOccId('inat:456')).toEqual({ source: 'inat', numericId: 456 });
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
