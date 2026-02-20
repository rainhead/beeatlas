import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, query } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat } from "ol/proj.js";
import { ParquetSource } from "./parquet.ts";
import ecdysisDump from './assets/ecdysis.parquet?url';
import VectorLayer from "ol/layer/Vector.js";
import LayerGroup from "ol/layer/Group.js";
import { beeStyle } from "./style.ts";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";

const sphericalMercator = 'EPSG:3857';




const specimenSource = new ParquetSource({url: ecdysisDump});
const speicmenLayer = new VectorLayer({
  source: specimenSource,
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
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
      <div id="map"></div>
    `
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    const baseLayer = new LayerGroup();
    this.map = new OpenLayersMap({
      layers: [
        new TileLayer({
          source: new XYZ({
            attributions: 'Base map by Esri and its data providers',
            urls: [
              'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
              'https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
            ]
          }),
        }),
        new TileLayer({
          source: new XYZ({
            // NB: this source is unmaintained
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
          }),
        }),
        baseLayer,
        speicmenLayer,
      ],
      target: this.mapElement,
      view: new View({
        center: fromLonLat([-120.32, 47.47]),
        projection: sphericalMercator,
        zoom: document.documentElement.clientWidth < 500 ? 6 : 8,
      }),
    });
  }
}
