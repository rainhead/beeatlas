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
    // Read committed fixtures (not public/data/) so npm test passes on a clean checkout
    // with zero S3 access (D-05/D-06). Fixtures carry the full Phase 171 extended shape.
    collectorsRaw = JSON.parse(
      readFileSync(resolve(ROOT, 'src/tests/fixtures/collectors.fixture.json'), 'utf-8'),
    );
    collectorEventPagesRaw = JSON.parse(
      readFileSync(resolve(ROOT, 'src/tests/fixtures/collector_event_pages.fixture.json'), 'utf-8'),
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

  // Phase 171 iNat-fallback: inat_url is string or null/undefined on every event item.
  test('first_page_events items have inat_url as string or null (Part 2 iNat fallback)', () => {
    for (const c of collectorsRaw) {
      for (const ev of c.first_page_events as any[]) {
        expect(
          ev.inat_url === null || ev.inat_url === undefined || typeof ev.inat_url === 'string',
          `inat_url must be string or null/undefined in ${c.login}`,
        ).toBe(true);
      }
    }
  });

  // Phase 171 iNat-fallback: species_slug and inat_url are mutually exclusive.
  test('species_slug and inat_url are mutually exclusive; at least one event has inat_url (Part 2)', () => {
    let foundInatUrl = false;
    for (const c of collectorsRaw) {
      for (const ev of c.first_page_events as any[]) {
        if (ev.inat_url) {
          expect(
            ev.species_slug,
            `species_slug must be null/absent when inat_url is set (${c.login})`,
          ).toBeFalsy();
          expect(typeof ev.inat_url).toBe('string');
          const inat = ev.inat_url as string;
          expect(
            inat.startsWith('https://www.inaturalist.org/taxa/')
              && !inat.startsWith('https://www.inaturalist.org/taxa/search'),
            `inat_url must use the /taxa/{name} redirect endpoint (not taxa/search); got ${inat}`,
          ).toBe(true);
          foundInatUrl = true;
        }
      }
    }
    expect(
      foundInatUrl,
      'at least one event in committed collectors.json must have inat_url (non-bee determination exists)',
    ).toBe(true);
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

// ---------------------------------------------------------------------------
// Phase 172 — accomplishment fields (ACCOM-01..04)
//
// Reads the committed fixture directly via readFileSync — NOT via the live
// _data/collectors.js loader (which returns collectorsArray=[] on a clean
// checkout because public/data/collectors.json is S3-delivered and gitignored).
// These assertions are self-consistent and GREEN immediately; Plans 02/03
// extend the export to produce the shape asserted here.
// ---------------------------------------------------------------------------

describe('Phase 172 — accomplishment fields (ACCOM-01..04)', () => {
  let fixtureData: any[];

  beforeAll(() => {
    fixtureData = JSON.parse(
      readFileSync(resolve(ROOT, 'src/tests/fixtures/collectors.fixture.json'), 'utf-8'),
    );
  });

  test('every fixture entry has active_since and seasons_count as numbers (ACCOM-04)', () => {
    expect(fixtureData.length).toBeGreaterThan(0);
    for (const c of fixtureData) {
      expect(typeof c.active_since, `active_since of ${c.login}`).toBe('number');
      expect(typeof c.seasons_count, `seasons_count of ${c.login}`).toBe('number');
    }
  });

  test('every fixture entry has county_count and ecoregion_count as numbers (ACCOM-01/03)', () => {
    for (const c of fixtureData) {
      expect(typeof c.county_count, `county_count of ${c.login}`).toBe('number');
      expect(typeof c.ecoregion_count, `ecoregion_count of ${c.login}`).toBe('number');
    }
  });

  test('every fixture entry has county_names and ecoregion_names as sorted arrays (FIX A)', () => {
    for (const c of fixtureData) {
      expect(
        Array.isArray(c.county_names),
        `county_names of ${c.login} must be an Array`,
      ).toBe(true);
      expect(
        Array.isArray(c.ecoregion_names),
        `ecoregion_names of ${c.login} must be an Array`,
      ).toBe(true);
      // Counts must match the length of the name arrays
      expect(
        c.county_count,
        `county_count must equal county_names.length for ${c.login}`,
      ).toBe((c.county_names as string[]).length);
      expect(
        c.ecoregion_count,
        `ecoregion_count must equal ecoregion_names.length for ${c.login}`,
      ).toBe((c.ecoregion_names as string[]).length);
      // Arrays must be sorted alphabetically
      const sortedCounties = [...(c.county_names as string[])].sort();
      expect(
        c.county_names,
        `county_names must be sorted alphabetically for ${c.login}`,
      ).toEqual(sortedCounties);
      const sortedEcoregions = [...(c.ecoregion_names as string[])].sort();
      expect(
        c.ecoregion_names,
        `ecoregion_names must be sorted alphabetically for ${c.login}`,
      ).toEqual(sortedEcoregions);
    }
  });

  test('every fixture entry has species_by_genus as an Array (ACCOM-02)', () => {
    for (const c of fixtureData) {
      expect(Array.isArray(c.species_by_genus), `species_by_genus of ${c.login} must be Array`).toBe(true);
    }
  });

  test('species_by_genus genus groups have correct shape — name cased, count present (FIX B / UAT round 2)', () => {
    for (const c of fixtureData) {
      for (const g of c.species_by_genus as any[]) {
        expect(typeof g.genus, `genus in ${c.login}`).toBe('string');
        expect(Array.isArray(g.species), `species in genus ${g.genus} of ${c.login}`).toBe(true);
        for (const sp of g.species as any[]) {
          // FIX B: `name` (cased scientificName) replaces `canonical_name`
          expect(
            typeof sp.name,
            `name in ${c.login}/${g.genus} must be string (FIX B)`,
          ).toBe('string');
          expect(
            sp.name[0],
            `name must start with uppercase (FIX B — cased scientificName): ${sp.name}`,
          ).toBe(sp.name[0].toUpperCase());
          expect(
            'canonical_name' in sp,
            `canonical_name must NOT be present — replaced by name (FIX B): ${c.login}/${g.genus}`,
          ).toBe(false);
          expect(typeof sp.slug, `slug in ${c.login}/${g.genus}`).toBe('string');
          expect(sp.slug, `slug must contain "/" (D-04 Genus/epithet format)`).toContain('/');
          // UAT round 2: per-species count restored (atlas records of the species)
          expect(
            typeof sp.count,
            `count must be a number in species entry (UAT round 2): ${c.login}/${g.genus}`,
          ).toBe('number');
          expect(
            sp.count,
            `count must be >= 1: ${c.login}/${g.genus}`,
          ).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  test('at least one fixture entry has multi-genus species_by_genus (D-04 ordering)', () => {
    const hasMultiGenus = fixtureData.some((c: any) => c.species_by_genus.length > 1);
    expect(hasMultiGenus, 'at least one fixture entry must have multiple genus groups').toBe(true);
  });
});
