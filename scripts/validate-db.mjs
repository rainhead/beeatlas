#!/usr/bin/env node
/**
 * Validates that occurrences.db on S3 was built with the tables the frontend expects.
 *
 * Reads public/data/manifest.json (written by make-local-manifest.js for local dev,
 * or copied from S3 by the CI fetch step) and checks the occurrences_db_tables field.
 *
 * Exits 1 if the field is present but missing required tables.
 * Warns (exits 0) if the field is absent — the nightly predates this check.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';

const REQUIRED_TABLES = ['geo_blob', 'occurrences', 'occurrence_places'];

export function validateDbTables(manifest) {
  const tables = manifest.occurrences_db_tables;
  if (!Array.isArray(tables)) return { missing: null }; // field absent — soft-fail
  const missing = REQUIRED_TABLES.filter(t => !tables.includes(t));
  return { missing };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const ROOT = new URL('..', import.meta.url).pathname;
  const MANIFEST_PATH = join(buildDataDir(ROOT), 'manifest.json');

  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`! ${MANIFEST_PATH}: not found — skipping occurrences.db schema check`);
    process.exit(0);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (e) {
    console.error(`x manifest.json: could not parse (${e.message})`);
    process.exit(1);
  }

  const { missing } = validateDbTables(manifest);
  if (missing === null) {
    console.warn('! occurrences_db_tables: absent from manifest — nightly predates this check; skipping');
    process.exit(0);
  }
  if (missing.length > 0) {
    const found = manifest.occurrences_db_tables.join(', ');
    console.error(`x occurrences.db: missing tables: ${missing.join(', ')}`);
    console.error(`  found: ${found || '(none)'}`);
    console.error('  The nightly pipeline must run with the current sqlite_export.py before deploying.');
    process.exit(1);
  }
  console.log(`ok occurrences.db (tables: ${manifest.occurrences_db_tables.join(', ')})`);
}
