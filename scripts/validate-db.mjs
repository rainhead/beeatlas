#!/usr/bin/env node
/**
 * Validates that occurrences.db in the build data dir was built with the
 * tables the frontend expects, by reading the file's own sqlite_master
 * (node:sqlite, read-only).
 *
 * Model Y: this used to trust the manifest's occurrences_db_tables field
 * (written by the nightly's bash publish loop). The slim manifest no longer
 * carries it — the db file itself is the source of truth.
 *
 * Exits 1 if the db is present but missing required tables.
 * Warns (exits 0) if the db is absent — data-less checkouts still build
 * (the _data loaders are absence-tolerant for the same reason).
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataDir } from '../lib/build-data-dir.js';

const REQUIRED_TABLES = ['geo_blob', 'occurrences', 'occurrence_places'];

export function missingTables(tables) {
  return REQUIRED_TABLES.filter(t => !tables.includes(t));
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const ROOT = new URL('..', import.meta.url).pathname;
  const DB_PATH = join(buildDataDir(ROOT), 'occurrences.db');

  if (!existsSync(DB_PATH)) {
    console.warn(`! ${DB_PATH}: not found — skipping occurrences.db schema check`);
    process.exit(0);
  }

  let tables;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all().map(r => r.name);
    db.close();
  } catch (e) {
    console.error(`x occurrences.db: could not read schema (${e.message})`);
    process.exit(1);
  }

  const missing = missingTables(tables);
  if (missing.length > 0) {
    console.error(`x occurrences.db: missing tables: ${missing.join(', ')}`);
    console.error(`  found: ${tables.join(', ') || '(none)'}`);
    console.error('  The data build must run with the current sqlite_export.py before deploying.');
    process.exit(1);
  }
  console.log(`ok occurrences.db (tables: ${tables.join(', ')})`);
}
