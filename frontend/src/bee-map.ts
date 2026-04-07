import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { EcdysisSource } from "./features.ts";
import VectorLayer from "ol/layer/Vector.js";
import LayerGroup from "ol/layer/Group.js";
import Cluster from "ol/source/Cluster.js";
import { makeClusterStyleFn, makeSampleDotStyleFn } from "./style.ts";
import { SampleSource } from './features.ts';
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import Feature from "ol/Feature.js";
import Point from 'ol/geom/Point.js';
import type MapBrowserEvent from "ol/MapBrowserEvent.js";
import type { FilterState } from './filter.ts';
import { regionLayer, countySource, ecoregionSource, makeRegionStyleFn } from './region-layer.ts';
import type { Sample, DataSummary, TaxonOption, FilteredSummary, SampleEvent } from './bee-sidebar.ts';

const sphericalMercator = 'EPSG:3857';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;


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
    const inatId = f.get('inat_observation_id') as number | null ?? null;
    const floralHost = (f.get('floralHost') as string | null | undefined) ?? null;
    const inatHost = (f.get('inat_host') as string | null | undefined) ?? null;
    const inatQualityGrade = (f.get('inat_quality_grade') as string | null | undefined) ?? null;
    map.get(key)!.species.push({ name: f.get('scientificName') as string, occid, inatObservationId: inatId, floralHost, inatHost, inatQualityGrade });
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

function buildTaxaOptions(features: Feature[]): TaxonOption[] {
  const families = new Set<string>();
  const genera = new Set<string>();
  const species = new Set<string>();
  for (const f of features) {
    const fam = f.get('family') as string | null;
    const gen = f.get('genus') as string | null;
    const sp  = f.get('scientificName') as string | null;
    if (fam) families.add(fam);
    if (gen) genera.add(gen);
    if (sp) species.add(sp);
  }
  return [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
    ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
  ];
}

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

  map?: OpenLayersMap;

  // --- @property inputs from bee-atlas ---
  @property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) visibleEcdysisIds: Set<string> | null = null;
  @property({ attribute: false }) visibleSampleIds: Set<string> | null = null;
  @property({ attribute: false }) selectedOccIds: Set<string> | null = null;
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) viewState: { lon: number; lat: number; zoom: number } | null = null;
  @property({ attribute: false }) panTo: { coordinate: number[]; zoom: number } | null = null;
  @property({ attribute: false }) filterState: FilterState = {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
  };

  // Instance OL sources/layers (moved from module-level per Phase 34-02 decision)
  private specimenSource!: EcdysisSource;
  private clusterSource!: Cluster;
  private specimenLayer!: VectorLayer;
  private sampleSource!: SampleSource;
  private sampleLayer!: VectorLayer;

  static styles = css`
:host {
  display: flex;
  flex-grow: 1;
}
#map {
  flex-grow: 1;
}
  `;

  private _emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true, composed: true, detail,
    }));
  }

  render() {
    return html`
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
      <div id="map"></div>
    `;
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // Repaint OL when visible ID sets change
    if (changedProperties.has('visibleEcdysisIds') || changedProperties.has('visibleSampleIds')) {
      this.clusterSource?.changed();
      this.sampleSource?.changed();
      this.map?.render();
      // Compute and emit filtered summary
      this._emitFilteredSummary();
    }

    // Repaint clusters when selection changes (for highlight ring)
    if (changedProperties.has('selectedOccIds')) {
      this.clusterSource?.changed();
      this.map?.render();
    }

    // Layer visibility
    if (changedProperties.has('layerMode')) {
      this.specimenLayer?.setVisible(this.layerMode === 'specimens');
      this.sampleLayer?.setVisible(this.layerMode === 'samples');
    }

    // Boundary mode and filter state changes (both affect region layer styling)
    if (changedProperties.has('boundaryMode') || changedProperties.has('filterState')) {
      if (this.boundaryMode === 'off') {
        regionLayer.setVisible(false);
      } else if (this.boundaryMode === 'counties') {
        regionLayer.setSource(countySource);
        regionLayer.setVisible(true);
      } else {
        regionLayer.setSource(ecoregionSource);
        regionLayer.setVisible(true);
      }
      regionLayer.changed();
    }

    // View state restore (from popstate)
    if (changedProperties.has('viewState') && this.viewState && this.map) {
      this.map.getView().setCenter(fromLonLat([this.viewState.lon, this.viewState.lat]));
      this.map.getView().setZoom(this.viewState.zoom);
    }

    // Pan-to animation (from sample-event-click)
    if (changedProperties.has('panTo') && this.panTo && this.map) {
      this.map.getView().animate({
        center: this.panTo.coordinate,
        zoom: this.panTo.zoom,
        duration: 300,
      });
    }
  }

  private _emitFilteredSummary() {
    if (this.visibleEcdysisIds !== null && this.specimenSource) {
      const allFeatures = this.specimenSource.getFeatures();
      const matching = allFeatures.filter(f => this.visibleEcdysisIds!.has(f.getId() as string));
      const fSummary = computeSummary(matching);
      const totalSummary = allFeatures.length > 0 ? computeSummary(allFeatures) : null;
      this._emit<{ filteredSummary: FilteredSummary | null }>('filtered-summary-computed', {
        filteredSummary: totalSummary ? {
          filteredSpecimens: fSummary.totalSpecimens,
          filteredSpeciesCount: fSummary.speciesCount,
          filteredGenusCount: fSummary.genusCount,
          filteredFamilyCount: fSummary.familyCount,
          total: totalSummary,
          isActive: true,
        } : null,
      });
    } else {
      this._emit<{ filteredSummary: FilteredSummary | null }>('filtered-summary-computed', { filteredSummary: null });
    }
  }

  private _buildRecentSampleEvents(): SampleEvent[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return this.sampleSource.getFeatures()
      .filter(f => new Date(f.get('date') as string) >= cutoff)
      .sort((a, b) =>
        new Date(b.get('date') as string).valueOf() -
        new Date(a.get('date') as string).valueOf()
      )
      .map(f => {
        const rawDate = f.get('date');
        const date = rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate).slice(0, 10);
        return {
          observation_id: f.get('observation_id') as number,
          observer: f.get('observer') as string,
          date,
          specimen_count: f.get('specimen_count') as number,
          sample_id: f.get('sample_id') as number | null,
          coordinate: (f.getGeometry() as Point).getCoordinates(),
        };
      });
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    // Create instance-level OL sources and layers using factory style functions
    this.specimenSource = new EcdysisSource({
      onError: (err) => this._emit('data-error', { message: err.message }),
    });
    this.clusterSource = new Cluster({
      distance: 40,
      minDistance: 0,
      source: this.specimenSource,
    });
    this.specimenLayer = new VectorLayer({
      source: this.clusterSource,
      style: makeClusterStyleFn(() => this.visibleEcdysisIds, () => this.selectedOccIds),
    });
    this.sampleSource = new SampleSource({
      onError: (err) => this._emit('data-error', { message: err.message }),
    });
    this.sampleLayer = new VectorLayer({
      source: this.sampleSource,
      style: makeSampleDotStyleFn(() => this.visibleSampleIds),
    });

    // Create OL map
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
        new LayerGroup(),
        this.specimenLayer,
        this.sampleLayer,
        regionLayer,   // added last — renders boundary strokes above data dots
      ],
      target: this.mapElement,
      view: new View({
        center: fromLonLat([this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT]),
        projection: sphericalMercator,
        zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
      }),
    });

    // sampleLayer starts hidden
    this.sampleLayer.setVisible(false);
    // Apply layerMode if initially not specimens
    if (this.layerMode === 'samples') {
      this.specimenLayer.setVisible(false);
      this.sampleLayer.setVisible(true);
    }

    // Set dynamic style function so selected polygons are highlighted
    regionLayer.setStyle(makeRegionStyleFn(
      () => this.boundaryMode,
      () => this.filterState,
    ));

    // Apply initial boundary mode
    if (this.boundaryMode !== 'off') {
      regionLayer.setSource(this.boundaryMode === 'counties' ? countySource : ecoregionSource);
      regionLayer.setVisible(true);
    }

    // specimenSource: emit data-loaded when features arrive
    this.specimenSource.once('change', () => {
      const features = this.specimenSource.getFeatures();
      if (features.length > 0) {
        this._emit('data-loaded', {
          summary: computeSummary(features),
          taxaOptions: buildTaxaOptions(features),
        });
      }
    });

    // sampleSource: emit sample-data-loaded when features arrive
    const onSampleLoaded = () => {
      if (this.sampleSource.getFeatures().length === 0) return;
      this.sampleSource.un('change', onSampleLoaded);
      this._emit('sample-data-loaded', {
        recentEvents: this._buildRecentSampleEvents(),
      });
    };
    this.sampleSource.on('change', onSampleLoaded);

    // County/ecoregion options — emit when sources load
    countySource.once('change', () => {
      this._emit('county-options-loaded', {
        options: [...new Set(countySource.getFeatures().map(f => f.get('NAME') as string))].sort(),
      });
    });
    ecoregionSource.once('change', () => {
      this._emit('ecoregion-options-loaded', {
        options: [...new Set(ecoregionSource.getFeatures().map(f => f.get('NA_L3NAME') as string))].sort(),
      });
    });

    // moveend: emit view-moved event
    this.map.on('moveend', () => {
      const center = toLonLat(this.map!.getView().getCenter()!);
      const zoom = this.map!.getView().getZoom()!;
      this._emit('view-moved', { lon: center[0]!, lat: center[1]!, zoom });
    });

    // click handler: mode-gated for specimen vs sample layer
    this.map.on('click', async (event: MapBrowserEvent) => {
      if (event.dragging) return;
      if (this.layerMode === 'specimens') {
        const hits = await this.specimenLayer.getFeatures(event.pixel);
        if (hits.length) {
          const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
          const toShow = this.visibleEcdysisIds !== null
            ? inner.filter(f => this.visibleEcdysisIds!.has(f.getId() as string))
            : inner;
          if (toShow.length === 0) return;
          this._emit('map-click-specimen', {
            samples: buildSamples(toShow),
            occIds: toShow.map(f => f.getId() as string),
          });
          return;
        }
        // No specimen hit — check boundary overlay if active
        if (this.boundaryMode !== 'off') {
          const polyHits = await regionLayer.getFeatures(event.pixel);
          if (polyHits.length) {
            const feature = polyHits[0]! as Feature;
            const isCounty = this.boundaryMode === 'counties';
            this._emit('map-click-region', {
              name: isCounty ? (feature.get('NAME') as string) : (feature.get('NA_L3NAME') as string),
              shiftKey: (event.originalEvent as MouseEvent).shiftKey,
            });
            return;
          }
          // Miss on open map area — emit map-click-empty
          this._emit('map-click-empty');
          return;
        }
        // No boundary overlay active — emit map-click-empty
        this._emit('map-click-empty');
      } else {
        const hits = await this.sampleLayer.getFeatures(event.pixel);
        if (hits.length) {
          const f = hits[0]!;
          this._emit('map-click-sample', {
            observation_id: f.get('observation_id') as number,
            observer: f.get('observer') as string,
            date: f.get('date') as string,
            specimen_count: f.get('specimen_count') as number,
            sample_id: f.get('sample_id') as number | null,
            coordinate: (f.getGeometry() as Point).getCoordinates(),
          });
          return;
        }
        // No sample hit — check boundary overlay if active
        if (this.boundaryMode !== 'off') {
          const polyHits = await regionLayer.getFeatures(event.pixel);
          if (polyHits.length) {
            const feature = polyHits[0]! as Feature;
            const isCounty = this.boundaryMode === 'counties';
            this._emit('map-click-region', {
              name: isCounty ? (feature.get('NAME') as string) : (feature.get('NA_L3NAME') as string),
              shiftKey: (event.originalEvent as MouseEvent).shiftKey,
            });
            return;
          }
          // Miss on open map area — emit map-click-empty
          this._emit('map-click-empty');
          return;
        }
        // No boundary overlay active — emit map-click-empty
        this._emit('map-click-empty');
      }
    });
  }
}
