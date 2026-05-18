import { css, html, LitElement, unsafeCSS, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import mapboxgl from 'mapbox-gl';
import mapboxCssText from 'mapbox-gl/dist/mapbox-gl.css?raw';
import { loadOccurrenceGeoJSON, type OccurrenceProperties } from './features.ts';
import { RECENCY_COLORS } from './style.ts';
import { type FilterState, OCCURRENCE_COLUMNS, type OccurrenceRow } from './filter.ts';
import type { FeatureCollection, Point } from 'geojson';
import type { DataSummary, FilteredSummary } from './bee-sidebar.ts';
import { resolveDataUrl } from './manifest.ts';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

function featureToOccurrenceRow(feature: GeoJSON.Feature): OccurrenceRow {
  const props = feature.properties ?? {};
  const row: Record<string, unknown> = {};
  for (const col of OCCURRENCE_COLUMNS) {
    row[col] = props[col] ?? null;
  }
  return row as unknown as OccurrenceRow;
}

function haversineMetres(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

  // --- @property inputs from bee-atlas ---
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
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
    selectedPlace: null,
  };

  @state() private _regionMenuOpen = false;

  // Mapbox GL JS map instance
  private _map: mapboxgl.Map | null = null;

  // Full unfiltered GeoJSON for setData-based filtering
  private _fullGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;

  // speicmenLayer typo is intentionally deferred -- do not fix incidentally
  // @ts-ignore -- intentionally unused until specimen layer is implemented
  private speicmenLayer: unknown;

  private _resizeObserver: ResizeObserver | null = null;

  private _countyIdMap: Map<number, string> = new Map();
  private _ecoregionIdMap: Map<number, string> = new Map();
  private _placeIdMap: Map<number, string> = new Map();
  private _clickConsumed = false;

  // Cluster selection halo (HALO-01): race guard + rAF coalescing.
  // Recomputed on selection change, moveend, and occurrences sourcedata.
  // Stale getClusterLeaves callbacks are discarded by comparing generation.
  private _haloGeneration = 0;
  private _haloRafToken: number | null = null;

  // Shift-drag rectangle gesture (SEL-01, SEL-02)
  private _rectStart: mapboxgl.Point | null = null;
  private _rectBox: HTMLDivElement | null = null;

  static _mapboxCss = unsafeCSS(mapboxCssText);

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
.selection-box {
  background: rgba(56, 135, 190, 0.1);
  border: 2px solid #3887be;
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
  `;

  private _emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true, composed: true, detail,
    }));
  }

  render() {
    const label = this.boundaryMode === 'off' ? 'Regions'
      : this.boundaryMode === 'counties' ? 'Counties'
      : this.boundaryMode === 'ecoregions' ? 'Ecoregions'
      : 'Places';
    return html`
      <style>${BeeMap._mapboxCss}</style>
      <div id="map"></div>
      <div class="region-control">
        ${this._regionMenuOpen ? html`
          <div class="region-menu">
            <button class=${this.boundaryMode === 'off' ? 'active' : ''} @click=${() => this._selectBoundary('off')}>Off</button>
            <button class=${this.boundaryMode === 'counties' ? 'active' : ''} @click=${() => this._selectBoundary('counties')}>Counties</button>
            <button class=${this.boundaryMode === 'ecoregions' ? 'active' : ''} @click=${() => this._selectBoundary('ecoregions')}>Ecoregions</button>
            <button class=${this.boundaryMode === 'places' ? 'active' : ''} @click=${() => this._selectBoundary('places')}>Places</button>
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

  // --- Shift-drag rectangle gesture handlers (SEL-01, SEL-02) ---

  private _onRectMouseDown = (e: MouseEvent) => {
    if (!(e.shiftKey && e.button === 0)) return;
    this._clickConsumed = true;
    this._map!.dragPan.disable();
    this._map!.getCanvasContainer().style.cursor = 'crosshair';
    document.addEventListener('mousemove', this._onRectMouseMove);
    document.addEventListener('mouseup', this._onRectMouseUp);
    this._rectStart = this._mousePos(e);
  };

  private _onRectMouseMove = (e: MouseEvent) => {
    if (!this._rectStart) return;
    const current = this._mousePos(e);
    if (!this._rectBox) {
      this._rectBox = document.createElement('div');
      this._rectBox.className = 'selection-box';
      this._map!.getCanvasContainer().appendChild(this._rectBox);
    }
    const minX = Math.min(this._rectStart.x, current.x);
    const maxX = Math.max(this._rectStart.x, current.x);
    const minY = Math.min(this._rectStart.y, current.y);
    const maxY = Math.max(this._rectStart.y, current.y);
    this._rectBox.style.transform = `translate(${minX}px, ${minY}px)`;
    this._rectBox.style.width = `${maxX - minX}px`;
    this._rectBox.style.height = `${maxY - minY}px`;
  };

  private _onRectMouseUp = (e: MouseEvent) => {
    this._rectFinish(e);
  };

  private _rectFinish(e: MouseEvent) {
    document.removeEventListener('mousemove', this._onRectMouseMove);
    document.removeEventListener('mouseup', this._onRectMouseUp);
    if (this._rectBox) {
      this._rectBox.remove();
      this._rectBox = null;
    }
    this._map!.dragPan.enable();
    this._map!.getCanvasContainer().style.cursor = '';

    if (!this._rectStart) return;
    const end = this._mousePos(e);
    const dx = Math.abs(end.x - this._rectStart.x);
    const dy = Math.abs(end.y - this._rectStart.y);
    if (dx < 5 && dy < 5) {
      this._rectStart = null;
      return; // accidental click — no emission
    }

    const minX = Math.min(this._rectStart.x, end.x);
    const maxX = Math.max(this._rectStart.x, end.x);
    const minY = Math.min(this._rectStart.y, end.y);
    const maxY = Math.max(this._rectStart.y, end.y);

    // Y-axis inversion: SW = (minX, maxY), NE = (maxX, minY)
    const sw = this._map!.unproject([minX, maxY]);
    const ne = this._map!.unproject([maxX, minY]);
    this._emit('selection-drawn', {
      west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat,
    });
    this._rectStart = null;
  }

  private _mousePos(e: MouseEvent): mapboxgl.Point {
    const canvas = this._map!.getCanvasContainer();
    const rect = canvas.getBoundingClientRect();
    const scaling = canvas.offsetWidth === rect.width ? 1 : canvas.offsetWidth / rect.width;
    return new mapboxgl.Point(
      (e.clientX - rect.left) * scaling,
      (e.clientY - rect.top) * scaling,
    );
  }

  disconnectedCallback() {
    if (this._haloRafToken !== null) {
      cancelAnimationFrame(this._haloRafToken);
      this._haloRafToken = null;
    }
    // Clean up any in-progress rectangle gesture
    if (this._rectBox) {
      this._rectBox.remove();
      this._rectBox = null;
    }
    if (this._rectStart) {
      this._map?.dragPan.enable();
      this._rectStart = null;
    }
    const canvas = this._map?.getCanvasContainer();
    canvas?.removeEventListener('mousedown', this._onRectMouseDown, true);
    document.removeEventListener('mousemove', this._onRectMouseMove);
    document.removeEventListener('mouseup', this._onRectMouseUp);
    this._map?.remove();
    this._resizeObserver?.disconnect();
    document.removeEventListener('click', this._onDocumentClick);
    super.disconnectedCallback();
  }

  private _toggleRegionMenu() {
    this._regionMenuOpen = !this._regionMenuOpen;
  }

  private _selectBoundary(mode: 'off' | 'counties' | 'ecoregions' | 'places') {
    this._regionMenuOpen = false;
    if (mode === this.boundaryMode) return;
    this._emit<'off' | 'counties' | 'ecoregions' | 'places'>('boundary-mode-changed', mode);
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // visibleIds changed: rebuild GeoJSON via setData
    if (changedProperties.has('visibleIds')) {
      this._applyVisibleIds();
    }

    // selectedOccIds changed: update selection ring filter
    if (changedProperties.has('selectedOccIds')) {
      this._applySelection();
      this._scheduleHaloRecompute();
    }

    // View state restore (from popstate)
    if (changedProperties.has('viewState') && this.viewState && this._map) {
      this._map.jumpTo({
        center: [this.viewState.lon, this.viewState.lat],
        zoom: this.viewState.zoom,
      });
    }

    // Pan-to animation (from table row click)
    if (changedProperties.has('panTo') && this.panTo && this._map) {
      this._map.flyTo({
        center: this.panTo.coordinate as [number, number],
        zoom: this.panTo.zoom,
        duration: 300,
      });
    }

    // Boundary mode changed: toggle visibility and re-apply selection
    if (changedProperties.has('boundaryMode')) {
      this._applyBoundaryMode();
      this._applyBoundarySelection();
    }

    // Filter state changed: re-apply boundary selection highlighting
    if (changedProperties.has('filterState')) {
      this._applyBoundarySelection();
    }
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    // Set Mapbox access token from Vite env
    (mapboxgl as unknown as { accessToken: string }).accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

    // Create Mapbox GL JS map
    this._map = new mapboxgl.Map({
      container: this.mapElement,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT],
      zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
      attributionControl: true,
    });

    // Disable default shift-drag box-zoom so the custom rectangle gesture can claim it
    this._map.boxZoom.disable();

    // Attach canvas mousedown in capture phase to intercept shift-drag before other handlers
    const rectCanvas = this._map.getCanvasContainer();
    rectCanvas.addEventListener('mousedown', this._onRectMouseDown, true);

    // All source/layer setup must happen after the style loads
    this._map.on('load', async () => {
      try {
        const { geojson, summary, taxaOptions } = await loadOccurrenceGeoJSON();
        this._fullGeoJSON = geojson;

        // Add clustered GeoJSON source for occurrences
        this._map!.addSource('occurrences', {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterRadius: 20,
          clusterMinPoints: 2,
          clusterMaxZoom: 14,
          clusterProperties: {
            thisYearCount: ['+', ['case', ['==', ['get', 'recencyTier'], 'thisYear'], 1, 0]],
            lastYearCount: ['+', ['case', ['==', ['get', 'recencyTier'], 'lastYear'], 1, 0]],
            earlierCount:  ['+', ['case', ['==', ['get', 'recencyTier'], 'earlier'], 1, 0]],
          },
        });

        // Add unclustered ghost source for filtered-out features
        this._map!.addSource('occurrences-ghost', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Boundary GeoJSON sources with generateId for feature-state support
        this._map!.addSource('counties', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          generateId: true,
        });
        this._map!.addSource('ecoregions', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          generateId: true,
        });
        this._map!.addSource('places', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          generateId: true,
        });

        // --- Layers in render order ---
        // Compute initial visibility from URL-restored boundaryMode so layers
        // are correct from creation — avoids relying on a later setLayoutProperty
        // call that may be blocked by isStyleLoaded() returning false.
        const countyVis = this.boundaryMode === 'counties' ? 'visible' as const : 'none' as const;
        const ecoVis = this.boundaryMode === 'ecoregions' ? 'visible' as const : 'none' as const;
        const placesVis = this.boundaryMode === 'places' ? 'visible' as const : 'none' as const;

        // Ecoregion fill (click target + selection highlight)
        this._map!.addLayer({
          id: 'ecoregion-fill',
          type: 'fill',
          source: 'ecoregions',
          layout: { visibility: ecoVis },
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(44, 123, 229, 0.12)',
              'rgba(0, 0, 0, 0)',
            ],
          },
        });

        // Ecoregion line (visible stroke).
        // line-join: round avoids miter extension at sharp three-way corners
        // (#14 — small visible artifacts at Pierce/Lewis/Yakima-style junctions).
        this._map!.addLayer({
          id: 'ecoregion-line',
          type: 'line',
          source: 'ecoregions',
          layout: { visibility: ecoVis, 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(44, 123, 229, 0.85)',
              'rgba(80, 80, 80, 0.55)',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.5,
              1.5,
            ],
          },
        });

        // County fill (click target + selection highlight)
        this._map!.addLayer({
          id: 'county-fill',
          type: 'fill',
          source: 'counties',
          layout: { visibility: countyVis },
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(44, 123, 229, 0.12)',
              'rgba(0, 0, 0, 0)',
            ],
          },
        });

        // County line (visible stroke).
        // line-join: round avoids miter extension at sharp three-way corners
        // (#14 — small visible artifacts at Pierce/Lewis/Yakima-style junctions).
        this._map!.addLayer({
          id: 'county-line',
          type: 'line',
          source: 'counties',
          layout: { visibility: countyVis, 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(44, 123, 229, 0.85)',
              'rgba(80, 80, 80, 0.55)',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.5,
              1.5,
            ],
          },
        });

        // Place fill (click target + selection highlight) — warm amber, D-06
        this._map!.addLayer({
          id: 'place-fill',
          type: 'fill',
          source: 'places',
          layout: { visibility: placesVis },
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(220, 130, 30, 0.12)',   // D-06 selected fill
              'rgba(0, 0, 0, 0)',           // D-06 unselected: transparent
            ],
          },
        });

        // Place line (visible stroke) — warm amber, D-06
        // line-join: round avoids miter extension at sharp corners
        this._map!.addLayer({
          id: 'place-line',
          type: 'line',
          source: 'places',
          layout: { visibility: placesVis, 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              'rgba(220, 130, 30, 0.85)',   // D-06 selected line
              'rgba(180, 100, 30, 0.65)',   // D-06 unselected line
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.5,
              1.5,
            ],
          },
        });

        // Place name labels at polygon centroids
        this._map!.addLayer({
          id: 'place-label',
          type: 'symbol',
          source: 'places',
          layout: {
            visibility: placesVis,
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-max-width': 10,
            'symbol-placement': 'point',
          },
          paint: {
            'text-color': '#7a4a00',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        });

        // Ghost points: low-opacity gray dots for filtered-out features
        this._map!.addLayer({
          id: 'ghost-points',
          type: 'circle',
          source: 'occurrences-ghost',
          paint: {
            'circle-color': '#aaaaaa',
            'circle-opacity': 0.2,
            'circle-radius': 4,
            'circle-stroke-width': 0,
          },
        });

        // Clusters: recency-colored circles
        this._map!.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'occurrences',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'case',
              ['>', ['get', 'thisYearCount'], 0], RECENCY_COLORS.thisYear,
              ['>', ['get', 'lastYearCount'], 0], RECENCY_COLORS.lastYear,
              RECENCY_COLORS.earlier,
            ],
            'circle-radius': [
              'step', ['get', 'point_count'],
              12,
              25, 14,
              100, 17,
              500, 20,
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });

        // Cluster count labels
        this._map!.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'occurrences',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['to-string', ['get', 'point_count']],
            'text-size': 11,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': [
              'case',
              ['>', ['get', 'thisYearCount'], 0], '#ffffff',
              '#d0d6d7',
            ],
          },
        });

        // Unclustered individual points
        this._map!.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'occurrences',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match', ['get', 'recencyTier'],
              'thisYear', RECENCY_COLORS.thisYear,
              'lastYear', RECENCY_COLORS.lastYear,
              RECENCY_COLORS.earlier,
            ],
            'circle-radius': 6,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });

        // Selection ring: yellow ring around selected unclustered features
        this._map!.addLayer({
          id: 'selected-ring',
          type: 'circle',
          source: 'occurrences',
          filter: [
            'all',
            ['!', ['has', 'point_count']],
            ['in', ['get', 'occId'], ['literal', []]],
          ],
          paint: {
            'circle-radius': 10,
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#f1c40f',
          },
        });

        // HALO-01: yellow halo around clusters whose leaves intersect selectedOccIds.
        // Cluster auto-IDs preclude reusing the selected-ring promoteId path
        // (Phase 071 A1). A separate non-clustered source carries cluster
        // centroids reactively recomputed on selection / moveend / sourcedata.
        this._map!.addSource('selected-cluster-halo', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        this._map!.addLayer({
          id: 'selected-cluster-halo',
          type: 'circle',
          source: 'selected-cluster-halo',
          paint: {
            'circle-color': 'transparent',
            'circle-stroke-color': '#f1c40f',
            'circle-stroke-width': 2.5,
            // Mirrors the cluster step shape (bee-map.ts cluster paint) plus
            // ~4px halo padding so the ring wraps the blob outline.
            'circle-radius': [
              'step', ['get', 'leaf_count'],
              16,
              25, 18,
              100, 21,
              500, 24,
            ],
          },
        });

        // sourcedata fires on every tile/source update; filter to the
        // occurrences source after it finishes loading to avoid per-tile
        // recomputes. Selection paints reactively after _applyVisibleIds
        // re-aggregates clusters from setData.
        this._map!.on('sourcedata', (e) => {
          if (e.sourceId === 'occurrences' && e.isSourceLoaded) {
            this._scheduleHaloRecompute();
          }
        });

        // Emit data-loaded event
        this._emit('data-loaded', { summary, taxaOptions });

        // Fetch boundary GeoJSON (deferred after occurrence data)
        this._loadBoundaryData();

        // Apply initial visibleIds if set before load completed
        if (this.visibleIds !== null) {
          this._applyVisibleIds();
        }

        // Apply initial selection if set before load completed
        if (this.selectedOccIds !== null) {
          this._applySelection();
        }

        // HALO-01: paint URL-restored selection on first render. moveend
        // alone won't fire without user interaction, and the property-change
        // path in updated() may have run before sources existed.
        this._scheduleHaloRecompute();
      } catch (err) {
        console.error('Failed to load occurrence data:', err);
        this._emit('data-error', { message: err instanceof Error ? err.message : String(err) });
      }
    });

    // moveend: emit view-moved event (outside load callback -- fires for all moves)
    this._map.on('moveend', () => {
      const center = this._map!.getCenter();
      const zoom = this._map!.getZoom();
      this._emit('view-moved', { lon: center.lng, lat: center.lat, zoom });
      // HALO-01: pan/zoom changes which clusters exist and where, so
      // recompute halo centroids for the new viewport.
      this._scheduleHaloRecompute();
    });

    // --- Click interaction priority chain ---
    // addInteraction handlers fire before generic map.on('click').
    // preventDefault() stops propagation to lower-priority handlers.
    // _clickConsumed flag guards the fallback in case preventDefault doesn't block generic listeners.

    this._map.on('mousedown', () => { this._clickConsumed = false; });

    // 1. Cluster click -- per D-01: query all leaves, emit map-click-occurrence (no zoom)
    this._map.addInteraction('click-cluster', {
      type: 'click',
      target: { layerId: 'clusters' },
      handler: (e) => {
        this._clickConsumed = true;
        e.preventDefault();
        this._handleClusterClick(e);
      },
    });

    // 2. Unclustered point click
    this._map.addInteraction('click-point', {
      type: 'click',
      target: { layerId: 'unclustered-point' },
      handler: (e) => {
        this._clickConsumed = true;
        e.preventDefault();
        this._handlePointClick(e);
      },
    });

    // 3. County fill click (fires only when county-fill layer is visible)
    this._map.addInteraction('click-county', {
      type: 'click',
      target: { layerId: 'county-fill' },
      handler: (e) => {
        this._clickConsumed = true;
        e.preventDefault();
        this._handleRegionClick(e, 'NAME');
      },
    });

    // 4. Ecoregion fill click
    this._map.addInteraction('click-ecoregion', {
      type: 'click',
      target: { layerId: 'ecoregion-fill' },
      handler: (e) => {
        this._clickConsumed = true;
        e.preventDefault();
        this._handleRegionClick(e, 'NA_L3NAME');
      },
    });

    // 5. Place fill click — fires only when place-fill layer is visible (D-03)
    // Emits 'place-selected' with { slug } via _handlePlaceClick
    this._map.addInteraction('click-place', {
      type: 'click',
      target: { layerId: 'place-fill' },
      handler: (e) => {
        this._clickConsumed = true;
        e.preventDefault();
        this._handlePlaceClick(e);
      },
    });

    // 6. Fallback: empty map click
    this._map.on('click', () => {
      if (this._clickConsumed) return;
      this._emit('map-click-empty');
    });

    // Close region menu when clicking outside this component
    document.addEventListener('click', this._onDocumentClick);

    // ResizeObserver to handle container dimension changes (e.g., table-mode toggle)
    this._resizeObserver = new ResizeObserver(() => this._map?.resize());
    this._resizeObserver.observe(this.mapElement);
  }

  // --- Private helpers ---

  private _applyVisibleIds() {
    if (!this._map || !this._fullGeoJSON) return;

    const occSource = this._map.getSource('occurrences') as mapboxgl.GeoJSONSource | undefined;
    const ghostSource = this._map.getSource('occurrences-ghost') as mapboxgl.GeoJSONSource | undefined;
    if (!occSource || !ghostSource) return;

    if (this.visibleIds !== null) {
      const visibleFeatures = this._fullGeoJSON.features.filter(
        f => this.visibleIds!.has(f.properties.occId)
      );
      const ghostFeatures = this._fullGeoJSON.features.filter(
        f => !this.visibleIds!.has(f.properties.occId)
      );
      occSource.setData({ type: 'FeatureCollection', features: visibleFeatures });
      ghostSource.setData({ type: 'FeatureCollection', features: ghostFeatures });
    } else {
      // No filter active -- restore full data and clear ghost
      occSource.setData(this._fullGeoJSON);
      ghostSource.setData({ type: 'FeatureCollection', features: [] });
    }

    this._emitFilteredSummary();
  }

  private _applySelection() {
    if (!this._map?.getLayer('selected-ring')) return;

    if (this.selectedOccIds !== null && this.selectedOccIds.size > 0) {
      this._map.setFilter('selected-ring', [
        'all',
        ['!', ['has', 'point_count']],
        ['in', ['get', 'occId'], ['literal', [...this.selectedOccIds]]],
      ]);
    } else {
      this._map.setFilter('selected-ring', [
        'all',
        ['!', ['has', 'point_count']],
        ['in', ['get', 'occId'], ['literal', []]],
      ]);
    }
  }

  // HALO-01: coalesce multiple recompute triggers within a single frame.
  // moveend + sourcedata + property change can all fire in quick succession;
  // the rAF token ensures we only walk the cluster set once per frame.
  private _scheduleHaloRecompute() {
    if (this._haloRafToken !== null) return;
    this._haloRafToken = requestAnimationFrame(() => {
      this._haloRafToken = null;
      void this._recomputeHalo();
    });
  }

  // HALO-01: walk currently-rendered clusters, await getClusterLeaves for
  // each, and emit a halo feature for any cluster whose leaves intersect
  // selectedOccIds. Race guard via _haloGeneration mirrors bee-atlas's
  // _filterQueryGeneration pattern (CLAUDE.md ARCH invariant).
  private async _recomputeHalo() {
    if (!this._map) return;
    const haloSource = this._map.getSource('selected-cluster-halo') as mapboxgl.GeoJSONSource | undefined;
    if (!haloSource) return;

    const generation = ++this._haloGeneration;

    // Empty selection short-circuits to an empty FeatureCollection.
    if (this.selectedOccIds === null || this.selectedOccIds.size === 0) {
      haloSource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const occSource = this._map.getSource('occurrences') as mapboxgl.GeoJSONSource | undefined;
    if (!occSource) return;

    // querySourceFeatures returns only currently-rendered features (deduped
    // less reliably across tile boundaries — we dedupe by cluster_id below).
    const rawClusters = this._map.querySourceFeatures('occurrences', {
      filter: ['has', 'point_count'],
    });

    // Dedupe by cluster_id: tile-boundary duplication is real.
    const uniqueClusters = new Map<number, GeoJSON.Feature>();
    for (const f of rawClusters) {
      const id = f.properties?.cluster_id as number | undefined;
      if (id != null && !uniqueClusters.has(id)) {
        uniqueClusters.set(id, f as unknown as GeoJSON.Feature);
      }
    }

    if (uniqueClusters.size === 0) {
      haloSource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Resolve all leaves in parallel; mirror _handleClusterClick's
    // Promise wrapper around getClusterLeaves (bee-map.ts:732).
    const leafQueries = Array.from(uniqueClusters.entries()).map(([clusterId, cluster]) => {
      const pointCount = cluster.properties?.point_count as number | undefined;
      if (pointCount == null) {
        return Promise.resolve({ cluster, clusterId, leaves: [] as GeoJSON.Feature[] });
      }
      return new Promise<{ cluster: GeoJSON.Feature; clusterId: number; leaves: GeoJSON.Feature[] }>((resolve) => {
        occSource.getClusterLeaves(clusterId, pointCount, 0, (error, features) => {
          if (error) resolve({ cluster, clusterId, leaves: [] });
          else resolve({ cluster, clusterId, leaves: features ?? [] });
        });
      });
    });

    let results: { cluster: GeoJSON.Feature; clusterId: number; leaves: GeoJSON.Feature[] }[];
    try {
      results = await Promise.all(leafQueries);
    } catch (err) {
      console.error('Halo getClusterLeaves failed:', err);
      return;
    }

    // Race guard: a newer recompute (selection or pan) has superseded us.
    if (generation !== this._haloGeneration) return;

    // Component unmount race: source could have been removed mid-flight.
    const haloSourceFresh = this._map.getSource('selected-cluster-halo') as mapboxgl.GeoJSONSource | undefined;
    if (!haloSourceFresh) return;

    const selected = this.selectedOccIds;
    if (selected === null || selected.size === 0) {
      // Selection cleared while we were resolving leaves — empty out.
      haloSourceFresh.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const haloFeatures: GeoJSON.Feature[] = [];
    for (const { cluster, clusterId, leaves } of results) {
      const hit = leaves.some(f => {
        const occId = f.properties?.occId as string | undefined;
        return occId != null && selected.has(occId);
      });
      if (!hit) continue;
      haloFeatures.push({
        type: 'Feature',
        geometry: cluster.geometry,
        properties: {
          cluster_id: clusterId,
          leaf_count: cluster.properties?.point_count ?? 0,
        },
      });
    }

    haloSourceFresh.setData({ type: 'FeatureCollection', features: haloFeatures });
  }

  private _emitFilteredSummary() {
    if (this.visibleIds !== null && this._fullGeoJSON) {
      const allSpecimen = this._fullGeoJSON.features.filter(
        f => f.properties.occId.startsWith('ecdysis:')
      );
      const matching = allSpecimen.filter(
        f => this.visibleIds!.has(f.properties.occId)
      );
      const fSummary = this._computeSummary(matching);
      const totalSummary = allSpecimen.length > 0 ? this._computeSummary(allSpecimen) : null;
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

  private _computeSummary(features: FeatureCollection<Point, OccurrenceProperties>['features']): DataSummary {
    const species = new Set<string>();
    const genera = new Set<string>();
    const families = new Set<string>();
    let min = Infinity, max = -Infinity;
    for (const f of features) {
      const s = f.properties.scientificName as string | undefined;
      const g = f.properties.genus as string | undefined;
      const fam = f.properties.family as string | undefined;
      if (s) species.add(s);
      if (g) genera.add(g);
      if (fam) families.add(fam);
      const y = f.properties.year as number | undefined;
      if (y != null) {
        if (y < min) min = y;
        if (y > max) max = y;
      }
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

  private async _loadBoundaryData() {
    try {
      const [countiesResp, ecoregionsResp, placesUrl] = await Promise.all([
        resolveDataUrl('counties').then(url => fetch(url!)),
        resolveDataUrl('ecoregions').then(url => fetch(url!)),
        resolveDataUrl('places'),
      ]);
      const countiesData = await countiesResp.json();
      const ecoregionsData = await ecoregionsResp.json();
      const placesData = placesUrl
        ? await fetch(placesUrl).then(r => r.json())
        : { type: 'FeatureCollection', features: [] };

      // Build ID-to-name maps (generateId assigns sequential integers)
      this._countyIdMap = new Map(
        (countiesData.features as { properties?: { NAME?: string } }[]).map(
          (f, i) => [i, f.properties?.NAME ?? '']
        )
      );
      this._ecoregionIdMap = new Map(
        (ecoregionsData.features as { properties?: { NA_L3NAME?: string } }[]).map(
          (f, i) => [i, f.properties?.NA_L3NAME ?? '']
        )
      );
      // _placeIdMap maps feature id (generateId sequential int) → slug
      this._placeIdMap = new Map(
        (placesData.features as { properties?: { slug?: string } }[]).map(
          (f, i) => [i, f.properties?.slug ?? '']
        )
      );

      (this._map!.getSource('counties') as mapboxgl.GeoJSONSource).setData(countiesData);
      (this._map!.getSource('ecoregions') as mapboxgl.GeoJSONSource).setData(ecoregionsData);
      (this._map!.getSource('places') as mapboxgl.GeoJSONSource).setData(placesData);

      // Apply visibility and selection for URL-restored state
      this._applyBoundaryMode();
      this._applyBoundarySelection();
    } catch (err) {
      console.error('Failed to load boundary GeoJSON:', err);
    }
  }

  private _applyBoundaryMode() {
    if (!this._map?.getLayer('county-fill')) return;
    const countyVis = this.boundaryMode === 'counties' ? 'visible' : 'none';
    const ecoVis = this.boundaryMode === 'ecoregions' ? 'visible' : 'none';
    const placesVis = this.boundaryMode === 'places' ? 'visible' : 'none';
    this._map.setLayoutProperty('county-fill', 'visibility', countyVis);
    this._map.setLayoutProperty('county-line', 'visibility', countyVis);
    this._map.setLayoutProperty('ecoregion-fill', 'visibility', ecoVis);
    this._map.setLayoutProperty('ecoregion-line', 'visibility', ecoVis);
    this._map.setLayoutProperty('place-fill', 'visibility', placesVis);
    this._map.setLayoutProperty('place-line', 'visibility', placesVis);
    this._map.setLayoutProperty('place-label', 'visibility', placesVis);
  }

  private _applyBoundarySelection() {
    if (!this._map?.getSource('counties') || !this._map?.getSource('ecoregions')) return;

    // Clear all feature-state on all boundary sources
    this._map.removeFeatureState({ source: 'counties' });
    this._map.removeFeatureState({ source: 'ecoregions' });
    this._map.removeFeatureState({ source: 'places' });

    if (this.boundaryMode === 'counties') {
      for (const [id, name] of this._countyIdMap.entries()) {
        if (this.filterState.selectedCounties.has(name)) {
          this._map.setFeatureState({ source: 'counties', id }, { selected: true });
        }
      }
    } else if (this.boundaryMode === 'ecoregions') {
      for (const [id, name] of this._ecoregionIdMap.entries()) {
        if (this.filterState.selectedEcoregions.has(name)) {
          this._map.setFeatureState({ source: 'ecoregions', id }, { selected: true });
        }
      }
    } else if (this.boundaryMode === 'places') {
      // D-05: highlight matching polygon when mode=places and filter active
      for (const [id, slug] of this._placeIdMap.entries()) {
        if (this.filterState.selectedPlace === slug) {
          this._map.setFeatureState({ source: 'places', id }, { selected: true });
        }
      }
    }
  }

  private async _handleClusterClick(e: mapboxgl.InteractionEvent) {
    this._clickConsumed = true;
    e.preventDefault();
    const feature = e.feature;
    if (!feature || !this._map) return;

    const clusterId = feature.properties?.cluster_id as number | undefined;
    const pointCount = feature.properties?.point_count as number | undefined;
    if (clusterId == null || pointCount == null) return;

    const source = this._map.getSource('occurrences') as mapboxgl.GeoJSONSource;

    try {
      const leaves = await new Promise<GeoJSON.Feature[]>((resolve, reject) => {
        source.getClusterLeaves(clusterId, pointCount, 0, (error, features) => {
          if (error) reject(error);
          else resolve(features ?? []);
        });
      });

      // Filter to visible features if filter is active
      const toShow = this.visibleIds !== null
        ? leaves.filter(f => this.visibleIds!.has(f.properties?.occId))
        : leaves;
      if (toShow.length === 0) return;

      const occIds = toShow.map(f => f.properties!.occId as string);
      const occurrences = toShow.map(featureToOccurrenceRow);

      // Compute centroid and radius for cluster URL state
      const coords = toShow.map(f => (f.geometry as GeoJSON.Point).coordinates);
      const centroid = {
        lon: coords.reduce((s, c) => s + c[0]!, 0) / coords.length,
        lat: coords.reduce((s, c) => s + c[1]!, 0) / coords.length,
      };
      const radiusM = Math.max(...coords.map(c =>
        haversineMetres(centroid.lon, centroid.lat, c[0]!, c[1]!)
      ));

      this._emit('map-click-occurrence', { occurrences, occIds, centroid, radiusM });
    } catch (err) {
      console.error('Failed to get cluster leaves:', err);
    }
  }

  private _handlePointClick(e: mapboxgl.InteractionEvent) {
    this._clickConsumed = true;
    e.preventDefault();
    const feature = e.feature;
    if (!feature) return;

    const occId = feature.properties?.occId as string;
    if (!occId) return;

    // Skip ghost features (filtered out)
    if (this.visibleIds !== null && !this.visibleIds.has(occId)) return;

    const occurrence = featureToOccurrenceRow(feature as unknown as GeoJSON.Feature);
    this._emit('map-click-occurrence', {
      occurrences: [occurrence],
      occIds: [occId],
    });
  }

  private _handleRegionClick(e: mapboxgl.InteractionEvent, nameProperty: string) {
    this._clickConsumed = true;
    e.preventDefault();
    const feature = e.feature;
    if (!feature) return;

    const name = feature.properties?.[nameProperty] as string | undefined;
    if (!name) return;

    this._emit('map-click-region', {
      name,
      shiftKey: (e.originalEvent as MouseEvent).shiftKey,
    });
  }

  private _handlePlaceClick(e: mapboxgl.InteractionEvent) {
    this._clickConsumed = true;
    e.preventDefault();
    const feature = e.feature;
    if (!feature) return;

    const slug = feature.properties?.['slug'] as string | undefined;
    if (!slug) return;

    this._emit('place-selected', { slug });
  }
}
