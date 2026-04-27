import { css, html, LitElement, unsafeCSS, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import mapboxgl from 'mapbox-gl';
import mapboxCssText from 'mapbox-gl/dist/mapbox-gl.css?raw';
import { loadOccurrenceGeoJSON, type OccurrenceProperties } from './features.ts';
import { RECENCY_COLORS } from './style.ts';
import { type FilterState } from './filter.ts';
import type { FeatureCollection, Point } from 'geojson';
import type { DataSummary, FilteredSummary } from './bee-sidebar.ts';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement;

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

  // Mapbox GL JS map instance
  private _map: mapboxgl.Map | null = null;

  // Full unfiltered GeoJSON for setData-based filtering
  private _fullGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;

  // speicmenLayer typo is intentionally deferred -- do not fix incidentally
  // @ts-ignore -- intentionally unused until specimen layer is implemented
  private speicmenLayer: unknown;

  private _resizeObserver: ResizeObserver | null = null;

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
      <style>${BeeMap._mapboxCss}</style>
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
    this._map?.remove();
    this._resizeObserver?.disconnect();
    document.removeEventListener('click', this._onDocumentClick);
    super.disconnectedCallback();
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

    // visibleIds changed: rebuild GeoJSON via setData
    if (changedProperties.has('visibleIds')) {
      this._applyVisibleIds();
    }

    // selectedOccIds changed: update selection ring filter
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
            freshCount:    ['+', ['case', ['==', ['get', 'recencyTier'], 'fresh'], 1, 0]],
            thisYearCount: ['+', ['case', ['==', ['get', 'recencyTier'], 'thisYear'], 1, 0]],
            olderCount:    ['+', ['case', ['==', ['get', 'recencyTier'], 'older'], 1, 0]],
          },
        });

        // Add unclustered ghost source for filtered-out features
        this._map!.addSource('occurrences-ghost', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // --- Layers in render order ---

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
              ['>', ['get', 'freshCount'], 0], RECENCY_COLORS.fresh,
              ['>', ['get', 'thisYearCount'], 0], RECENCY_COLORS.thisYear,
              RECENCY_COLORS.older,
            ],
            'circle-radius': [
              'step', ['get', 'point_count'],
              14,
              10, 16,
              50, 20,
              200, 26,
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
            'text-color': '#ffffff',
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
              'fresh', RECENCY_COLORS.fresh,
              'thisYear', RECENCY_COLORS.thisYear,
              RECENCY_COLORS.older,
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

        // Emit data-loaded event
        this._emit('data-loaded', { summary, taxaOptions });

        // Apply initial visibleIds if set before load completed
        if (this.visibleIds !== null) {
          this._applyVisibleIds();
        }

        // Apply initial selection if set before load completed
        if (this.selectedOccIds !== null) {
          this._applySelection();
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

    // Click handler: Phase 71 -- all clicks emit map-click-empty
    // Occurrence and region click handling deferred to Phase 72
    this._map.on('click', () => {
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
    if (!this._map?.isStyleLoaded() || !this._fullGeoJSON) return;

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
    if (!this._map?.isStyleLoaded()) return;

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
}
