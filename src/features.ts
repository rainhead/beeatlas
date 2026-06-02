import type { FeatureCollection, Point, Feature } from 'geojson';
import { loadOccurrenceGeoJSON as _load, tablesReady } from './sqlite.ts';
import type { DataSummary, TaxonOption, OccurrenceProperties } from './filter.ts';

export type { OccurrenceProperties };

function _recencyTier(year: number): OccurrenceProperties['recencyTier'] {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

// Column layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                 year, scientificName, genus, family, source]
export function _buildGeoJSONFromRaw(rows: unknown[][]): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let minYear = Infinity, maxYear = -Infinity;

  for (const row of rows) {
    const lat = row[0] as number | null;
    const lon = row[1] as number | null;
    if (lat == null || lon == null) continue;

    const ecdysis_id = row[2];
    const observation_id = row[3];
    const specimen_observation_id = row[4];
    const year = Number(row[5]);
    const scientificName = row[6] as string | null;
    const genus = row[7] as string | null;
    const family = row[8] as string | null;
    const source = row[9] as string | null;

    let occId: string | null = null;
    if (ecdysis_id != null) occId = `ecdysis:${ecdysis_id}`;
    else if (observation_id != null) occId = `inat:${observation_id}`;
    else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
    if (occId == null) continue;

    if (ecdysis_id != null) {
      if (scientificName) species.add(scientificName);
      if (genus) genera.add(genus);
      if (family) families.add(family);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { occId, recencyTier: _recencyTier(year), source: source ?? '' },
    });
  }

  const summary: DataSummary = {
    totalSpecimens: features.filter(f => f.properties.occId.startsWith('ecdysis:')).length,
    speciesCount: species.size,
    genusCount: genera.size,
    familyCount: families.size,
    earliestYear: minYear === Infinity ? 0 : minYear,
    latestYear: maxYear === -Infinity ? 0 : maxYear,
  };

  // Legacy TaxonOption build from string columns — taxonId: 0 placeholder (replaced in Plan 02)
  const taxaOptions: TaxonOption[] = [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, taxonId: 0, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, taxonId: 0, rank: 'genus' as const })),
    ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, taxonId: 0, rank: 'species' as const })),
  ];

  return { geojson: { type: 'FeatureCollection', features }, summary, taxaOptions };
}

export async function loadOccurrenceGeoJSON(): Promise<{
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
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
