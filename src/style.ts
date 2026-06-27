import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'mapbox-gl';

export const RECENCY_COLORS = {
  thisYear: '#c8cccd',
  lastYear: '#7f8c8d',
  earlier:  '#7f8c8d',
} as const;

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
      'circle-color': [
        'case',
        ['>', ['get', 'thisYearCount'], 0], colors.thisYear,
        ['>', ['get', 'lastYearCount'], 0], colors.lastYear,
        colors.earlier,
      ],
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
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': [
        'case',
        ['>', ['get', 'thisYearCount'], 0], '#ffffff',
        '#d0d6d7',
      ],
    },
  };
}

function _occurrencePointPaint(colors: RecencyColors): CircleLayerSpecification['paint'] {
  return {
    // Phase 170 (D-08): tier drives the color family. `atlas` (community work) keeps the
    // recency gradient so fresh work pops — the liveness/togetherness signal. `other`
    // (expert observations + literature, incl. former checklist green) renders muted/neutral
    // so external records recede. Muted color: a desaturated grey-blue, distinct from the
    // recency palette so Atlas stands out.
    'circle-color': [
      'match', ['get', 'tier'],
      'other', '#7a8a99',
      ['match', ['get', 'recencyTier'],
        'thisYear', colors.thisYear,
        'lastYear', colors.lastYear,
        colors.earlier,
      ],
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

// D-06: place boundaries use warm amber to distinguish from blue boundary layers
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
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
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

