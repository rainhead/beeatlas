import { describe, it, expect } from 'vitest';
import { _buildGeoJSONFromRaw } from '../../src/features.ts';

// Positional layout (target — 7-field): [lat, lon, ecdysis_id, observation_id,
//                                         specimen_observation_id, year, source]
// source is at index 6 (was index 9 in the old 10-field layout).
interface RowOverride {
  lat?: number | null; lon?: number | null;
  ecdysis_id?: number | null; observation_id?: number | null; specimen_observation_id?: number | null;
  year?: number | null; source?: string | null;
}

function toRow(r: Required<RowOverride>): unknown[] {
  return [r.lat, r.lon, r.ecdysis_id, r.observation_id, r.specimen_observation_id,
          r.year, r.source]; // source at index 6
}

const CURRENT_YEAR = new Date().getFullYear();

function makeEcdysisRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.5, lon: -120.3, ecdysis_id: 1001, observation_id: null,
    specimen_observation_id: null, year: 2020, source: 'ecdysis', ...overrides });
}

function makeInatRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.6, lon: -120.4, ecdysis_id: null, observation_id: 12345,
    specimen_observation_id: null, year: 2021, source: 'inat_obs', ...overrides });
}

function makeSpecimenObsRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.7, lon: -120.5, ecdysis_id: null, observation_id: null,
    specimen_observation_id: 99999, year: 2019, source: 'inat_obs', ...overrides });
}

describe('_buildGeoJSONFromRaw', () => {
  it('returns { geojson } only — no extra keys in the return object', () => {
    const result = _buildGeoJSONFromRaw([]);
    expect(result).toHaveProperty('geojson');
    // Target behavior: only { geojson } is returned; the old summary and taxa-options
    // keys must not be present after the migration.
    expect(Object.keys(result)).toEqual(['geojson']);
  });

  it('empty array input → geojson with 0 features', () => {
    const result = _buildGeoJSONFromRaw([]);
    expect(result.geojson.type).toBe('FeatureCollection');
    expect(result.geojson.features).toHaveLength(0);
  });

  it('row with null lat is skipped — no feature emitted', () => {
    const row = makeEcdysisRow({ lat: null });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(0);
  });

  it('row with null lon is skipped — no feature emitted', () => {
    const row = makeEcdysisRow({ lon: null });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(0);
  });

  it('ecdysis_id non-null → occId = "ecdysis:{id}"', () => {
    const row = makeEcdysisRow({ ecdysis_id: 42 });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.occId).toBe('ecdysis:42');
  });

  it('observation_id non-null → occId = "inat:{id}"', () => {
    const row = makeInatRow({ observation_id: 777 });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.occId).toBe('inat:777');
  });

  it('specimen_observation_id non-null → occId = "inat_obs:{id}"', () => {
    const row = makeSpecimenObsRow({ specimen_observation_id: 555 });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.occId).toBe('inat_obs:555');
  });

  it('row where all three IDs are null → row is skipped', () => {
    const row = makeEcdysisRow({ ecdysis_id: null, observation_id: null, specimen_observation_id: null });
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(0);
  });

  it('source at index 6 — feature carries the source value from that position', () => {
    // This test pins that source is decoded from index 6 (not index 9).
    // The row is manually constructed to put a known value at position 6 only.
    const row: unknown[] = [47.5, -120.3, 1001, null, null, 2020, 'ecdysis']; // [6] = 'ecdysis'
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.source).toBe('ecdysis');
  });

  it('source at index 6 — inat_obs source value decoded correctly', () => {
    const row: unknown[] = [47.6, -120.4, null, 12345, null, 2021, 'inat_obs']; // [6] = 'inat_obs'
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.source).toBe('inat_obs');
  });

  it('source null at index 6 → feature source is empty string', () => {
    const row: unknown[] = [47.5, -120.3, 1001, null, null, 2020, null]; // [6] = null
    const result = _buildGeoJSONFromRaw([row]);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0]!.properties.source).toBe('');
  });

  it('recencyTier: thisYear for current year, lastYear for year-1, earlier for older', () => {
    const rows = [
      makeEcdysisRow({ ecdysis_id: 1, year: CURRENT_YEAR }),
      makeEcdysisRow({ ecdysis_id: 2, year: CURRENT_YEAR - 1 }),
      makeEcdysisRow({ ecdysis_id: 3, year: CURRENT_YEAR - 2 }),
    ];
    const result = _buildGeoJSONFromRaw(rows);
    const features = result.geojson.features;

    const thisYear = features.find((f: { properties: { occId: string } }) => f.properties.occId === `ecdysis:1`);
    const lastYear = features.find((f: { properties: { occId: string } }) => f.properties.occId === `ecdysis:2`);
    const earlier = features.find((f: { properties: { occId: string } }) => f.properties.occId === `ecdysis:3`);

    expect(thisYear?.properties.recencyTier).toBe('thisYear');
    expect(lastYear?.properties.recencyTier).toBe('lastYear');
    expect(earlier?.properties.recencyTier).toBe('earlier');
  });

  it('multiple rows — all valid IDs produce one feature each', () => {
    const rows = [
      makeEcdysisRow({ ecdysis_id: 1 }),
      makeInatRow({ observation_id: 100 }),
      makeSpecimenObsRow({ specimen_observation_id: 200 }),
    ];
    const result = _buildGeoJSONFromRaw(rows);
    expect(result.geojson.features).toHaveLength(3);
  });
});
