import type { FeatureCollection, Point, Feature } from 'geojson';
import { loadOccurrenceGeoJSON as _load, tablesReady } from './sqlite.ts';
import type { DataSummary, TaxonOption, OccurrenceProperties } from './filter.ts';

export type { OccurrenceProperties };

// Raw row shape produced by json_object in GEO_AGG_SQL (named properties, not positional).
interface RawOccRow {
  lat: number | null;
  lon: number | null;
  ecdysis_id: number | null;
  observation_id: number | null;
  specimen_observation_id: number | null;
  year: number | null;
  scientificName: string | null;
  genus: string | null;
  family: string | null;
  source: string | null;
}

function _recencyTier(year: number): OccurrenceProperties['recencyTier'] {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

/**
 * Build GeoJSON from raw named-property rows decoded from the worker ArrayBuffer.
 * Exported for unit testing (leading underscore = internal, not public API).
 */
export function _buildGeoJSONFromRaw(rows: RawOccRow[]): {
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
    const lat = row.lat;
    const lon = row.lon;
    if (lat == null || lon == null) continue;

    const ecdysis_id = row.ecdysis_id;
    const observation_id = row.observation_id;
    const specimen_observation_id = row.specimen_observation_id;
    const year = Number(row.year);
    const scientificName = row.scientificName;
    const genus = row.genus;
    const family = row.family;
    const source = row.source;

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

  const taxaOptions: TaxonOption[] = [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
    ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
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
  const rows = JSON.parse(jsonStr) as RawOccRow[];
  const result = _buildGeoJSONFromRaw(rows);
  const tDecode1 = performance.now();
  console.log(`[BENCHMARK] decode+build GeoJSON: ${(tDecode1 - tDecode0).toFixed(0)} ms | features: ${result.geojson.features.length}`);

  return result;
}
