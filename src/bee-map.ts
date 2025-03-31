import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, query } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat } from "ol/proj.js";
import { apply as applyOLMS } from 'ol-mapbox-style';
import { makeParquetLayer } from "./parquet.ts";
import gbifParquet from './assets/gbif.parquet?url';

const sphericalMercator = 'EPSG:3857';

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
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.4.0/ol.css" type="text/css" />
      <div id="map"></div>
    `
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    this.map = new OpenLayersMap({
      target: this.mapElement,
      view: new View({
        center: fromLonLat([-120.32, 47.47]),
        projection: sphericalMercator,
        zoom: document.documentElement.clientWidth < 500 ? 6 : 8,
      }),
    });
    makeParquetLayer(gbifParquet).then(layer => this.map!.addLayer(layer))
    applyOLMS(this.map, 'https://api.maptiler.com/maps/landscape/style.json?key=xEe29svIcKOIwTnQqmLn');
  }
}
