// beeatlas-8gcw: one label anchor per FEATURE, not per polygon part.
import { describe, test, expect } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { labelAnchors } from '../polygon-label.ts';

/** Axis-aligned square ring, counter-clockwise, closed. */
function square(x: number, y: number, size: number): number[][] {
  return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
}

describe('labelAnchors', () => {
  test('a MultiPolygon of many parts yields exactly ONE anchor', () => {
    // The bug this exists for: MapLibre labels every polygon of a MultiPolygon, so
    // the 58-patch "Loess Islands" printed its name 58 times across the state.
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { slug: '10b-loess-islands', name: '10b. Loess Islands' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[square(0, 0, 1)], [square(50, 50, 1)], [square(90, 10, 1)]],
        },
      }],
    };
    const out = labelAnchors(fc);
    expect(out.features).toHaveLength(1);
    expect(out.features[0]!.properties).toEqual({ slug: '10b-loess-islands', name: '10b. Loess Islands' });
  });

  test('the anchor sits in the LARGEST part, not the first one listed', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'lopsided' },
        // A speck at the origin, then the real mass out at (100, 100).
        geometry: { type: 'MultiPolygon', coordinates: [[square(0, 0, 1)], [square(100, 100, 10)]] },
      }],
    };
    const [lon, lat] = labelAnchors(fc).features[0]!.geometry.coordinates;
    expect(lon).toBeCloseTo(105, 6);
    expect(lat).toBeCloseTo(105, 6);
  });

  test('a simple Polygon anchors at its centroid, holes ignored', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'donut' },
        geometry: { type: 'Polygon', coordinates: [square(0, 0, 10), square(4, 4, 2)] },
      }],
    };
    const [lon, lat] = labelAnchors(fc).features[0]!.geometry.coordinates;
    expect(lon).toBeCloseTo(5, 6);
    expect(lat).toBeCloseTo(5, 6);
  });

  test('unusable features are dropped, not anchored at (0, 0)', () => {
    // A label in the Gulf of Guinea is worse than no label.
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        // A null geometry is legal GeoJSON and does reach us; the cast is only
        // because @types/geojson types Feature.geometry as non-nullable.
        { type: 'Feature', properties: { name: 'nothing' }, geometry: null as never },
        { type: 'Feature', properties: { name: 'a point' }, geometry: { type: 'Point', coordinates: [1, 2] } },
        { type: 'Feature', properties: { name: 'real' }, geometry: { type: 'Polygon', coordinates: [square(0, 0, 2)] } },
      ],
    };
    const out = labelAnchors(fc);
    expect(out.features.map(f => f.properties!['name'])).toEqual(['real']);
  });

  test('an empty collection stays an empty collection', () => {
    expect(labelAnchors({ type: 'FeatureCollection', features: [] })).toEqual(
      { type: 'FeatureCollection', features: [] },
    );
  });
});
