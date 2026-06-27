// Phase 169 Wave 0 — RED contract for _data/collectors.js (PAGE-01, D-09). Mirrors data-places.test.ts.
// Phase 171 Wave 0 — STREAM-01/02/03 event-feed artifact-shape assertions (RED until Task 2 generates artifacts).
// Phase 171 Plan 02 — loader-contract assertion: collectorEventPages Array (STREAM-03).

import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import collectors from '../../_data/collectors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/collectors.js (PAGE-01, D-09)', () => {
  test('default export has a collectorsArray property that is an Array', () => {
    expect(Array.isArray((collectors as any).collectorsArray)).toBe(true);
  });

  test('collectorsArray.length is >= 100 (D-09 floor)', () => {
    expect((collectors as any).collectorsArray.length).toBeGreaterThanOrEqual(100);
  });

  test('every entry has required fields with correct types', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(typeof c.login).toBe('string');
      expect(typeof c.display_name).toBe('string');
      expect(typeof c.specimen_count).toBe('number');
      expect(typeof c.sample_count).toBe('number');
      expect(typeof c.species_count).toBe('number');
      expect(typeof c.status_denominator).toBe('number');
      expect(typeof c.status_identified).toBe('number');
      expect(typeof c.status_awaiting).toBe('number');
      // recordedBy may be string or null (sample-host-only collectors)
    }
  });

  test('status_identified + status_awaiting === status_denominator for every record (PAGE-03)', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(
        c.status_identified + c.status_awaiting,
        `split invariant for ${c.login}`
      ).toBe(c.status_denominator);
    }
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    const src = readFileSync(resolve(ROOT, '_data/collectors.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 171 Plan 02 — loader-contract: the _data/collectors.js default export must expose
// collectorEventPages. Under vitest (ELEVENTY_RUN_MODE unset) the guard returns []; assert
// Array-ness only (not non-empty — that lives in the artifact-shape block below).
// ---------------------------------------------------------------------------

describe('_data/collectors.js loader contract — Phase 171 (STREAM-03)', () => {
  test('default export has a collectorEventPages property that is an Array', () => {
    expect(Array.isArray((collectors as any).collectorEventPages)).toBe(true);
  });

  test('does NOT read parquet (extended file — Pitfall #8)', () => {
    const src = readFileSync(resolve(ROOT, '_data/collectors.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 171 — event feed artifact-shape assertions (STREAM-01/02/03)
//
// Reads committed artifacts DIRECTLY (readFileSync), NOT via _data/collectors.js,
// so these assertions are not affected by the dev-mode ELEVENTY_ENV guard that
// makes collectorEventPages return [] in Plan 02's extended loader (STREAM-03).
//
// RED state: collector_event_pages.json does not exist until Task 2 runs the export.
// beforeAll will throw → all tests in this block are RED until the artifact is committed.
// ---------------------------------------------------------------------------

describe('Phase 171 — event feed (STREAM-01/02/03)', () => {
  let collectorsRaw: any[];
  let collectorEventPagesRaw: any[];

  beforeAll(() => {
    // Read collectors.json directly (not via loader) to see the Phase 171 extended fields.
    collectorsRaw = JSON.parse(
      readFileSync(resolve(ROOT, 'public/data/collectors.json'), 'utf-8'),
    );
    // collector_event_pages.json does not exist until Task 2 generates it.
    // This readFileSync will throw in RED state → all tests below fail (expected).
    collectorEventPagesRaw = JSON.parse(
      readFileSync(resolve(ROOT, 'public/data/collector_event_pages.json'), 'utf-8'),
    );
  });

  // STREAM-01: each collectorsArray entry carries event-feed pagination metadata
  test('collectorsArray entries have first_page_events array and pagination counts (STREAM-01)', () => {
    for (const c of collectorsRaw) {
      expect(
        Array.isArray(c.first_page_events),
        `first_page_events of ${c.login} must be an array`,
      ).toBe(true);
      expect(typeof c.total_event_pages, `total_event_pages of ${c.login}`).toBe('number');
      expect(typeof c.total_event_count, `total_event_count of ${c.login}`).toBe('number');
    }
  });

  // STREAM-01: event items in first_page_events have the required shape
  test('first_page_events items have required event shape (STREAM-01)', () => {
    for (const c of collectorsRaw) {
      for (const ev of c.first_page_events as any[]) {
        expect(
          ['Collected', 'Identified'],
          `event_type of entry in ${c.login}`,
        ).toContain(ev.event_type);
        expect(typeof ev.event_type).toBe('string');
        // is_current must be boolean for Identified; null for Collected is allowed
        if (ev.event_type === 'Identified') {
          expect(
            typeof ev.is_current,
            `is_current must be boolean for Identified in ${c.login}`,
          ).toBe('boolean');
          // is_reidentification must be boolean for Identified events (UAT fix 2026-06-27):
          // true = later determination (Re-identified), false = earliest (Identified)
          expect(
            typeof ev.is_reidentification,
            `is_reidentification must be boolean for Identified in ${c.login}`,
          ).toBe('boolean');
        } else {
          // Collected events carry is_reidentification=null (not applicable)
          expect(
            ev.is_reidentification,
            `is_reidentification must be null for Collected in ${c.login}`,
          ).toBeNull();
        }
        // is_pending must be a boolean (true for waba_specimen awaiting-ID, false otherwise)
        expect(typeof ev.is_pending, `is_pending in ${c.login}`).toBe('boolean');
        // catalog_number: string for catalogued specimens, null otherwise
        expect(
          ev.catalog_number === null || typeof ev.catalog_number === 'string',
          `catalog_number must be string or null in ${c.login}`,
        ).toBe(true);
        // ecdysis_id: number for catalogued specimens, null for waba_specimen awaiting-ID
        expect(
          ev.ecdysis_id === null || typeof ev.ecdysis_id === 'number',
          `ecdysis_id must be number or null in ${c.login}`,
        ).toBe(true);
      }
    }
  });

  // STREAM-03: collector_event_pages.json is a non-empty array (pagination fires in production)
  test('collector_event_pages.json is a non-empty array (STREAM-03)', () => {
    expect(Array.isArray(collectorEventPagesRaw)).toBe(true);
    expect(collectorEventPagesRaw.length).toBeGreaterThan(0);
  });

  // STREAM-03: every sub-page entry has the required descriptor shape
  test('every collectorEventPages entry has required fields (STREAM-03)', () => {
    for (const page of collectorEventPagesRaw) {
      expect(typeof page.login).toBe('string');
      expect(typeof page.page_num).toBe('number');
      expect(page.page_num).toBeGreaterThanOrEqual(2);
      expect(typeof page.total_pages).toBe('number');
      expect(Array.isArray(page.events)).toBe(true);
      expect(page.events.length).toBeGreaterThan(0);
    }
  });
});
