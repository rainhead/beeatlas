import { describe, it, expect } from 'vitest';
import { _buildGeoJSONFromRaw } from '../../src/features.ts';

// Positional layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                     year, scientificName, genus, family, source]
interface RowOverride {
  lat?: number | null; lon?: number | null;
  ecdysis_id?: number | null; observation_id?: number | null; specimen_observation_id?: number | null;
  year?: number | null; scientificName?: string | null; genus?: string | null;
  family?: string | null; source?: string | null;
}

function toRow(r: Required<RowOverride>): unknown[] {
  return [r.lat, r.lon, r.ecdysis_id, r.observation_id, r.specimen_observation_id,
          r.year, r.scientificName, r.genus, r.family, r.source];
}

const CURRENT_YEAR = new Date().getFullYear();

function makeEcdysisRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.5, lon: -120.3, ecdysis_id: 1001, observation_id: null,
    specimen_observation_id: null, year: 2020, scientificName: 'Bombus vosnesenskii',
    genus: 'Bombus', family: 'Apidae', source: 'ecdysis', ...overrides });
}

function makeInatRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.6, lon: -120.4, ecdysis_id: null, observation_id: 12345,
    specimen_observation_id: null, year: 2021, scientificName: 'Bombus mixtus',
    genus: 'Bombus', family: 'Apidae', source: 'inat_obs', ...overrides });
}

function makeSpecimenObsRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.7, lon: -120.5, ecdysis_id: null, observation_id: null,
    specimen_observation_id: 99999, year: 2019, scientificName: 'Apis mellifera',
    genus: 'Apis', family: 'Apidae', source: 'inat_obs', ...overrides });
}

describe('_buildGeoJSONFromRaw', () => {
  it('empty array input → geojson with 0 features, summary all zeros, empty taxaOptions', () => {
    const result = _buildGeoJSONFromRaw([]);
    expect(result.geojson.type).toBe('FeatureCollection');
    expect(result.geojson.features).toHaveLength(0);
    expect(result.summary.totalSpecimens).toBe(0);
    expect(result.summary.speciesCount).toBe(0);
    expect(result.summary.genusCount).toBe(0);
    expect(result.summary.familyCount).toBe(0);
    expect(result.summary.earliestYear).toBe(0);
    expect(result.summary.latestYear).toBe(0);
    expect(result.taxaOptions).toHaveLength(0);
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

  it('summary.totalSpecimens counts only ecdysis: occIds', () => {
    const rows = [
      makeEcdysisRow({ ecdysis_id: 1 }),
      makeEcdysisRow({ ecdysis_id: 2 }),
      makeInatRow({ observation_id: 100 }),
      makeSpecimenObsRow({ specimen_observation_id: 200 }),
    ];
    const result = _buildGeoJSONFromRaw(rows);
    expect(result.geojson.features).toHaveLength(4);
    expect(result.summary.totalSpecimens).toBe(2);
  });

  it('summary.speciesCount / genusCount / familyCount count distinct values from ecdysis rows only', () => {
    const rows = [
      makeEcdysisRow({ ecdysis_id: 1, scientificName: 'Bombus vosnesenskii', genus: 'Bombus', family: 'Apidae' }),
      makeEcdysisRow({ ecdysis_id: 2, scientificName: 'Apis mellifera', genus: 'Apis', family: 'Apidae' }),
      // inat row with different genus/family — should NOT count
      makeInatRow({ observation_id: 10, scientificName: 'Osmia lignaria', genus: 'Osmia', family: 'Megachilidae' }),
    ];
    const result = _buildGeoJSONFromRaw(rows);
    expect(result.summary.speciesCount).toBe(2);
    expect(result.summary.genusCount).toBe(2);
    expect(result.summary.familyCount).toBe(1); // both ecdysis rows are Apidae
  });

  it('summary.earliestYear / latestYear span only ecdysis rows; when no ecdysis rows both = 0', () => {
    // No ecdysis rows
    const rows1 = [makeInatRow({ observation_id: 1, year: 2019 })];
    const r1 = _buildGeoJSONFromRaw(rows1);
    expect(r1.summary.earliestYear).toBe(0);
    expect(r1.summary.latestYear).toBe(0);

    // Two ecdysis rows spanning years
    const rows2 = [
      makeEcdysisRow({ ecdysis_id: 1, year: 2018 }),
      makeEcdysisRow({ ecdysis_id: 2, year: 2023 }),
      makeInatRow({ observation_id: 10, year: 2015 }), // inat — must not affect year range
    ];
    const r2 = _buildGeoJSONFromRaw(rows2);
    expect(r2.summary.earliestYear).toBe(2018);
    expect(r2.summary.latestYear).toBe(2023);
  });

  it('taxaOptions includes family, genus, species entries sorted alphabetically', () => {
    const rows = [
      makeEcdysisRow({ ecdysis_id: 1, scientificName: 'Bombus vosnesenskii', genus: 'Bombus', family: 'Apidae' }),
      makeEcdysisRow({ ecdysis_id: 2, scientificName: 'Apis mellifera', genus: 'Apis', family: 'Apidae' }),
      makeEcdysisRow({ ecdysis_id: 3, scientificName: 'Osmia lignaria', genus: 'Osmia', family: 'Megachilidae' }),
    ];
    const result = _buildGeoJSONFromRaw(rows);

    const families = result.taxaOptions.filter((t: { rank: string }) => t.rank === 'family').map((t: { label: string }) => t.label.replace(' (family)', ''));
    const genera = result.taxaOptions.filter((t: { rank: string }) => t.rank === 'genus').map((t: { label: string }) => t.label.replace(' (genus)', ''));
    const species = result.taxaOptions.filter((t: { rank: string }) => t.rank === 'species').map((t: { label: string }) => t.label);

    expect(families).toEqual([...families].sort());
    expect(genera).toEqual([...genera].sort());
    expect(species).toEqual([...species].sort());

    expect(families).toContain('Apidae');
    expect(families).toContain('Megachilidae');
    expect(genera).toContain('Bombus');
    expect(genera).toContain('Apis');
    expect(genera).toContain('Osmia');
    expect(species).toContain('Bombus vosnesenskii');
    expect(species).toContain('Apis mellifera');
    expect(species).toContain('Osmia lignaria');
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
});
