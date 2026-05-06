// Phase 80 Wave 0 — RED contract for PAGE-03.
// Asserts _data/photos.js exports a Record keyed by scientificName with
// { description: string, photos: any[] } values; photos sorted by ordering ascending.
//
// Phase 82 PERF-03 / D-09: deriveSrcset helper tests.

import { describe, test, expect } from 'vitest';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import photos from '../../_data/photos.js';
// @ts-expect-error -- lib/*.js is plain ESM; no .d.ts
import { deriveSrcset } from '../../lib/inat-srcset.js';

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

  test('every photo has src and srcset fields after decoration', () => {
    for (const [, entry] of Object.entries(photos as Record<string, any>)) {
      for (const p of entry.photos) {
        expect('src' in p, 'photo missing src field').toBe(true);
        expect('srcset' in p, 'photo missing srcset field').toBe(true);
      }
    }
  });
});

describe('deriveSrcset (Phase 82 PERF-03 / D-09)', () => {
  const INAT_MEDIUM = 'https://inaturalist-open-data.s3.amazonaws.com/photos/12345/medium.jpg';
  const INAT_SQUARE = 'https://inaturalist-open-data.s3.amazonaws.com/photos/12345/square.jpg';
  const INAT_SMALL  = 'https://inaturalist-open-data.s3.amazonaws.com/photos/12345/small.jpg';

  test('iNat medium URL → src=medium, srcset with 75w/240w/500w', () => {
    const { src, srcset } = (deriveSrcset as any)(INAT_MEDIUM);
    expect(src).toBe(INAT_MEDIUM);
    expect(srcset).toBe(`${INAT_SQUARE} 75w, ${INAT_SMALL} 240w, ${INAT_MEDIUM} 500w`);
  });

  test('non-iNat URL → src unchanged, srcset empty', () => {
    const url = 'https://example.com/foo.jpg';
    const { src, srcset } = (deriveSrcset as any)(url);
    expect(src).toBe(url);
    expect(srcset).toBe('');
  });

  test('large URL → src downgraded to medium, srcset emitted', () => {
    const largeUrl = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/large.jpeg';
    const mediumUrl = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/medium.jpeg';
    const squareUrl = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/square.jpeg';
    const smallUrl  = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/small.jpeg';
    const { src, srcset } = (deriveSrcset as any)(largeUrl);
    expect(src).toBe(mediumUrl);
    expect(srcset).toBe(`${squareUrl} 75w, ${smallUrl} 240w, ${mediumUrl} 500w`);
  });

  test('original URL → src downgraded to medium, srcset emitted', () => {
    const originalUrl = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/original.png';
    const mediumUrl   = 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/medium.png';
    const { src, srcset } = (deriveSrcset as any)(originalUrl);
    expect(src).toBe(mediumUrl);
    expect(srcset).toContain('75w');
  });

  test('extension is preserved (jpg stays jpg)', () => {
    const { srcset } = (deriveSrcset as any)(INAT_MEDIUM);
    for (const entry of srcset.split(', ')) {
      expect(entry.endsWith('.jpg 75w') || entry.endsWith('.jpg 240w') || entry.endsWith('.jpg 500w')).toBe(true);
    }
  });

  test('decoration is idempotent', () => {
    const first  = (deriveSrcset as any)(INAT_MEDIUM);
    const second = (deriveSrcset as any)(first.src);
    expect(second.src).toBe(first.src);
    expect(second.srcset).toBe(first.srcset);
  });
});
