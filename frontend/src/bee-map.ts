import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { OccurrenceSource } from "./features.ts";
import VectorLayer from "ol/layer/Vector.js";
import LayerGroup from "ol/layer/Group.js";
import Cluster from "ol/source/Cluster.js";
import { makeClusterStyleFn } from "./style.ts";
import TileLayer from "ol/layer/Tile.js";
import StadiaMaps from "ol/source/StadiaMaps.js";
import Feature from "ol/Feature.js";
import Point from 'ol/geom/Point.js';
import type MapBrowserEvent from "ol/MapBrowserEvent.js";
import { type FilterState, OCCURRENCE_COLUMNS, type OccurrenceRow } from './filter.ts';
import { regionLayer, countySource, ecoregionSource, makeRegionStyleFn } from './region-layer.ts';
import type { DataSummary, TaxonOption, FilteredSummary } from './bee-sidebar.ts';

const sphericalMercator = 'EPSG:3857';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;


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

function clusterCentroid(features: Feature[]): { lon: number; lat: number } {
  let sumLon = 0, sumLat = 0;
  for (const f of features) {
    const [lon, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
    sumLon += lon!;
    sumLat += lat!;
  }
  return { lon: sumLon / features.length, lat: sumLat / features.length };
}

function haversineMetres(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function maxRadiusMetres(features: Feature[], centroid: { lon: number; lat: number }): number {
  let max = 0;
  for (const f of features) {
    const [lon, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
    const d = haversineMetres(centroid.lon, centroid.lat, lon!, lat!);
    if (d > max) max = d;
  }
  return max;
}

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

  map?: OpenLayersMap;

  // --- @property inputs from bee-atlas ---
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) visibleIds: Set<string> | null = null;
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
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
  };

  @state() private _regionMenuOpen = false;

  // Instance OL sources/layers (moved from module-level per Phase 34-02 decision)
  private occurrenceSource!: OccurrenceSource;
  private clusterSource!: Cluster;
  private occurrenceLayer!: VectorLayer;
  // speicmenLayer typo is intentionally deferred — do not fix incidentally
  // @ts-ignore -- intentionally unused until specimen layer is implemented
  private speicmenLayer: VectorLayer | undefined;

  static styles = css`
:host {
  display: flex;
  flex-grow: 1;
  position: relative;
}
#map {
  flex-grow: 1;
}
.region-control {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 2;
}
.region-btn {
  background: white;
  border: 1px solid rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.region-btn:hover { background: #f0f0f0; }
.region-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.3rem;
  background: white;
  border: 1px solid rgba(0,0,0,0.2);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  min-width: 10rem;
  overflow: hidden;
}
.region-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}
.region-menu button:hover { background: #f0f0f0; }
.region-menu button.active { font-weight: 600; color: var(--accent, #2c7be5); }
  `;

  private _emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true, composed: true, detail,
    }));
  }

  render() {
    const label = this.boundaryMode === 'off' ? 'Regions'
      : this.boundaryMode === 'counties' ? 'Counties'
      : 'Ecoregions';
    return html`
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
      <div id="map"></div>
      <div class="region-control">
        ${this._regionMenuOpen ? html`
          <div class="region-menu">
            <button class=${this.boundaryMode === 'off' ? 'active' : ''} @click=${() => this._selectBoundary('off')}>Off</button>
            <button class=${this.boundaryMode === 'counties' ? 'active' : ''} @click=${() => this._selectBoundary('counties')}>Counties</button>
            <button class=${this.boundaryMode === 'ecoregions' ? 'active' : ''} @click=${() => this._selectBoundary('ecoregions')}>Ecoregions</button>
          </div>
        ` : ''}
        <button class="region-btn" @click=${this._toggleRegionMenu}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="6" height="6" rx="1"/>
            <rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/>
            <rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
          ${label}
        </button>
      </div>
    `;
  }

  private _onDocumentClick = (e: MouseEvent) => {
    if (this._regionMenuOpen && !e.composedPath().includes(this)) {
      this._regionMenuOpen = false;
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocumentClick);
  }

  private _toggleRegionMenu() {
    this._regionMenuOpen = !this._regionMenuOpen;
  }

  private _selectBoundary(mode: 'off' | 'counties' | 'ecoregions') {
    this._regionMenuOpen = false;
    if (mode === this.boundaryMode) return;
    this._emit<'off' | 'counties' | 'ecoregions'>('boundary-mode-changed', mode);
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // Repaint OL when visible ID set changes
    if (changedProperties.has('visibleIds')) {
      this.clusterSource?.changed();
      this.map?.render();
      // Compute and emit filtered summary
      this._emitFilteredSummary();
    }

    // Repaint clusters when selection changes (for highlight ring)
    if (changedProperties.has('selectedOccIds')) {
      this.clusterSource?.changed();
      this.map?.render();
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
    if (this.visibleIds !== null && this.occurrenceSource) {
      const allFeatures = this.occurrenceSource.getFeatures().filter(
        f => String(f.getId()).startsWith('ecdysis:')
      );
      const matching = allFeatures.filter(f => this.visibleIds!.has(f.getId() as string));
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

  public firstUpdated(_changedProperties: PropertyValues): void {
    // Create instance-level OL sources and layers using factory style functions
    this.occurrenceSource = new OccurrenceSource({
      onError: (err) => this._emit('data-error', { message: err.message }),
    });
    this.clusterSource = new Cluster({
      distance: 20,    // D-02: tighter clusters (was 40)
      minDistance: 5,
      source: this.occurrenceSource,
    });
    this.occurrenceLayer = new VectorLayer({
      source: this.clusterSource,
      style: makeClusterStyleFn(() => this.visibleIds, () => this.selectedOccIds),
    });

    // Create OL map
    this.map = new OpenLayersMap({
      layers: [
        new TileLayer({
          source: new StadiaMaps({
            layer: 'outdoors',
            retina: true,
          }),
        }),
        new LayerGroup(),
        this.occurrenceLayer,
        regionLayer,   // added last — renders boundary strokes above data dots
      ],
      target: this.mapElement,
      view: new View({
        center: fromLonLat([this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT]),
        projection: sphericalMercator,
        zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
      }),
    });

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

    // occurrenceSource: emit data-loaded when features arrive (consolidated event)
    this.occurrenceSource.once('change', () => {
      const features = this.occurrenceSource.getFeatures();
      if (features.length === 0) return;
      const specimenFeatures = features.filter(f => String(f.getId()).startsWith('ecdysis:'));
      this._emit('data-loaded', {
        summary: computeSummary(specimenFeatures),
        taxaOptions: buildTaxaOptions(specimenFeatures),
      });
    });

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

    // Close region menu when clicking outside this component
    document.addEventListener('click', this._onDocumentClick);

    // moveend: emit view-moved event
    this.map.on('moveend', () => {
      const center = toLonLat(this.map!.getView().getCenter()!);
      const zoom = this.map!.getView().getZoom()!;
      this._emit('view-moved', { lon: center[0]!, lat: center[1]!, zoom });
    });

    // click handler: unified for all occurrences
    this.map.on('click', async (event: MapBrowserEvent) => {
      if (event.dragging) return;

      const hits = await this.occurrenceLayer.getFeatures(event.pixel);
      if (hits.length) {
        const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
        const toShow = this.visibleIds !== null
          ? inner.filter(f => this.visibleIds!.has(f.getId() as string))
          : inner;
        if (toShow.length === 0) return;

        const occIds = toShow.map(f => f.getId() as string);

        const occurrences: OccurrenceRow[] = toShow.map(f => {
          const obj: Record<string, unknown> = {};
          for (const col of OCCURRENCE_COLUMNS) obj[col] = f.get(col);
          return obj as unknown as OccurrenceRow;
        });

        if (toShow.length === 1) {
          // Single feature click — D-05: emit ID directly
          this._emit('map-click-occurrence', {
            occurrences,
            occIds,
          });
        } else {
          // Multi-feature cluster click — D-06: compute centroid + radiusM
          const centroid = clusterCentroid(toShow);
          const radiusM = maxRadiusMetres(toShow, centroid);
          this._emit('map-click-occurrence', {
            occurrences,
            occIds,
            centroid,
            radiusM,
          });
        }
        return;
      }

      // No occurrence hit — check boundary overlay if active
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
        this._emit('map-click-empty');
        return;
      }
      this._emit('map-click-empty');
    });
  }
}
