// Phase 179 Plan 03 — Task 1 loader contract tests.
// Asserts _data/notes.js exports a Record<canonical_name, Note[]> and
// tolerates absence of public/data/notes.json (D-13, exact mirror of
// src/tests/data-species_hosts.test.ts).

import { describe, test, expect } from 'vitest';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import notes from '../../_data/notes.js';

describe('_data/notes.js (Phase 179)', () => {
  test('default export is an object (not null, not array)', () => {
    expect(notes).toBeDefined();
    expect(typeof notes).toBe('object');
    expect(notes).not.toBeNull();
    expect(Array.isArray(notes)).toBe(false);
  });

  test('absence-tolerant: module imports without throwing even when JSON is absent', () => {
    // If we reach this line, the import above succeeded — proof the loader does not
    // throw when public/data/notes.json is absent (clean checkout / local dev,
    // pre-first-nightly-harvest).
    expect(true).toBe(true);
  });

  test('each entry value is an array of Note objects (D-13 shape)', () => {
    for (const [canonicalName, entries] of Object.entries(notes as Record<string, any>)) {
      expect(Array.isArray(entries), `${canonicalName}: value must be an array`).toBe(true);
      for (const note of entries as any[]) {
        expect(typeof note.id, `${canonicalName}: note.id must be number`).toBe('number');
        expect(typeof note.html, `${canonicalName}: note.html must be string`).toBe('string');
        expect(typeof note.created, `${canonicalName}: note.created must be string`).toBe('string');
        expect(typeof note.updated, `${canonicalName}: note.updated must be string`).toBe('string');
        expect(typeof note.byline, `${canonicalName}: note.byline must be object`).toBe('object');
        expect(typeof note.byline.login, `${canonicalName}: byline.login must be string`).toBe('string');
        expect(
          note.byline.display_name === null || typeof note.byline.display_name === 'string',
          `${canonicalName}: byline.display_name must be string or null`,
        ).toBe(true);
        expect(
          note.byline.collector_url === null || typeof note.byline.collector_url === 'string',
          `${canonicalName}: byline.collector_url must be string or null`,
        ).toBe(true);
      }
    }
  });
});
