import { css, html, LitElement, unsafeCSS, type PropertyValues } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
// MapLibre v6 is ESM-only and has NO DEFAULT EXPORT, so this is a namespace
// import rather than the `import maplibregl from …` Mapbox allowed (beeatlas-26q).
import * as maplibregl from 'maplibre-gl';
import maplibreCssText from 'maplibre-gl/dist/maplibre-gl.css?raw';
import { Protocol } from 'pmtiles';
import { loadOccurrenceGeoJSON } from './features.ts';
import { markMapReady } from './ready.ts';
import { type FilterState, emptyFilterState, getOccurrences, type OccurrenceProperties } from './filter.ts';
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
  wildernessFillLayerSpec,
  wildernessLabelLayerSpec,
  wildernessLineLayerSpec,
} from './style.ts';
import { resolveDataUrl } from './manifest.ts';
import {
  basemapManifestUrl,
  blankBasemapStyle,
  buildBasemapStyle,
  parseBasemapManifest,
} from './basemap-style.ts';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

/**
 * How long to wait for the basemap manifest before giving up and rendering the
 * blank style. The map is not constructed until this settles, so this is also
 * the worst-case delay before the GeolocateControl exists — which is why it is
 * bounded at all: offline, `fetch` normally rejects in milliseconds, but behind
 * a captive portal it can hang indefinitely, and an unbounded hang here would
 * mean no map and no GPS rather than a blank basemap and working GPS.
 */
const BASEMAP_MANIFEST_TIMEOUT_MS = 3000;

/**
 * Where MapLibre's worker is served from — copied out of node_modules by an
 * Eleventy passthrough (see eleventy.config.js, which carries the full why).
 *
 * The short version: MapLibre locates its worker by deriving a sibling URL from
 * its own `import.meta.url`, which stops being true the moment it is bundled.
 * It then requests a worker next to OUR chunk, gets a 404, and reports nothing —
 * tiles stay in `loading`, `load` never fires, and since the occurrence layers
 * are added in that handler the map renders blank with a clean console. So the
 * URL is handed over explicitly rather than derived.
 *
 * A plain page-tree path, not a hashed asset: the worker is not part of the
 * bundle graph, and the page tree is served `max-age=0`, so a version bump
 * cannot leave a stale worker paired with a new bundle.
 */
const MAPLIBRE_WORKER_URL = '/basemap/maplibre/maplibre-gl-worker.mjs';

/**
 * Layers the map hit-tests on click, in priority order. The first layer with a
 * feature under the cursor wins and nothing below it is consulted; if none
 * match, the click is empty.
 *
 * This replaces Mapbox's `addInteraction` chain (five handlers whose
 * `preventDefault()` stopped propagation to the next), which MapLibre has no
 * equivalent for. `queryRenderedFeatures` returns features only from layers that
 * are actually RENDERED, so a boundary layer at `visibility: none` is skipped —
 * which is what preserved the old chain's "fires only when the layer is
 * visible" property, not any explicit check.
 */
const CLICK_PRIORITY_LAYERS = [
  'clusters',
  'unclustered-point',
  'county-fill',
  'ecoregion-fill',
  'place-fill',
] as const;

/**
 * The two pieces of MapLibre setup that are GLOBAL rather than per-map, and both
 * of which must happen before a map is constructed:
 *
 *  - the worker URL, because MapLibre's own way of finding its worker does not
 *    survive bundling (see MAPLIBRE_WORKER_URL);
 *  - the pmtiles:// protocol handler, because the style names that scheme.
 *
 * One shared Protocol instance is also what lets its directory cache survive
 * across maps (re-mounts, HMR), so this is deliberately module-level rather than
 * per-element. It holds no reactive state — <bee-map> stays a pure presenter.
 */
let rendererConfigured = false;
function configureRenderer(): void {
  if (rendererConfigured) return;
  rendererConfigured = true;
  maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
  maplibregl.addProtocol('pmtiles', new Protocol().tile as maplibregl.AddProtocolAction);
}


@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

  // --- @property inputs from bee-atlas ---
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' | 'wilderness' = 'off';
  @property({ attribute: false }) visibleIds: Set<string> | null = null;
  @property({ attribute: false }) filteredGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  @property({ attribute: false }) selectedOccIds: Set<string> | null = null;
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) viewState: { lon: number; lat: number; zoom: number } | null = null;
  @property({ attribute: false }) panTo: { coordinate: number[]; zoom: number } | null = null;
  @property({ attribute: false }) filterState: FilterState = emptyFilterState();

  @property({ attribute: false }) hiddenTiers: Set<string> = new Set();
  @property({ attribute: false }) intendedFilterActive = false;
  @property({ attribute: false }) offline = false;

  // MapLibre GL JS map instance
  private _map: maplibregl.Map | null = null;

  // The Phase 152 GeolocateControl — stored on the instance so <bee-atlas> can
  // trigger it via requestUserLocation() (D-06 seam for near-me). NOT @state;
  // <bee-map> is a pure presenter and holds no reactive location state.
  private _geolocate: maplibregl.GeolocateControl | null = null;


  // Full unfiltered GeoJSON for setData-based filtering
  private _fullGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  // Resolves when occurrence data has loaded (or failed) — independent of the
  // basemap style, so an offline cold-start doesn't hang waiting for map 'load'.
  private _dataReady: Promise<void> | null = null;

  private _resizeObserver: ResizeObserver | null = null;

  private _countyIdMap: Map<number, string> = new Map();
  private _ecoregionIdMap: Map<number, string> = new Map();
  private _placeIdMap: Map<number, string> = new Map();
  private _clickConsumed = false;


  // Shift-drag rectangle gesture (SEL-01, SEL-02)
  private _rectStart: maplibregl.Point | null = null;
  private _rectBox: HTMLDivElement | null = null;

  static _maplibreCss = unsafeCSS(maplibreCssText);

  static styles = css`
:host {
  display: flex;
  flex-grow: 1;
  position: relative;
}
#map {
  flex-grow: 1;
}
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
.offline-basemap-label {
  position: absolute;
  bottom: 1.5rem;
  left: 0.5rem;
  background: rgba(255, 255, 255, 0.85);
  color: #333;
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  max-width: 220px;
  pointer-events: none;
  z-index: 3;
}
  `;

  private _emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true, composed: true, detail,
    }));
  }

  render() {
    return html`
      <style>${BeeMap._maplibreCss}</style>
      <div id="map"></div>
      ${this.offline ? html`<div class="offline-basemap-label">Basemap tiles unavailable offline. Pan here while online to cache tiles for an area.</div>` : ''}
    `;
  }

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

  private _mousePos(e: MouseEvent): maplibregl.Point {
    const canvas = this._map!.getCanvasContainer();
    const rect = canvas.getBoundingClientRect();
    const scaling = canvas.offsetWidth === rect.width ? 1 : canvas.offsetWidth / rect.width;
    return new maplibregl.Point(
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
    super.disconnectedCallback();
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

    // Tier visibility changed: re-set source data so clusters + points honor the hidden-tier set
    if (changedProperties.has('hiddenTiers')) {
      this._applyTierFilter();
    }
  }

  /**
   * Load occurrence data (boots the SQLite worker, builds the GeoJSON) and emit
   * `data-loaded` so <bee-atlas> clears the loading curtain and renders the table.
   * Deliberately NOT gated on the map's 'load' event — nor on the basemap
   * manifest. The cached data must render even when no basemap can (Phase 151),
   * and this is kicked off before anything is awaited so the two never queue.
   */
  private async _loadOccurrenceData(): Promise<void> {
    try {
      const { geojson } = await loadOccurrenceGeoJSON();
      this._fullGeoJSON = geojson;
      // Bare signal — the summary is owned by bee-atlas._loadSummaryFromSQLite.
      this._emit('data-loaded', {});
    } catch (err) {
      console.error('Failed to load occurrence data:', err);
      this._emit('data-error', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Fetch the basemap manifest and build the field style from it, falling back
   * to the blank style on ANY failure — offline, a 404 from a site whose
   * /basemap/tiles Alias is not configured, or a payload that does not parse.
   *
   * The failure is logged but never surfaced as an error to <bee-atlas>: a
   * missing basemap degrades the map, it does not break the app, and the
   * occurrence layers render either way.
   */
  private async _resolveBasemapStyle(): Promise<maplibregl.StyleSpecification> {
    const origin = location.origin;
    try {
      const resp = await fetch(basemapManifestUrl(), {
        signal: AbortSignal.timeout(BASEMAP_MANIFEST_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`basemap manifest: HTTP ${resp.status}`);
      return buildBasemapStyle(parseBasemapManifest(await resp.json()), { origin });
    } catch (err) {
      console.warn('Basemap unavailable, rendering without it:', err);
      return blankBasemapStyle({ origin });
    }
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    // Load occurrence data INDEPENDENT of the basemap. Kicked off FIRST, before
    // _initMap awaits the manifest, so the cached data + table still render (the
    // "Loading…" curtain clears via the data-loaded event) on a cold start where
    // the basemap never arrives. [Phase 151 iOS offline fix]
    this._dataReady = this._loadOccurrenceData();
    void this._initMap();
  }

  /**
   * Construct the map and wire everything to it.
   *
   * Async because the style is DATA now: the archive filename is date-stamped
   * (publish-basemap.sh keeps superseded archives alive through a grace period),
   * so the manifest naming the current one has to be fetched before a style can
   * name a source. That fetch is bounded — see BASEMAP_MANIFEST_TIMEOUT_MS —
   * and always yields a style, so this method always constructs a map.
   */
  private async _initMap(): Promise<void> {
    // Before any map is constructed or any style naming pmtiles:// is loaded.
    configureRenderer();

    const style = await this._resolveBasemapStyle();
    // Disconnected while the manifest was in flight: constructing a map into a
    // detached container would leak a WebGL context and a ResizeObserver.
    if (!this.isConnected) return;

    this._map = new maplibregl.Map({
      container: this.mapElement,
      style,
      center: [this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT],
      zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
      // `true` is not a MapLibre option — the control is on by default and
      // configured by an options object. It carries the OSM/Protomaps notice
      // from the vector source and the Bee Atlas notice from the occurrence
      // source, both of which are required attribution.
      attributionControl: {},
    });

    // Add GeolocateControl immediately after map construction — NOT inside 'load'.
    // The blue dot + accuracy circle are DOM Markers (appended to getCanvasContainer()),
    // not style layers, so they render offline without the style having loaded.
    // Gating this behind 'load' would break offline GPS (LOC-01 SC-2). [Phase 151 / Phase 152]
    this._geolocate = new maplibregl.GeolocateControl({
      trackUserLocation: true,
      positionOptions: { enableHighAccuracy: true },
      showAccuracyCircle: true,
    });
    // Place top-left: the top-right corner is occupied by the custom region
    // control (relocated to <bee-atlas> in Phase 157, but still painted over the
    // map's top-right via a sibling z-index). top-left is otherwise empty.
    this._map.addControl(this._geolocate, 'top-left');

    this._geolocate.on('geolocate', e => {
      this._emit('user-location-changed', {
        lat: e.coords.latitude,
        lon: e.coords.longitude,
        accuracy: e.coords.accuracy,
      });
    });

    // Where a DENIED permission now surfaces. MapLibre's trigger() starts the
    // watch regardless of permission state and lets the Geolocation API's own
    // error callback fire this — see _triggerGeolocate for why that matters.
    this._geolocate.on('error', e => {
      this._emit('user-location-changed', { error: { code: e.code, message: e.message } });
    });

    // D-03: auto-trigger only if geolocation permission is already granted.
    // Deferred into a resolved .then() because the control's `_setup` flag is set
    // asynchronously, in the continuation of its own checkGeolocationSupport()
    // permissions query; a synchronous trigger() finds _setup===false and no-ops.
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then(status => { if (status.state === 'granted') this._triggerGeolocate(); })
        .catch(() => {});
    }

    // Disable default shift-drag box-zoom so the custom rectangle gesture can claim it
    this._map.boxZoom.disable();

    // Attach canvas mousedown in capture phase to intercept shift-drag before other handlers
    const rectCanvas = this._map.getCanvasContainer();
    rectCanvas.addEventListener('mousedown', this._onRectMouseDown, true);

    // All source/layer setup must happen after the style loads. Unlike under
    // Mapbox — where the style came from api.mapbox.com and so an offline cold
    // start never reached 'load' at all — every style this map can be given is
    // local, including the blank fallback, so 'load' now fires offline too and
    // the occurrence layers render over blank paper. The data load stays
    // decoupled regardless (firstUpdated owns it); do not re-couple them.
    this._map.on('load', async () => {
      // Signal the map-readiness barrier (ready.ts).
      markMapReady();
      try {
        await this._dataReady;
        const geojson = this._fullGeoJSON;
        if (!geojson) return;

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
        // Wilderness no-collect overlay: no generateId — it has no click-to-select
        // feature-state (a constant warning fill), unlike the boundary sources above.
        this._map!.addSource('wilderness', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // --- Layers in render order ---
        // Compute initial visibility from URL-restored boundaryMode so layers
        // are correct from creation — avoids relying on a later setLayoutProperty
        // call that may be blocked by isStyleLoaded() returning false.
        const countyVis = this.boundaryMode === 'counties' ? 'visible' as const : 'none' as const;
        const ecoVis = this.boundaryMode === 'ecoregions' ? 'visible' as const : 'none' as const;
        const placesVis = this.boundaryMode === 'places' ? 'visible' as const : 'none' as const;
        const wildernessVis = this.boundaryMode === 'wilderness' ? 'visible' as const : 'none' as const;

        this._map!.addLayer(boundaryFillLayerSpec('ecoregions', 'ecoregion-fill', ecoVis));
        this._map!.addLayer(boundaryLineLayerSpec('ecoregions', 'ecoregion-line', ecoVis));
        this._map!.addLayer(boundaryFillLayerSpec('counties', 'county-fill', countyVis));
        this._map!.addLayer(boundaryLineLayerSpec('counties', 'county-line', countyVis));
        this._map!.addLayer(placeFillLayerSpec(placesVis));
        this._map!.addLayer(placeLineLayerSpec(placesVis));
        this._map!.addLayer(placeLabelLayerSpec(placesVis));
        this._map!.addLayer(wildernessFillLayerSpec(wildernessVis));
        this._map!.addLayer(wildernessLineLayerSpec(wildernessVis));
        this._map!.addLayer(wildernessLabelLayerSpec(wildernessVis));

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

        // Apply initial tier filter if hiddenTiers was set before map loaded
        if (this.hiddenTiers.size > 0) {
          this._applyTierFilter();
        }
      } catch (err) {
        // Map-layer setup failed (style loaded but a source/layer add threw). Data
        // already loaded + table rendered via _loadOccurrenceData, so don't blank the
        // app with a data-error — just log.
        console.error('Failed to set up map layers:', err);
      }
    });

    // moveend: emit view-moved event (outside load callback -- fires for all moves)
    this._map.on('moveend', () => {
      const center = this._map!.getCenter();
      const zoom = this._map!.getZoom();
      this._emit('view-moved', { lon: center.lng, lat: center.lat, zoom });
    });

    // --- Click interaction priority chain ---
    // One handler walking CLICK_PRIORITY_LAYERS in order, standing in for the
    // five Mapbox addInteraction handlers that chained by preventDefault().
    // The event contract to <bee-atlas> is unchanged.
    //
    // _clickConsumed is still the shift-drag guard: the rectangle gesture sets
    // it on mousedown, and a drag that ends over a point must not also select
    // that point.
    this._map.on('mousedown', () => { this._clickConsumed = false; });

    this._map.on('click', e => {
      if (this._clickConsumed) return;
      const hit = this._topFeatureAt(e.point);
      if (!hit) {
        this._emit('map-click-empty');
        return;
      }
      this._clickConsumed = true;
      const [layerId, feature] = hit;
      switch (layerId) {
        // Cluster: expand to all its leaves and show them through the
        // selected-occurrences overlay.
        case 'clusters':        void this._handleClusterClick(feature); break;
        case 'unclustered-point': void this._handlePointClick(feature); break;
        case 'county-fill':     this._handleRegionClick(feature, 'NAME', e); break;
        case 'ecoregion-fill':  this._handleRegionClick(feature, 'NA_L3NAME', e); break;
        // D-03: emits 'place-selected' with { slug }.
        case 'place-fill':      this._handlePlaceClick(feature); break;
      }
    });

    // ResizeObserver to handle container dimension changes (e.g., table-mode toggle)
    this._resizeObserver = new ResizeObserver(() => this._map?.resize());
    this._resizeObserver.observe(this.mapElement);
  }

  /**
   * D-06 seam: ask the existing Phase 152 GeolocateControl to start a location fix.
   * The blue dot + accuracy ring will appear; the resulting position is relayed upward
   * via `user-location-changed` so the state-owner (<bee-atlas>) can compute the
   * near-me bounding box (plan 153-03). This method does NOT store the position —
   * <bee-map> remains a pure presenter. Safe to call before the map exists (no-op).
   */
  public requestUserLocation(): void {
    this._triggerGeolocate();
  }

  /**
   * Start a location fix, tolerating the control not being ready yet.
   *
   * D-08 / the Phase 152 toast fix used to synthesise a `code: 1` denial here,
   * because under Mapbox trigger() returned false for an already-denied
   * permission and the control then fired no 'error' event of its own.
   * MapLibre's trigger() returns false for ONE reason — the control has not
   * finished being added to a map — and on a denied permission it starts the
   * watch anyway and lets the Geolocation API's error callback fire 'error',
   * which reaches the banner through the normal listener. So synthesising a
   * denial here would now mean reporting "permission denied" for a control that
   * was merely a beat too early. Retry once instead; the setup it is waiting on
   * is a settled promise's continuation, so one task is enough.
   */
  private _triggerGeolocate(): void {
    if (!this._geolocate) return;
    if (this._geolocate.trigger()) return;
    setTimeout(() => this._geolocate?.trigger(), 0);
  }

  // --- Private helpers ---

  /**
   * The highest-priority rendered feature under a click, or null for empty map.
   *
   * getLayer() guards each query because the occurrence layers are added on
   * 'load' and the boundary layers exist from then on but a click can land
   * before either; querying an unknown layer id is an error in MapLibre, not an
   * empty result.
   */
  private _topFeatureAt(point: maplibregl.Point): [string, maplibregl.MapGeoJSONFeature] | null {
    if (!this._map) return null;
    for (const layerId of CLICK_PRIORITY_LAYERS) {
      if (!this._map.getLayer(layerId)) continue;
      const [feature] = this._map.queryRenderedFeatures(point, { layers: [layerId] });
      if (feature) return [layerId, feature];
    }
    return null;
  }

  // Drop features whose tier the user has unchecked (Phase 170, PROV-02). Applied to the
  // source DATA (not a layer filter) so the renderer re-clusters without them — a layer
  // filter can't hide cluster bubbles, which aggregate at the source level.
  private _visibleByTier(
    features: FeatureCollection<Point, OccurrenceProperties>['features']
  ): FeatureCollection<Point, OccurrenceProperties>['features'] {
    if (this.hiddenTiers.size === 0) return features;
    return features.filter(f => !this.hiddenTiers.has(f.properties.tier));
  }

  private _applyVisibleIds() {
    if (!this._map || !this._fullGeoJSON) return;

    const occSource = this._map.getSource('occurrences') as maplibregl.GeoJSONSource | undefined;
    const ghostSource = this._map.getSource('occurrences-ghost') as maplibregl.GeoJSONSource | undefined;
    if (!occSource || !ghostSource) return;

    if (this.intendedFilterActive) {
      // Filter intended: render filteredGeoJSON if available, otherwise empty (hide-all).
      // Using ?? guarantees "filter intended but data not yet ready" renders empty — the
      // structural anti-flash guarantee (SC-3). filteredGeoJSON !== null is NOT the decision
      // criterion; intendedFilterActive is.
      const activeFeatures = (this.filteredGeoJSON ?? { type: 'FeatureCollection' as const, features: [] }).features;
      occSource.setData({
        type: 'FeatureCollection',
        features: this._visibleByTier(activeFeatures),
      });
      // Ghost: full set minus visible IDs. Only computable once filtered set + visibleIds arrive.
      if (this.filteredGeoJSON !== null && this.visibleIds !== null) {
        const ghostFeatures = this._visibleByTier(
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
        features: this._visibleByTier(this._fullGeoJSON.features),
      });
      ghostSource.setData({ type: 'FeatureCollection', features: [] });
    }

    this._applySelection();
  }

  private _applySelection() {
    if (!this._map) return;
    const selectedSource = this._map.getSource('selected-occurrences') as maplibregl.GeoJSONSource | undefined;
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

    const features = this._visibleByTier(this._fullGeoJSON.features).filter(f => {
      const id = f.properties.occId;
      if (!this.selectedOccIds!.has(id)) return false;
      return this.visibleIds === null || this.visibleIds.has(id);
    });
    selectedSource.setData({ type: 'FeatureCollection', features });
  }

  private _applyTierFilter() {
    // Re-set the source data so clusters AND unclustered points both honor the
    // hidden-tier set. _applyVisibleIds runs _visibleByTier over the data
    // and re-clusters; _applySelection drops hidden-tier points from the
    // selection overlay.
    this._applyVisibleIds();
    this._applySelection();
  }


  private async _loadBoundaryData() {
    try {
      const [countiesResp, ecoregionsResp, placesUrl, wildernessUrl] = await Promise.all([
        resolveDataUrl('counties').then(url => fetch(url!)),
        resolveDataUrl('ecoregions').then(url => fetch(url!)),
        resolveDataUrl('places'),
        resolveDataUrl('wilderness'),
      ]);
      const countiesData = await countiesResp.json();
      const ecoregionsData = await ecoregionsResp.json();
      const placesData = placesUrl
        ? await fetch(placesUrl).then(r => r.json())
        : { type: 'FeatureCollection', features: [] };
      const wildernessData = wildernessUrl
        ? await fetch(wildernessUrl).then(r => r.json())
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

      (this._map!.getSource('counties') as maplibregl.GeoJSONSource).setData(countiesData);
      (this._map!.getSource('ecoregions') as maplibregl.GeoJSONSource).setData(ecoregionsData);
      (this._map!.getSource('places') as maplibregl.GeoJSONSource).setData(placesData);
      (this._map!.getSource('wilderness') as maplibregl.GeoJSONSource).setData(wildernessData);

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
    const wildernessVis = this.boundaryMode === 'wilderness' ? 'visible' : 'none';
    this._map.setLayoutProperty('county-fill', 'visibility', countyVis);
    this._map.setLayoutProperty('county-line', 'visibility', countyVis);
    this._map.setLayoutProperty('ecoregion-fill', 'visibility', ecoVis);
    this._map.setLayoutProperty('ecoregion-line', 'visibility', ecoVis);
    this._map.setLayoutProperty('place-fill', 'visibility', placesVis);
    this._map.setLayoutProperty('place-line', 'visibility', placesVis);
    this._map.setLayoutProperty('place-label', 'visibility', placesVis);
    this._map.setLayoutProperty('wilderness-fill', 'visibility', wildernessVis);
    this._map.setLayoutProperty('wilderness-line', 'visibility', wildernessVis);
    this._map.setLayoutProperty('wilderness-label', 'visibility', wildernessVis);
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

  private async _handleClusterClick(feature: maplibregl.MapGeoJSONFeature) {
    if (!this._map) return;

    const clusterId = feature.properties?.cluster_id as number | undefined;
    const pointCount = feature.properties?.point_count as number | undefined;
    if (clusterId == null || pointCount == null) return;

    const source = this._map.getSource('occurrences') as maplibregl.GeoJSONSource;

    try {
      // Promise-based in MapLibre; the Mapbox signature took a callback.
      const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);

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

  private async _handlePointClick(feature: maplibregl.MapGeoJSONFeature) {
    const occId = feature.properties?.occId as string;
    if (!occId) return;

    // Skip ghost features (filtered out)
    if (this.visibleIds !== null && !this.visibleIds.has(occId)) return;

    const occurrences = await getOccurrences([occId]);
    if (occurrences.length === 0) return;
    this._emit('map-click-occurrence', { occurrences, occIds: [occId] });
  }

  private _handleRegionClick(
    feature: maplibregl.MapGeoJSONFeature,
    nameProperty: string,
    e: maplibregl.MapMouseEvent,
  ) {
    const name = feature.properties?.[nameProperty] as string | undefined;
    if (!name) return;

    // shiftKey toggles the region into/out of a multi-region selection. Note the
    // shift-drag gesture claims mousedown first and sets _clickConsumed, so this
    // only ever sees a shift-CLICK.
    this._emit('map-click-region', {
      name,
      shiftKey: (e.originalEvent as MouseEvent).shiftKey,
    });
  }

  private _handlePlaceClick(feature: maplibregl.MapGeoJSONFeature) {
    const slug = feature.properties?.['slug'] as string | undefined;
    if (!slug) return;

    this._emit('place-selected', { slug });
  }
}
