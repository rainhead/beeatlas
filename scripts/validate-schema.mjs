#!/usr/bin/env node
/**
 * Validates that parquet files have the columns the frontend expects.
 *
 * Modes:
 * - Local: if public/data/occurrences.parquet exists, validate from disk
 *   (preserves dev workflow for anyone who runs the pipeline locally)
 * - CloudFront: otherwise, fetch from https://beeatlas.net/data/ using Range
 *   requests (only the parquet footer is fetched, not the full file)
 *
 * Expected columns are derived from parquet.ts column lists — update here
 * whenever you add a column to the frontend.
 */

import { asyncBufferFromFile, asyncBufferFromUrl, parquetMetadataAsync } from 'hyparquet';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_DIR = new URL('../public/data/', import.meta.url).pathname;
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
    'observation_id', 'host_inat_login', 'specimen_count', 'sample_id', 'sample_host',
    // unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
    // WABA specimen fields (null when no WABA obs linked)
    'specimen_inat_taxon_name', 'specimen_inat_quality_grade',
    // provisional flag
    'is_provisional',
    // Phase 78 / Pitfall #6: canonical_name materialized for species-aggregation joins
    'canonical_name',
  ],
  'species.parquet': [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date',
    // LIST<INT32> in parquet — column-presence check only, do not assert [12] suffix
    'month_histogram',
    'county_count', 'ecoregion_count', 'slug',
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

// Phase 78: species.json shape check (top-level array, row[0] has required keys).
// Local-only — CloudFront branch is feature-gated by `useLocal` (T-78-01).
const speciesJsonPath = join(ASSETS_DIR, 'species.json');
if (useLocal && existsSync(speciesJsonPath)) {
  try {
    const speciesJson = JSON.parse(readFileSync(speciesJsonPath, 'utf-8'));
    if (!Array.isArray(speciesJson)) {
      console.error('x species.json: expected top-level array');
      failed = true;
    } else if (speciesJson.length > 0) {
      const required = ['scientificName', 'canonical_name', 'on_checklist', 'occurrence_count', 'slug'];
      const missing = required.filter(k => !(k in speciesJson[0]));
      if (missing.length) {
        console.error(`x species.json: row[0] missing keys: ${missing.join(', ')}`);
        failed = true;
      } else {
        console.log('ok species.json');
      }
    } else {
      console.log('ok species.json (empty)');
    }
  } catch (e) {
    console.error(`x species.json: could not parse (${e.message})`);
    failed = true;
  }
}

if (failed) {
  console.error('\nSchema validation failed.');
  process.exit(1);
}
