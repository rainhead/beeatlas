import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { FeatureLike } from 'ol/Feature.js';

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
// getBoundaryMode and getFilterState are getters so the function always reads current values.
export function makeRegionStyleFn(
  getBoundaryMode: () => 'off' | 'counties' | 'ecoregions',
  getFilterState: () => { selectedCounties: Set<string>; selectedEcoregions: Set<string> }
): (feature: FeatureLike) => Style {
  return (feature: FeatureLike): Style => {
    const mode = getBoundaryMode();
    const fs = getFilterState();
    const name = mode === 'counties'
      ? (feature.get('NAME') as string | undefined)
      : (feature.get('NA_L3NAME') as string | undefined);
    if (!name) return boundaryStyle;
    const isSelected = mode === 'counties'
      ? fs.selectedCounties.has(name)
      : fs.selectedEcoregions.has(name);
    return isSelected ? selectedBoundaryStyle : boundaryStyle;
  };
}
