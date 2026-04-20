#!/usr/bin/env node
/**
 * Validates that parquet files have the columns the frontend expects.
 *
 * Modes:
 * - Local: if frontend/public/data/occurrences.parquet exists, validate from disk
 *   (preserves dev workflow for anyone who runs the pipeline locally)
 * - CloudFront: otherwise, fetch from https://beeatlas.net/data/ using Range
 *   requests (only the parquet footer is fetched, not the full file)
 *
 * Expected columns are derived from parquet.ts column lists — update here
 * whenever you add a column to the frontend.
 */

import { asyncBufferFromFile, asyncBufferFromUrl, parquetMetadataAsync } from 'hyparquet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_DIR = new URL('../frontend/public/data/', import.meta.url).pathname;
const CLOUDFRONT_BASE = 'https://beeatlas.net/data/';

const EXPECTED = {
  'occurrences.parquet': [
    // specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    // sample-side (null for specimen-only rows)
    'observation_id', 'host_inat_login', 'specimen_count', 'sample_id',
    // unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
    // WABA specimen fields (null when no WABA obs linked)
    'specimen_inat_login', 'specimen_inat_taxon_name',
    'specimen_inat_genus', 'specimen_inat_family',
    // provisional flag
    'is_provisional',
  ],
};

const useLocal = existsSync(join(ASSETS_DIR, 'occurrences.parquet'));
if (!useLocal) {
  console.log('No local parquet found -- validating against production CloudFront');
}

let failed = false;

for (const [filename, expectedCols] of Object.entries(EXPECTED)) {
  let actualCols;
  try {
    const file = useLocal
      ? await asyncBufferFromFile(join(ASSETS_DIR, filename))
      : await asyncBufferFromUrl({ url: CLOUDFRONT_BASE + filename });
    const meta = await parquetMetadataAsync(file);
    actualCols = meta.schema.map(f => f.name).filter(n => n !== 'schema');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`x ${filename}: not found in assets/ -- S3 cache may be empty.`);
      failed = true;
    } else if (!useLocal && /403|404/.test(e.message)) {
      console.warn(`! ${filename}: not available on CloudFront yet (pipeline not run) -- skipping`);
    } else {
      const source = useLocal ? 'local file' : 'CloudFront';
      console.error(`x ${filename}: could not read from ${source} (${e.message})`);
      failed = true;
    }
    continue;
  }

  const missing = expectedCols.filter(c => !actualCols.includes(c));
  if (missing.length > 0) {
    console.error(`x ${filename}: missing columns: ${missing.join(', ')}`);
    console.error(`  found: ${actualCols.join(', ')}`);
    failed = true;
  } else {
    console.log(`ok ${filename}`);
  }
}

if (failed) {
  console.error('\nSchema validation failed.');
  process.exit(1);
}
