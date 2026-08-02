/**
 * The self-hosted basemap style (beeatlas-26q, beeatlas-4mk).
 *
 * Builds a MapLibre style from the Protomaps light theme, then overrides it for
 * FIELD use. The stock theme is tuned for urban browsing: it paints paths at
 * #ebebeb on a near-white background with line-width starting at 0 until z14,
 * and streams as a 0.5px hairline. In the Cascades that renders as a flat green
 * rectangle — the trail network is present in the tiles and simply invisible.
 * Volunteers named roads, trails, streams/rivers and peaks as what they need in
 * the field, so those are what this style promotes.
 *
 * The style is built in code rather than emitted as a JSON artifact so it rides
 * inside the content-hashed, service-worker-precached app bundle (offline for
 * free) and can be unit-tested.
 */
import { layers, namedTheme } from 'protomaps-themes-base';
import type { StyleSpecification } from 'maplibre-gl';

/** Where publish-basemap.sh puts the archive + its manifest (see the Apache Alias). */
export const BASEMAP_TILES_BASE = '/basemap/tiles';
/** Vendored under public/basemap, shipped with the code through the page tree. */
export const BASEMAP_GLYPHS_PATH = '/basemap/fonts/{fontstack}/{range}.pbf';
export const BASEMAP_SPRITE_PATH = '/basemap/sprites/light';

/**
 * MapLibre v6 REJECTS a root-relative sprite URL outright ("Invalid sprite URL
 * …, must be absolute"), so every asset URL in the style is absolutised against
 * the page origin. Kept as an explicit argument rather than reading `location`
 * inside the builder so the function stays pure and testable.
 */
function defaultOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : 'http://localhost';
}

/**
 * The fontstacks vendored in public/basemap/fonts. MapLibre fetches glyph ranges
 * lazily BY CODEPOINT, so a stack or range we have not shipped fails offline as
 * blank boxes with no error. basemap-style.test.ts asserts the built style
 * references nothing outside this list.
 */
export const VENDORED_FONTSTACKS = [
  'Noto Sans Regular',
  'Noto Sans Medium',
  'Noto Sans Italic',
] as const;

/**
 * The stack the OCCURRENCE layers label with (src/style.ts) — cluster counts,
 * place names, wilderness names. Named here, beside the allowlist it has to
 * satisfy, because the constraint lives here: only what public/basemap/fonts
 * ships can render, and no Bold is shipped. Under Mapbox these layers asked for
 * 'Open Sans Bold', which the hosted style served; post-migration an unshipped
 * stack 404s and the labels vanish SILENTLY, so this is not a cosmetic choice.
 */
export const OCCURRENCE_LABEL_FONT = 'Noto Sans Medium';

/** Ranges vendored for each stack. Latin + Latin Extended + general punctuation. */
export const VENDORED_GLYPH_RANGES = ['0-255', '256-511', '8192-8447'] as const;

/**
 * Below this zoom the Protomaps schema carries no paths, streams or peaks at
 * all — only major roads and rivers. Painting trails below it is not merely
 * pointless, it is misleading: an empty map reads as "no trails here".
 */
export const FIELD_DETAIL_MINZOOM = 13;

const SOURCE = 'protomaps';

export interface BasemapRegion {
  archive: string;
  bytes: number;
  maxzoom: number;
  attribution: string;
}
export interface BasemapManifest {
  regions: Record<string, BasemapRegion>;
}

/** The only region today. `regions` is keyed for a future world, not a current one. */
export const DEFAULT_REGION = 'wa';

export function basemapManifestUrl(): string {
  return `${BASEMAP_TILES_BASE}/manifest.json`;
}

/** Narrow an unknown payload to a manifest, so a bad fetch fails here not in MapLibre. */
export function parseBasemapManifest(value: unknown): BasemapManifest {
  const regions = (value as BasemapManifest | null)?.regions;
  if (!regions || typeof regions !== 'object') {
    throw new Error('basemap manifest: missing "regions"');
  }
  for (const [key, r] of Object.entries(regions)) {
    if (!r || typeof r.archive !== 'string' || !r.archive) {
      throw new Error(`basemap manifest: region "${key}" has no archive`);
    }
  }
  return { regions };
}

/**
 * Build the field style for a region. Pure — the caller supplies the manifest, so
 * this is testable without a network and the fetch policy stays one layer up.
 */
export function buildBasemapStyle(
  manifest: BasemapManifest,
  options: { region?: string; origin?: string } = {},
): StyleSpecification {
  const region = options.region ?? DEFAULT_REGION;
  const origin = (options.origin ?? defaultOrigin()).replace(/\/$/, '');
  const entry = manifest.regions[region];
  if (!entry) throw new Error(`basemap manifest: no region "${region}"`);

  // layers() takes a theme OBJECT. Passing the name string yields null colors
  // throughout and MapLibre rejects the entire style (protomaps-themes-base v4.5).
  const themed = layers(SOURCE, namedTheme('light'), { lang: 'en' }) as StyleLayer[];

  const style: StyleSpecification = {
    version: 8,
    glyphs: `${origin}${BASEMAP_GLYPHS_PATH}`,
    sprite: `${origin}${BASEMAP_SPRITE_PATH}`,
    sources: {
      [SOURCE]: {
        type: 'vector',
        // Resolved by the pmtiles protocol handler the map registers; the archive
        // is one file read with HTTP range requests, no tile server.
        url: `pmtiles://${origin}${BASEMAP_TILES_BASE}/${entry.archive}`,
        attribution: entry.attribution,
      },
    },
    layers: applyFieldOverrides(themed),
  };
  return style;
}

/**
 * The style to render when the basemap is unavailable — the manifest fetch
 * failed, or its payload did not parse. A flat background and nothing else.
 *
 * This exists so that "no basemap" is a DEGRADED map rather than no map at all.
 * The occurrence sources and layers are added on the map's `load` event, and
 * `load` only fires once a style has finished loading; under Mapbox an offline
 * cold start never reached it, so the dots never appeared. A local style always
 * loads, so the occurrences render over blank paper — which, with the recency
 * colours and the boundary overlays, is still a usable map.
 *
 * `glyphs` is set even though this style has no labels of its own: the
 * occurrence layers include three symbol layers (cluster counts, place and
 * wilderness names) and MapLibre resolves their glyphs against the STYLE ROOT.
 * Omitting it here would blank exactly the labels this fallback exists to keep.
 * No `sprite` — nothing in this style or in the occurrence layers draws an icon.
 */
export function blankBasemapStyle(options: { origin?: string } = {}): StyleSpecification {
  const origin = (options.origin ?? defaultOrigin()).replace(/\/$/, '');
  return {
    version: 8,
    glyphs: `${origin}${BASEMAP_GLYPHS_PATH}`,
    sources: {},
    layers: [{
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f4f3ef' },
    }],
  };
}

// The style-spec layer type is structurally awkward to narrow here; the overrides
// below only touch paint/layout/minzoom, which every layer variant permits.
type StyleLayer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  minzoom?: number;
  [k: string]: unknown;
};

function applyFieldOverrides(themed: StyleLayer[]): StyleSpecification['layers'] {
  const byId = new Map(themed.map((l) => [l.id, l]));

  // --- Trails. The theme's "other" road layers are where path:path,
  // path:footway, path:track and path:steps land. Make them read as trails:
  // dashed, brown, and heavy enough to follow at arm's length in sunlight.
  for (const id of ['roads_other', 'roads_bridges_other', 'roads_tunnels_other']) {
    const l = byId.get(id);
    if (!l) continue;
    l.paint = {
      ...l.paint,
      'line-color': '#9a6b3f',
      'line-dasharray': [2, 1.2],
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1.1, 16, 2.6, 20, 6],
    };
    l.minzoom = FIELD_DETAIL_MINZOOM;
  }

  // --- Streams and rivers. Thin pale blue is the first thing to disappear
  // against landcover fills, and moving water is a primary navigation feature.
  const stream = byId.get('water_stream');
  if (stream) {
    stream.paint = {
      ...stream.paint,
      'line-color': '#3d8fb0',
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.9, 16, 2.2, 20, 5],
    };
  }
  // Rivers get their own heavier ramp — thickened as well as darkened, and
  // deliberately wider than a stream so the two read as different sizes of water
  // rather than one undifferentiated blue web.
  const river = byId.get('water_river');
  if (river) {
    river.paint = {
      ...river.paint,
      'line-color': '#3d8fb0',
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1.4, 16, 3.2, 20, 7],
    };
  }
  for (const l of themed) {
    if (l.id.startsWith('water') && l.type === 'line' &&
        l.id !== 'water_stream' && l.id !== 'water_river') {
      l.paint = { ...l.paint, 'line-color': '#3d8fb0' };
    }
  }

  // --- Peaks arrive at z13 inside the generic pois layer with no emphasis.
  // Promote them to their own labelled layer above everything else.
  const peaks: StyleLayer = {
    id: 'field_peaks',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'pois',
    minzoom: FIELD_DETAIL_MINZOOM,
    filter: ['==', ['get', 'kind'], 'peak'],
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ''],
      'text-font': ['literal', ['Noto Sans Medium']],
      'text-size': 11,
      'text-offset': [0, 0.7],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#5c4326',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.6,
    },
  };

  return [...themed, peaks] as unknown as StyleSpecification['layers'];
}

/**
 * Every fontstack the style asks for, from anywhere in a `text-font` value —
 * plain arrays, ["literal", [...]], and the theme's ["case", ...] forms alike.
 * Exported so the test can assert the allowlist rather than re-implementing it.
 */
/**
 * Expression operators that can appear in a `text-font` value. Anything in an
 * operator position that is NOT here is treated as a font name — so an unknown
 * operator produces a false positive and fails the allowlist test loudly, rather
 * than a false negative that ships blank boxes to someone standing in a field.
 * Fail-closed is the whole point of this function.
 */
const TEXT_FONT_OPERATORS = new Set([
  'literal', 'case', 'match', 'step', 'interpolate', 'coalesce', 'let', 'var',
  'get', 'has', 'in', 'at', 'length', 'concat', 'to-string', 'zoom',
  '==', '!=', '<', '<=', '>', '>=', '!', 'all', 'any',
]);

export function collectFontstacks(style: StyleSpecification): string[] {
  const found = new Set<string>();
  const collect = (v: unknown): void => {
    if (!Array.isArray(v) || v.length === 0) return;
    const head = v[0];
    // ["literal", ["Noto Sans Medium"]] — the fonts are the second element.
    if (head === 'literal') { collect(v[1]); return; }
    // ["case", <cond>, ["literal", …], …] — recurse past the operator.
    if (typeof head === 'string' && TEXT_FONT_OPERATORS.has(head)) {
      for (let i = 1; i < v.length; i++) collect(v[i]);
      return;
    }
    // A bare stack: ["Noto Sans Regular", "Fallback"].
    for (const el of v) {
      if (typeof el === 'string') found.add(el);
      else collect(el);
    }
  };
  for (const layer of style.layers as unknown as StyleLayer[]) {
    collect(layer.layout?.['text-font']);
  }
  return [...found].sort();
}
