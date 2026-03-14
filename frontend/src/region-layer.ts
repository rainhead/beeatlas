import GeoJSONFormat from 'ol/format/GeoJSON.js';
import { Vector as VectorSource } from 'ol/source.js';
import VectorLayer from 'ol/layer/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import countiesJson from './assets/wa_counties.geojson';
import ecoregionsJson from './assets/epa_l3_ecoregions_wa.geojson';

// Transparent fill is required for OL to fire click events on polygon interiors.
// Without a fill, only the stroke edge is hit-detectable.
// See: STATE.md v1.5 decisions — "v1.5 polygon fill"
export const boundaryStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
  stroke: new Stroke({ color: 'rgba(80, 80, 80, 0.55)', width: 1.5 }),
});

// featureProjection: 'EPSG:3857' is required — GeoJSON is stored in WGS84 lon/lat,
// the OL map uses spherical Mercator (EPSG:3857).
const fmt = new GeoJSONFormat({ featureProjection: 'EPSG:3857' });

// County features have property: NAME (e.g. "Wahkiakum")
// Phase 18 click handler uses feature.get('NAME')
export const countySource = new VectorSource({
  features: fmt.readFeatures(countiesJson),
});

// Ecoregion features have property: NA_L3NAME (e.g. "Thompson-Okanogan Plateau")
// Phase 18 click handler uses feature.get('NA_L3NAME')
export const ecoregionSource = new VectorSource({
  features: fmt.readFeatures(ecoregionsJson),
});

// Starts invisible; Phase 18 wires the boundary toggle via:
//   regionLayer.setVisible(true/false)
//   regionLayer.setSource(countySource | ecoregionSource)
export const regionLayer = new VectorLayer({
  source: countySource,
  style: boundaryStyle,
  visible: false,
});
