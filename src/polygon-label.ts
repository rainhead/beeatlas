// One label anchor per polygon FEATURE (beeatlas-8gcw).
//
// MapLibre's `symbol-placement: point` anchors a label to every POLYGON of a
// MultiPolygon, not to the feature. That is right for the collecting sites — each
// is one polygon — and wrong for the Level IV ecoregions, which are dissolved from
// the EPA's per-patch source: "Loess Islands" is 58 disjoint patches, so the state
// came up stamped with 58 copies of its name.
//
// So the label layer reads a DERIVED point source rather than the polygons. The
// anchor is the area-weighted centroid of the feature's largest ring, which for the
// blobby shapes these are lands inside the region and near the middle of its
// dominant mass. It is not point-on-surface: a genuinely crescent-shaped region
// could put its label just outside itself. That is a label nudged off-centre, not a
// wrong answer, and it costs no geometry library.

import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';

type Ring = number[][];

/** Signed area of a closed ring (shoelace). Sign is winding; magnitude is area. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!;
    sum += (a[0]! * b[1]!) - (b[0]! * a[1]!);
  }
  return sum / 2;
}

/** Area-weighted centroid of a closed ring. Falls back to the vertex mean for a
 *  degenerate (zero-area) ring, where the shoelace centroid divides by zero. */
function ringCentroid(ring: Ring): [number, number] {
  const area = ringArea(ring);
  if (area === 0) {
    const n = ring.length || 1;
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]!; sy += p[1]!; }
    return [sx / n, sy / n];
  }
  let cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!;
    const cross = (a[0]! * b[1]!) - (b[0]! * a[1]!);
    cx += (a[0]! + b[0]!) * cross;
    cy += (a[1]! + b[1]!) * cross;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/** Every OUTER ring of a Polygon or MultiPolygon; holes are irrelevant to placement. */
function outerRings(geometry: Polygon | MultiPolygon): Ring[] {
  return geometry.type === 'Polygon'
    ? (geometry.coordinates[0] ? [geometry.coordinates[0]] : [])
    : geometry.coordinates.map(poly => poly[0]).filter((r): r is Ring => !!r);
}

/**
 * Turn a polygon FeatureCollection into one Point per feature, carrying the same
 * properties, for use as a label-only source. Features with no usable ring are
 * dropped rather than anchored at (0, 0) — a label in the Gulf of Guinea is worse
 * than no label.
 */
export function labelAnchors(fc: FeatureCollection): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const f of fc.features ?? []) {
    const geometry = f.geometry as Polygon | MultiPolygon | null;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;
    const rings = outerRings(geometry);
    if (rings.length === 0) continue;
    let biggest = rings[0]!;
    let biggestArea = Math.abs(ringArea(biggest));
    for (const ring of rings.slice(1)) {
      const area = Math.abs(ringArea(ring));
      if (area > biggestArea) { biggest = ring; biggestArea = area; }
    }
    features.push({
      type: 'Feature',
      properties: f.properties ?? {},
      geometry: { type: 'Point', coordinates: ringCentroid(biggest) },
    });
  }
  return { type: 'FeatureCollection', features };
}
