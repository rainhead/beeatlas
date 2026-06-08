import type { FeatureCollection, Point, Feature } from 'geojson';
import { loadOccurrenceGeoJSON as _load, tablesReady } from './sqlite.ts';
import type { OccurrenceProperties } from './filter.ts';

export type { OccurrenceProperties };

function _recencyTier(year: number): OccurrenceProperties['recencyTier'] {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

// Column layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                 year, source, checklist_id]
// Phase 131 NORM-02: dropped scientificName/genus/family; source moves from index 9 → 6.
// Phase 137: checklist_id appended at index 7; sqlite_export.py _GEO_COLS updated in the same commit (positional coupling).
export function _buildGeoJSONFromRaw(rows: unknown[][]): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];

  for (const row of rows) {
    const lat = row[0] as number | null;
    const lon = row[1] as number | null;
    if (lat == null || lon == null) continue;

    const ecdysis_id = row[2];
    const observation_id = row[3];
    const specimen_observation_id = row[4];
    const year = Number(row[5]);
    const source = row[6] as string | null;
    const checklist_id = row[7];

    let occId: string | null = null;
    if (ecdysis_id != null) occId = `ecdysis:${ecdysis_id}`;
    else if (observation_id != null) occId = `inat:${observation_id}`;
    else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
    else if (checklist_id != null) occId = `checklist:${checklist_id}`;
    if (occId == null) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { occId, recencyTier: _recencyTier(year), source: source ?? '' },
    });
  }

  return { geojson: { type: 'FeatureCollection', features } };
}

export async function loadOccurrenceGeoJSON(): Promise<{
  geojson: FeatureCollection<Point, OccurrenceProperties>;
}> {
  await tablesReady;
  const tPost0 = performance.now();
  const buffer = await _load();
  const tPost1 = performance.now();
  console.log(`[BENCHMARK] loadOccurrenceGeoJSON buffer transfer: ${(tPost1 - tPost0).toFixed(0)} ms | ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  const tDecode0 = performance.now();
  const jsonStr = new TextDecoder().decode(buffer);
  const rows = JSON.parse(jsonStr) as unknown[][];
  const result = _buildGeoJSONFromRaw(rows);
  const tDecode1 = performance.now();
  console.log(`[BENCHMARK] decode+build GeoJSON: ${(tDecode1 - tDecode0).toFixed(0)} ms | features: ${result.geojson.features.length}`);

  return result;
}
