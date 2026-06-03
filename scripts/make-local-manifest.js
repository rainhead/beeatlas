// Writes public/data/manifest.json with unhashed local filenames for `npm run dev`.
// nightly.sh overwrites this file in public/data/ with content-hashed filenames for production.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'data', 'manifest.json');

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  occurrences: 'occurrences.parquet',
  occurrences_db: 'occurrences.db',
  occurrences_db_tables: ['geo_blob', 'occurrences'],
  species: 'species.json',
  seasonality: 'seasonality.json',
  counties: 'counties.geojson',
  ecoregions: 'ecoregions.geojson',
  places: 'places.geojson',
  places_meta: 'places.json',
  checklist: 'checklist.parquet',
  higher_taxa: 'higher_taxa.json',
  generated_at: 'local',
}, null, 2) + '\n');
console.log('wrote public/data/manifest.json (local dev)');
