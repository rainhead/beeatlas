import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat } from "ol/proj.js";
import { ParquetSource } from "./parquet.ts";
import ecdysisDump from './assets/ecdysis.parquet?url';
import VectorLayer from "ol/layer/Vector.js";
import LayerGroup from "ol/layer/Group.js";
import Cluster from "ol/source/Cluster.js";
import { clusterStyle } from "./style.ts";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import Feature from "ol/Feature.js";
import type MapBrowserEvent from "ol/MapBrowserEvent.js";
import './bee-sidebar.ts';
import type { Sample, DataSummary } from './bee-sidebar.ts';

const sphericalMercator = 'EPSG:3857';

function buildSamples(features: Feature[]): Sample[] {
  const map = new Map<string, Sample>();
  for (const f of features) {
    const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
    if (!map.has(key)) {
      map.set(key, {
        year: f.get('year') as number,
        month: f.get('month') as number,
        recordedBy: f.get('recordedBy') as string,
        fieldNumber: f.get('fieldNumber') as string,
        species: [],
      });
    }
    const occid = (f.getId() as string).replace('ecdysis:', '');
    map.get(key)!.species.push({ name: f.get('scientificName') as string, occid });
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

function computeSummary(features: Feature[]): DataSummary {
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let min = Infinity, max = -Infinity;
  for (const f of features) {
    const s = f.get('scientificName') as string;
    const g = f.get('genus') as string;
    const fam = f.get('family') as string;
    if (s) species.add(s);
    if (g) genera.add(g);
    if (fam) families.add(fam);
    const y = f.get('year') as number;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return {
    totalSpecimens: features.length,
    speciesCount: species.size,
    genusCount: genera.size,
    familyCount: families.size,
    earliestYear: min === Infinity ? 0 : min,
    latestYear: max === -Infinity ? 0 : max,
  };
}

const specimenSource = new ParquetSource({url: ecdysisDump});
const clusterSource = new Cluster({
  distance: 40,
  minDistance: 0,
  source: specimenSource,
});
const speicmenLayer = new VectorLayer({
  source: clusterSource,
  style: clusterStyle,
});

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement

  map?: OpenLayersMap

  @state()
  private selectedSamples: Sample[] | null = null;

  @state()
  private summary: DataSummary | null = null;

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
bee-sidebar {
  width: 25rem;
  border-left: 1px solid #cccccc;
  overflow-y: auto;
}
@media (max-aspect-ratio: 1) {
  :host {
    flex-direction: column;
  }
  #map {
    height: 50svh;
    flex-grow: 0;
    flex-shrink: 0;
  }
  bee-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid #cccccc;
    flex-grow: 1;
  }
}
  `

  public render() {
    return html`
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
      <div id="map"></div>
      <bee-sidebar
        .samples=${this.selectedSamples}
        .summary=${this.summary}
        @close=${() => { this.selectedSamples = null; }}
      ></bee-sidebar>
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

    specimenSource.once('change', () => {
      const features = specimenSource.getFeatures();
      if (features.length > 0) {
        this.summary = computeSummary(features);
      }
    });

    this.map.on('singleclick', async (event: MapBrowserEvent) => {
      const hits = await speicmenLayer.getFeatures(event.pixel);
      if (!hits.length) {
        this.selectedSamples = null;
        return;
      }
      const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
      this.selectedSamples = buildSamples(inner);
    });
  }
}
