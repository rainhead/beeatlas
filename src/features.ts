import type { FeatureCollection, Point } from 'geojson';
import { loadOccurrenceGeoJSON as _load, tablesReady } from './sqlite.ts';
import type { DataSummary, TaxonOption, OccurrenceProperties } from './filter.ts';

export type { OccurrenceProperties };

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
