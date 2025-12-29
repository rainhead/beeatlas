import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, query } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat } from "ol/proj.js";
import { ParquetSource } from "./parquet.ts";
import labelsParquet from './assets/labels-2025.parquet?url';
import VectorLayer from "ol/layer/Vector.js";
import { apply as applyOLMS } from 'ol-mapbox-style';
import LayerGroup from "ol/layer/Group.js";
import { beeStyle } from "./style.ts";

const sphericalMercator = 'EPSG:3857';

// const gbifSource = new ParquetSource({url: gbifParquet});
// const gbifLayer = new VectorLayer({
//   source: new Cluster({
//     source: gbifSource,
//   }),
//   style: clusterStyle,
// });


const labelSource = new ParquetSource({url: labelsParquet});
const labelLayer = new VectorLayer({
  source: labelSource,
  style: beeStyle,
});

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement

  map?: OpenLayersMap

  static styles = css`
:host {
  align-items: stretch;
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: auto;
}
#map {
  flex-grow: 1
}
  `

  public render() {
    return html`
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.7.0/ol.css" type="text/css" />
      <div id="map"></div>
    `
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    const baseLayer = new LayerGroup();
    this.map = new OpenLayersMap({
      layers: [
        baseLayer,
        labelLayer,
        // gbifLayer,
      ],
      target: this.mapElement,
      view: new View({
        center: fromLonLat([-120.32, 47.47]),
        projection: sphericalMercator,
        zoom: document.documentElement.clientWidth < 500 ? 6 : 8,
      }),
    });
    applyOLMS(
      baseLayer,
      'https://api.maptiler.com/maps/019b6b78-8177-7c7b-9fab-286913b8bb79/style.json?key=xEe29svIcKOIwTnQqmLn',
      // {webfonts: 'https://fonts.googleapis.com/css?family={Font+Family}:{fontweight}{fontstyle}'}
    );
  }
}
