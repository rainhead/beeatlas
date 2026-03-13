#!/usr/bin/env node
/**
 * Validates that cached parquet files have the columns the frontend expects.
 * Run after cache-restore, before build. Fails loudly if schema is stale.
 *
 * Expected columns are derived from parquet.ts column lists — update here
 * whenever you add a column to the frontend.
 */

import { asyncBufferFromFile, parquetMetadataAsync } from 'hyparquet';
import { readdir } from 'fs/promises';
import { join } from 'path';

const ASSETS_DIR = new URL('../frontend/src/assets/', import.meta.url).pathname;

const EXPECTED = {
  'ecdysis.parquet': [
    'ecdysis_id', 'occurrenceID', 'longitude', 'latitude',
    'year', 'month', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
  ],
  'samples.parquet': [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
  ],
  'links.parquet': [
    'occurrenceID', 'inat_observation_id',
  ],
};

let failed = false;

for (const [filename, expectedCols] of Object.entries(EXPECTED)) {
  const filepath = join(ASSETS_DIR, filename);
  let actualCols;
  try {
    const file = await asyncBufferFromFile(filepath);
    const meta = await parquetMetadataAsync(file);
    actualCols = meta.schema.map(f => f.name).filter(n => n !== 'schema');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`— ${filename}: not cached, skipping`);
      continue;
    }
    console.error(`✗ ${filename}: could not read (${e.message})`);
    failed = true;
    continue;
  }

  const missing = expectedCols.filter(c => !actualCols.includes(c));
  if (missing.length > 0) {
    console.error(`✗ ${filename}: missing columns: ${missing.join(', ')}`);
    console.error(`  found: ${actualCols.join(', ')}`);
    failed = true;
  } else {
    console.log(`✓ ${filename}`);
  }
}

if (failed) {
  console.error('\nSchema validation failed. Run the fetch-data workflow to rebuild parquet files.');
  process.exit(1);
}
