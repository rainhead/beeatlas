import { css, html, LitElement, unsafeCSS, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import mapboxgl from 'mapbox-gl';
import mapboxCssText from 'mapbox-gl/dist/mapbox-gl.css?raw';
import { loadOccurrenceGeoJSON } from './features.ts';
import { markMapReady } from './ready.ts';
import { type FilterState, getOccurrences, type OccurrenceProperties } from './filter.ts';
import type { FeatureCollection, Point } from 'geojson';
import {
  RECENCY_COLORS,
  boundaryFillLayerSpec,
  boundaryLineLayerSpec,
  clusterCircleLayerSpec,
  clusterCountLayerSpec,
  ghostPointLayerSpec,
  placeFillLayerSpec,
  placeLabelLayerSpec,
  placeLineLayerSpec,
  selectedOccurrencesLayerSpec,
  unclusteredPointLayerSpec,
} from './style.ts';
import { resolveDataUrl } from './manifest.ts';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;


@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

  // --- @property inputs from bee-atlas ---
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
  @property({ attribute: false }) visibleIds: Set<string> | null = null;
  @property({ attribute: false }) filteredGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  @property({ attribute: false }) selectedOccIds: Set<string> | null = null;
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) viewState: { lon: number; lat: number; zoom: number } | null = null;
  @property({ attribute: false }) panTo: { coordinate: number[]; zoom: number } | null = null;
  @property({ attribute: false }) filterState: FilterState = {
    taxonId: null,
    taxonDisplayName: null,
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

  @property({ attribute: false }) hiddenSources: Set<string> = new Set();
  @property({ attribute: false }) intendedFilterActive = false;

  @state() private _regionMenuOpen = false;

  // Mapbox GL JS map instance
  private _map: mapboxgl.Map | null = null;

  // Full unfiltered GeoJSON for setData-based filtering
  private _fullGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;

  private _resizeObserver: ResizeObserver | null = null;

  private _countyIdMap: Map<number, string> = new Map();
  private _ecoregionIdMap: Map<number, string> = new Map();
  private _placeIdMap: Map<number, string> = new Map();
  private _clickConsumed = false;


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

    // visibleIds, filteredGeoJSON, or intendedFilterActive changed: rebuild source data
    if (changedProperties.has('visibleIds') || changedProperties.has('filteredGeoJSON') || changedProperties.has('intendedFilterActive')) {
      this._applyVisibleIds();
    }

    // selectedOccIds changed: update selected-occurrences overlay
    if (changedProperties.has('selectedOccIds')) {
      this._applySelection();
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

    // Source visibility changed: apply setFilter to unclustered-point
    if (changedProperties.has('hiddenSources')) {
      this._applySourceFilter();
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
      // Signal the map-readiness barrier (ready.ts). Additive (step 1 of the
      // map-init readiness work) — nothing awaits it yet.
      markMapReady();
      try {
        const { geojson } = await loadOccurrenceGeoJSON();
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
          attribution: '<a href="https://agr.wa.gov/departments/insects-pests-and-weeds/insects/apiary-pollinators/pollinator-health/bee-atlas/" target="_blank">Washington Bee Atlas</a>',
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

        this._map!.addLayer(boundaryFillLayerSpec('ecoregions', 'ecoregion-fill', ecoVis));
        this._map!.addLayer(boundaryLineLayerSpec('ecoregions', 'ecoregion-line', ecoVis));
        this._map!.addLayer(boundaryFillLayerSpec('counties', 'county-fill', countyVis));
        this._map!.addLayer(boundaryLineLayerSpec('counties', 'county-line', countyVis));
        this._map!.addLayer(placeFillLayerSpec(placesVis));
        this._map!.addLayer(placeLineLayerSpec(placesVis));
        this._map!.addLayer(placeLabelLayerSpec(placesVis));

        // Ghost points: low-opacity gray dots for filtered-out features
        this._map!.addLayer(ghostPointLayerSpec());

        // Clusters: recency-colored circles
        this._map!.addLayer(clusterCircleLayerSpec(RECENCY_COLORS));

        // Cluster count labels
        this._map!.addLayer(clusterCountLayerSpec(RECENCY_COLORS));

        // Unclustered individual points
        this._map!.addLayer(unclusteredPointLayerSpec(RECENCY_COLORS));

        // selected-occurrences: non-clustered overlay of selected features.
        // Renders at exact coordinates regardless of zoom, so selected points
        // are visible even when merged into a cluster in the main source.
        // Updated via setData on selection or filter change — no async needed.
        this._map!.addSource('selected-occurrences', {
          type: 'geojson',
          cluster: false,
          data: { type: 'FeatureCollection', features: [] },
        });
        this._map!.addLayer(selectedOccurrencesLayerSpec(RECENCY_COLORS));

        // Emit data-loaded event (bare signal — summary is owned by bee-atlas._loadSummaryFromSQLite)
        this._emit('data-loaded', {});

        // Fetch boundary GeoJSON (deferred after occurrence data)
        this._loadBoundaryData();

        // Apply initial source data once sources exist. Fire when visibleIds is set OR
        // intendedFilterActive is true — otherwise a hide-all that arrived before load
        // would not be applied (the map would flash full data on load before the query resolves).
        if (this.visibleIds !== null || this.intendedFilterActive) {
          this._applyVisibleIds();
        }

        // Apply initial selection if set before load completed
        if (this.selectedOccIds !== null) {
          this._applySelection();
        }

        // Apply initial source filter if hiddenSources was set before map loaded
        if (this.hiddenSources.size > 0) {
          this._applySourceFilter();
        }
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
    });

    // --- Click interaction priority chain ---
    // addInteraction handlers fire before generic map.on('click').
    // preventDefault() stops propagation to lower-priority handlers.
    // _clickConsumed flag guards the fallback in case preventDefault doesn't block generic listeners.

    this._map.on('mousedown', () => { this._clickConsumed = false; });

    // 1. Cluster click — get all leaves, emit map-click-occurrence (shows them via selected-occurrences overlay)
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

  // Drop features whose source the user has unchecked. Applied to the source
  // DATA (not a layer filter) so mapbox-gl re-clusters without them — a layer
  // filter can't hide cluster bubbles, which aggregate at the source level.
  private _visibleBySource(
    features: FeatureCollection<Point, OccurrenceProperties>['features']
  ): FeatureCollection<Point, OccurrenceProperties>['features'] {
    if (this.hiddenSources.size === 0) return features;
    return features.filter(f => !this.hiddenSources.has(f.properties.source));
  }

  private _applyVisibleIds() {
    if (!this._map || !this._fullGeoJSON) return;

    const occSource = this._map.getSource('occurrences') as mapboxgl.GeoJSONSource | undefined;
    const ghostSource = this._map.getSource('occurrences-ghost') as mapboxgl.GeoJSONSource | undefined;
    if (!occSource || !ghostSource) return;

    if (this.intendedFilterActive) {
      // Filter intended: render filteredGeoJSON if available, otherwise empty (hide-all).
      // Using ?? guarantees "filter intended but data not yet ready" renders empty — the
      // structural anti-flash guarantee (SC-3). filteredGeoJSON !== null is NOT the decision
      // criterion; intendedFilterActive is.
      const activeFeatures = (this.filteredGeoJSON ?? { type: 'FeatureCollection' as const, features: [] }).features;
      occSource.setData({
        type: 'FeatureCollection',
        features: this._visibleBySource(activeFeatures),
      });
      // Ghost: full set minus visible IDs. Only computable once filtered set + visibleIds arrive.
      if (this.filteredGeoJSON !== null && this.visibleIds !== null) {
        const ghostFeatures = this._visibleBySource(
          this._fullGeoJSON.features.filter(f => !this.visibleIds!.has(f.properties.occId))
        );
        ghostSource.setData({ type: 'FeatureCollection', features: ghostFeatures });
      } else {
        ghostSource.setData({ type: 'FeatureCollection', features: [] });
      }
    } else {
      // No filter intended -- render full set and clear ghost
      occSource.setData({
        type: 'FeatureCollection',
        features: this._visibleBySource(this._fullGeoJSON.features),
      });
      ghostSource.setData({ type: 'FeatureCollection', features: [] });
    }

    this._applySelection();
  }

  private _applySelection() {
    if (!this._map) return;
    const selectedSource = this._map.getSource('selected-occurrences') as mapboxgl.GeoJSONSource | undefined;
    if (!selectedSource || !this._fullGeoJSON) return;

    const hasSelection = this.selectedOccIds !== null && this.selectedOccIds.size > 0;

    // Dim background layers when a selection is active so selected dots stand out.
    const dimOpacity = hasSelection ? 0.3 : 1;
    if (this._map.getLayer('clusters')) {
      this._map.setPaintProperty('clusters', 'circle-opacity', dimOpacity);
      this._map.setPaintProperty('clusters', 'circle-stroke-opacity', dimOpacity);
    }
    if (this._map.getLayer('cluster-count')) {
      this._map.setPaintProperty('cluster-count', 'text-opacity', dimOpacity);
    }
    if (this._map.getLayer('unclustered-point')) {
      this._map.setPaintProperty('unclustered-point', 'circle-opacity', dimOpacity);
      this._map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', dimOpacity);
    }

    if (!hasSelection) {
      selectedSource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features = this._visibleBySource(this._fullGeoJSON.features).filter(f => {
      const id = f.properties.occId;
      if (!this.selectedOccIds!.has(id)) return false;
      return this.visibleIds === null || this.visibleIds.has(id);
    });
    selectedSource.setData({ type: 'FeatureCollection', features });
  }

  private _applySourceFilter() {
    // Re-set the source data so clusters AND unclustered points both honor the
    // hidden-source set. _applyVisibleIds runs _visibleBySource over the data
    // and re-clusters; _applySelection drops hidden-source points from the
    // selection overlay.
    this._applyVisibleIds();
    this._applySelection();
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

      const toShow = this.visibleIds !== null
        ? leaves.filter(f => this.visibleIds!.has(f.properties?.occId))
        : leaves;
      if (toShow.length === 0) return;

      const toShowIds = toShow.map(f => f.properties!.occId as string);
      const occurrences = await getOccurrences(toShowIds);
      this._emit('map-click-occurrence', { occurrences, occIds: toShowIds });
    } catch (err) {
      console.error('Failed to get cluster leaves:', err);
    }
  }

  private async _handlePointClick(e: mapboxgl.InteractionEvent) {
    this._clickConsumed = true;
    e.preventDefault();
    const feature = e.feature;
    if (!feature) return;

    const occId = feature.properties?.occId as string;
    if (!occId) return;

    // Skip ghost features (filtered out)
    if (this.visibleIds !== null && !this.visibleIds.has(occId)) return;

    const occurrences = await getOccurrences([occId]);
    if (occurrences.length === 0) return;
    this._emit('map-click-occurrence', { occurrences, occIds: [occId] });
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
