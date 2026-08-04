import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { OCCURRENCE_LABEL_FONT } from './basemap-style.ts';

// Every symbol layer below resolves its glyphs against the STYLE ROOT, which is
// now our own /basemap/fonts — so a stack we do not vendor 404s and the label
// silently disappears. `Open Sans Bold` / `Arial Unicode MS Bold`, which these
// layers asked for while Mapbox hosted the style, are exactly that case.
// basemap-style.test.ts asserts these specs against the vendored allowlist.
const LABEL_FONT = [OCCURRENCE_LABEL_FONT];

/**
 * Recency is NOT encoded in colour right now — all three tiers are the same
 * light grey, deliberately (2026-08-03).
 *
 * It used to be `thisYear: '#c8cccd'` against `#7f8c8d` for the other two, and
 * against the self-hosted basemap that read backwards: the light this-year
 * colour has almost no contrast with the pale terrain, so it was the OLD records
 * that jumped out — the opposite of the intended "fresh work pops". The count
 * label made it worse; white on `#c8cccd` is 1.62:1, effectively unreadable.
 *
 * Rather than re-tune two colours inside a scheme nobody had designed as a
 * whole, the distinction is dropped and the quieter of the two greys kept. The
 * DATA side is untouched — `recencyTier()` still classifies, the cluster
 * aggregation still counts `thisYearCount`/`lastYearCount`/`earlierCount`, and
 * the `recencyTier` feature property is still emitted — so restoring a recency
 * encoding is a change to these three values and the layer specs below, with no
 * pipeline work. Do that as part of designing the symbology properly, not by
 * reinstating the old pair.
 */
export const RECENCY_COLORS = {
  thisYear: '#c8cccd',
  lastYear: '#c8cccd',
  earlier:  '#c8cccd',
} as const;

/**
 * Cluster count labels. Dark, because the circle under them is now always the
 * light grey above — white was legible only on the dark half of the old scheme.
 * 6.2:1 on `#c8cccd`.
 */
const CLUSTER_COUNT_COLOR = '#3b4348';

const _thisYear = new Date().getFullYear();
const _lastYear = _thisYear - 1;

export function recencyTier(year: number, _month: number): keyof typeof RECENCY_COLORS {
  if (year >= _thisYear) return 'thisYear';
  if (year >= _lastYear) return 'lastYear';
  return 'earlier';
}

type RecencyColors = typeof RECENCY_COLORS;
type Visibility = 'visible' | 'none';

export function ghostPointLayerSpec(): CircleLayerSpecification {
  return {
    id: 'ghost-points',
    type: 'circle',
    source: 'occurrences-ghost',
    paint: {
      'circle-color': '#aaaaaa',
      'circle-opacity': 0.2,
      'circle-radius': 4,
      'circle-stroke-width': 0,
    },
  };
}

export function clusterCircleLayerSpec(colors: RecencyColors): CircleLayerSpecification {
  return {
    id: 'clusters',
    type: 'circle',
    source: 'occurrences',
    filter: ['has', 'point_count'],
    paint: {
      // Flat, not a `case` over the recency counts whose branches happen to be
      // equal: an expression that still branches reads as a live distinction to
      // the next person, and to `getPaintProperty`. See RECENCY_COLORS.
      'circle-color': colors.thisYear,
      'circle-radius': [
        'step', ['get', 'point_count'],
        12,
        25, 14,
        100, 17,
        500, 20,
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    },
  };
}

export function clusterCountLayerSpec(colors: RecencyColors): SymbolLayerSpecification {
  return {
    id: 'cluster-count',
    type: 'symbol',
    source: 'occurrences',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['to-string', ['get', 'point_count']],
      'text-size': 11,
      'text-font': LABEL_FONT,
    },
    paint: {
      'text-color': CLUSTER_COUNT_COLOR,
    },
  };
}

function _occurrencePointPaint(colors: RecencyColors): CircleLayerSpecification['paint'] {
  return {
    // tier drives the color family. `other` (expert observations
    // and literature) renders a muted desaturated grey-blue so external records
    // recede; `atlas` (community work) takes the recency palette.
    //
    // That palette is now one colour (see RECENCY_COLORS), so this is a two-way
    // split on TIER alone. Tier was not part of the 2026-08-03 decision and is
    // deliberately still encoded — dropping it too is a separate call.
    'circle-color': [
      'match', ['get', 'tier'],
      'other', '#7a8a99',
      colors.thisYear,
    ],
    'circle-radius': 6,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
  };
}

export function unclusteredPointLayerSpec(colors: RecencyColors): CircleLayerSpecification {
  return {
    id: 'unclustered-point',
    type: 'circle',
    source: 'occurrences',
    filter: ['!', ['has', 'point_count']],
    paint: _occurrencePointPaint(colors),
  };
}

export function selectedOccurrencesLayerSpec(colors: RecencyColors): CircleLayerSpecification {
  return {
    id: 'selected-occurrences',
    type: 'circle',
    source: 'selected-occurrences',
    paint: _occurrencePointPaint(colors),
  };
}

// line-join: round avoids miter extension at sharp three-way corners
// (#14 — small visible artifacts at Pierce/Lewis/Yakima-style junctions).
export function boundaryFillLayerSpec(source: string, id: string, visibility: Visibility): FillLayerSpecification {
  return {
    id,
    type: 'fill',
    source,
    layout: { visibility },
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        'rgba(44, 123, 229, 0.12)',
        'rgba(0, 0, 0, 0)',
      ],
    },
  };
}

export function boundaryLineLayerSpec(source: string, id: string, visibility: Visibility): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source,
    layout: { visibility, 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        'rgba(44, 123, 229, 0.85)',
        'rgba(80, 80, 80, 0.55)',
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        2.5,
        1.5,
      ],
    },
  };
}

// place boundaries use warm amber to distinguish from blue boundary layers
export function placeFillLayerSpec(visibility: Visibility): FillLayerSpecification {
  return {
    id: 'place-fill',
    type: 'fill',
    source: 'places',
    layout: { visibility },
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        'rgba(220, 130, 30, 0.12)',
        'rgba(0, 0, 0, 0)',
      ],
    },
  };
}

export function placeLineLayerSpec(visibility: Visibility): LineLayerSpecification {
  return {
    id: 'place-line',
    type: 'line',
    source: 'places',
    layout: { visibility, 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        'rgba(220, 130, 30, 0.85)',
        'rgba(180, 100, 30, 0.65)',
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        2.5,
        1.5,
      ],
    },
  };
}

export function placeLabelLayerSpec(visibility: Visibility): SymbolLayerSpecification {
  return {
    id: 'place-label',
    type: 'symbol',
    source: 'places',
    layout: {
      visibility,
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-font': LABEL_FONT,
      'text-max-width': 10,
      'symbol-placement': 'point',
    },
    paint: {
      'text-color': '#7a4a00',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  };
}

// Wilderness no-collect overlay (beeatlas-2vj). Unlike the county/ecoregion/place
// boundaries — which are neutral reference layers with a click-to-select
// feature-state — wilderness is a WARNING layer: designated federal wilderness
// where collecting is prohibited. It renders a constant red fill/outline (no
// feature-state, no selection) so "you can't collect here" reads at a glance.
export function wildernessFillLayerSpec(visibility: Visibility): FillLayerSpecification {
  return {
    id: 'wilderness-fill',
    type: 'fill',
    source: 'wilderness',
    layout: { visibility },
    paint: {
      'fill-color': 'rgba(200, 40, 40, 0.14)',
    },
  };
}

export function wildernessLineLayerSpec(visibility: Visibility): LineLayerSpecification {
  return {
    id: 'wilderness-line',
    type: 'line',
    source: 'wilderness',
    layout: { visibility, 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': 'rgba(180, 30, 30, 0.7)',
      'line-width': 1.5,
    },
  };
}

export function wildernessLabelLayerSpec(visibility: Visibility): SymbolLayerSpecification {
  return {
    id: 'wilderness-label',
    type: 'symbol',
    source: 'wilderness',
    layout: {
      visibility,
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-font': LABEL_FONT,
      'text-max-width': 10,
      'symbol-placement': 'point',
    },
    paint: {
      'text-color': '#8a1010',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  };
}

