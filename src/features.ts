import type { FeatureCollection, Point } from 'geojson';
import { loadOccurrenceGeoJSON as _load, tablesReady } from './sqlite.ts';

export interface OccurrenceProperties {
  occId: string;
  recencyTier: 'thisYear' | 'lastYear' | 'earlier';
  [key: string]: unknown;
}

export interface DataSummary {
  totalSpecimens: number;
  speciesCount: number;
  genusCount: number;
  familyCount: number;
  earliestYear: number;
  latestYear: number;
}

export interface TaxonOption {
  label: string;
  name: string;
  rank: 'family' | 'genus' | 'species';
}

export async function loadOccurrenceGeoJSON(): Promise<{
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
}> {
  await tablesReady;
  const tPost0 = performance.now();
  const result = await _load();
  const tPost1 = performance.now();
  console.log(`[BENCHMARK] loadOccurrenceGeoJSON (worker→main transfer): ${(tPost1 - tPost0).toFixed(0)} ms`);
  return result as Awaited<ReturnType<typeof loadOccurrenceGeoJSON>>;
}
