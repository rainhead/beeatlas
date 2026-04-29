import type { FeatureCollection, Point, Feature } from 'geojson';
import { getDB, tablesReady } from './sqlite.ts';
import { recencyTier } from './style.ts';

export interface OccurrenceProperties {
  occId: string;
  recencyTier: 'fresh' | 'thisYear' | 'older';
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
  const { sqlite3, db } = await getDB();
  const features: Feature<Point, OccurrenceProperties>[] = [];

  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let minYear = Infinity, maxYear = -Infinity;

  await sqlite3.exec(db, `SELECT * FROM occurrences`, (rowValues: unknown[], columnNames: string[]) => {
    const obj: Record<string, unknown> = {};
    columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });

    if (obj.lat == null || obj.lon == null) return;

    const occId = obj.ecdysis_id != null
      ? 'ecdysis:' + obj.ecdysis_id
      : 'inat:' + Number(obj.observation_id);

    const year = Number(obj.year);
    const month = Number(obj.month);
    const tier = recencyTier(year, month);

    // Build summary stats (specimens only)
    if (obj.ecdysis_id != null) {
      const s = obj.scientificName as string;
      const g = obj.genus as string;
      const fam = obj.family as string;
      if (s) species.add(s);
      if (g) genera.add(g);
      if (fam) families.add(fam);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(obj.lon), Number(obj.lat)],
      },
      properties: {
        occId,
        recencyTier: tier,
        ...obj,
      },
    });
  });

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

  console.debug(`Built GeoJSON with ${features.length} occurrence features from SQLite`);

  return {
    geojson: { type: 'FeatureCollection', features },
    summary,
    taxaOptions,
  };
}
