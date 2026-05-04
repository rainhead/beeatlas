// Phase 80 Wave 0 — RED contract for PAGE-03.
// Asserts _data/photos.js exports a Record keyed by scientificName with
// { description: string, photos: any[] } values; photos sorted by ordering ascending.

import { describe, test, expect } from 'vitest';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import photos from '../../_data/photos.js';

describe('_data/photos.js (PAGE-03)', () => {
  test('exports Record<scientificName, { description: string, photos: any[] }>', () => {
    for (const [, entry] of Object.entries(photos as Record<string, any>)) {
      expect(typeof entry.description).toBe('string');
      expect(Array.isArray(entry.photos)).toBe(true);
    }
  });

  test('photos within each entry are sorted by ordering ascending', () => {
    for (const [name, entry] of Object.entries(photos as Record<string, any>)) {
      const orderings: number[] = entry.photos.map((p: any) => p.ordering ?? 0);
      const sorted = [...orderings].sort((a, b) => a - b);
      expect(orderings, `${name} photos not sorted by ordering`).toEqual(sorted);
    }
  });
});
