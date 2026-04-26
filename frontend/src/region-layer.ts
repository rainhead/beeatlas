import GeoJSONFormat from 'ol/format/GeoJSON.js';
import { Vector as VectorSource } from 'ol/source.js';
import VectorLayer from 'ol/layer/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { FeatureLike } from 'ol/Feature.js';
import { get as getProjection } from 'ol/proj.js';
import type { FilterState } from './filter.ts';

const DATA_BASE_URL = (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? 'https://beeatlas.net/data';

// Transparent fill is required for OL to fire click events on polygon interiors.
// Without a fill, only the stroke edge is hit-detectable.
// See: STATE.md v1.5 decisions — "v1.5 polygon fill"
export const boundaryStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
  stroke: new Stroke({ color: 'rgba(80, 80, 80, 0.55)', width: 1.5 }),
});

// Selected style — subtle blue fill + brighter blue stroke for highlighted polygons.
export const selectedBoundaryStyle = new Style({
  fill: new Fill({ color: 'rgba(44, 123, 229, 0.12)' }),
  stroke: new Stroke({ color: 'rgba(44, 123, 229, 0.85)', width: 2.5 }),
});

// Style function factory that highlights selected polygons based on filterState.
// getBoundaryMode and getFilterState are getters so the function always reads current state.
export function makeRegionStyleFn(
  getBoundaryMode: () => 'off' | 'counties' | 'ecoregions',
  getFilterState: () => FilterState,
): (feature: FeatureLike) => Style {
  return (feature: FeatureLike): Style => {
    const mode = getBoundaryMode();
    const fState = getFilterState();
    const name = mode === 'counties'
      ? (feature.get('NAME') as string | undefined)
      : (feature.get('NA_L3NAME') as string | undefined);
    if (!name) return boundaryStyle;
    const isSelected = mode === 'counties'
      ? fState.selectedCounties.has(name)
      : fState.selectedEcoregions.has(name);
    return isSelected ? selectedBoundaryStyle : boundaryStyle;
  };
}

// County features have property: NAME (e.g. "Wahkiakum")
// Phase 18 click handler uses feature.get('NAME')
export const countySource = new VectorSource({
  url: `${DATA_BASE_URL}/counties.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});

// Ecoregion features have property: NA_L3NAME (e.g. "Thompson-Okanogan Plateau")
// Phase 18 click handler uses feature.get('NA_L3NAME')
export const ecoregionSource = new VectorSource({
  url: `${DATA_BASE_URL}/ecoregions.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});

// Defer GeoJSON loading so it doesn't compete with the parquet file on the
// critical path. Call loadBoundaries() after occurrences are loaded.
const _proj3857 = getProjection('EPSG:3857')!;
const _worldExtent = _proj3857.getExtent()!;

export function loadBoundaries(): void {
  countySource.loadFeatures(_worldExtent, 1, _proj3857);
  ecoregionSource.loadFeatures(_worldExtent, 1, _proj3857);
}

// Starts invisible; Phase 18 wires the boundary toggle via:
//   regionLayer.setVisible(true/false)
//   regionLayer.setSource(countySource | ecoregionSource)
export const regionLayer = new VectorLayer({
  source: countySource,
  style: boundaryStyle,
  visible: false,
});
