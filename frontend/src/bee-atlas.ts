import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { type FilterState, isFilterActive, queryVisibleIds } from './filter.ts';
import { buildParams, parseParams } from './url-state.ts';
import { getDuckDB, loadAllTables } from './duckdb.ts';
import type { Sample, DataSummary, TaxonOption, FilteredSummary, FilterChangedEvent, SampleEvent } from './bee-sidebar.ts';
import './bee-map.ts';
import './bee-sidebar.ts';

const DATA_BASE_URL = (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? 'https://beeatlas.net/data';
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

@customElement('bee-atlas')
export class BeeAtlas extends LitElement {
  // App-level state — all formerly on BeeMap, now owned here
  @state() private _filterState: FilterState = {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
  };

  @state() private _visibleEcdysisIds: Set<string> | null = null;
  @state() private _visibleSampleIds: Set<string> | null = null;
  @state() private _layerMode: 'specimens' | 'samples' = 'specimens';
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @state() private _selectedSamples: Sample[] | null = null;
  @state() private _selectedSampleEvent: SampleEvent | null = null;
  @state() private _selectedOccIds: string[] | null = null;
  @state() private _summary: DataSummary | null = null;
  @state() private _filteredSummary: FilteredSummary | null = null;
  @state() private _taxaOptions: TaxonOption[] = [];
  @state() private _countyOptions: string[] = [];
  @state() private _ecoregionOptions: string[] = [];
  @state() private _sampleDataLoaded = false;
  @state() private _recentSampleEvents: SampleEvent[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _viewState: { lon: number; lat: number; zoom: number } | null = null;
  @state() private _panTo: { coordinate: number[]; zoom: number } | null = null;

  // Non-reactive private fields
  private _isRestoringFromHistory = false;
  private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  private _currentView: { lon: number; lat: number; zoom: number } = {
    lon: DEFAULT_LON,
    lat: DEFAULT_LAT,
    zoom: DEFAULT_ZOOM,
  };

  static styles = css`
:host {
  align-items: stretch;
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: auto;
  position: relative;
}
bee-map {
  flex-grow: 1;
}
bee-sidebar {
  width: 25rem;
  border-left: 1px solid var(--border-input);
  overflow-y: auto;
}
.loading-overlay, .error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: var(--surface-overlay);
  z-index: 10;
}
.error-overlay {
  color: var(--error);
}
@media (max-aspect-ratio: 1) {
  :host {
    flex-direction: column;
  }
  bee-map {
    height: 50svh;
    flex-grow: 0;
    flex-shrink: 0;
  }
  bee-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border-input);
    flex-grow: 1;
  }
}
  `;

  private _getRestoredTaxonInput(): string {
    if (!this._filterState.taxonName) return '';
    const opt = this._taxaOptions.find(
      o => o.name === this._filterState.taxonName && o.rank === this._filterState.taxonRank
    );
    return opt?.label ?? this._filterState.taxonName;
  }

  render() {
    return html`
      ${this._error ? html`<div class="error-overlay">${this._error}</div>` : ''}
      ${this._loading ? html`<div class="loading-overlay">Loading\u2026</div>` : ''}
      ${this._error ? '' : html`
        <bee-map
          .layerMode=${this._layerMode}
          .boundaryMode=${this._boundaryMode}
          .visibleEcdysisIds=${this._visibleEcdysisIds}
          .visibleSampleIds=${this._visibleSampleIds}
          .countyOptions=${this._countyOptions}
          .ecoregionOptions=${this._ecoregionOptions}
          .viewState=${this._viewState}
          .panTo=${this._panTo}
          @view-moved=${this._onViewMoved}
          @map-click-specimen=${this._onSpecimenClick}
          @map-click-sample=${this._onSampleClick}
          @map-click-region=${this._onRegionClick}
          @map-click-empty=${this._onMapClickEmpty}
          @data-loaded=${this._onDataLoaded}
          @sample-data-loaded=${this._onSampleDataLoaded}
          @county-options-loaded=${this._onCountyOptionsLoaded}
          @ecoregion-options-loaded=${this._onEcoregionOptionsLoaded}
          @data-error=${this._onDataError}
          @filtered-summary-computed=${this._onFilteredSummaryComputed}
        ></bee-map>
        <bee-sidebar
          .samples=${this._selectedSamples}
          .summary=${this._summary}
          .taxaOptions=${this._taxaOptions}
          .filteredSummary=${this._filteredSummary}
          .layerMode=${this._layerMode}
          .recentSampleEvents=${this._recentSampleEvents}
          .sampleDataLoaded=${this._sampleDataLoaded}
          .selectedSampleEvent=${this._selectedSampleEvent}
          .restoredTaxonInput=${this._getRestoredTaxonInput()}
          .restoredTaxonRank=${this._filterState.taxonRank}
          .restoredTaxonName=${this._filterState.taxonName}
          .restoredYearFrom=${this._filterState.yearFrom}
          .restoredYearTo=${this._filterState.yearTo}
          .restoredMonths=${this._filterState.months}
          .boundaryMode=${this._boundaryMode}
          .countyOptions=${this._countyOptions}
          .ecoregionOptions=${this._ecoregionOptions}
          .restoredCounties=${this._filterState.selectedCounties}
          .restoredEcoregions=${this._filterState.selectedEcoregions}
          @close=${this._onClose}
          @filter-changed=${this._onFilterChanged}
          @layer-changed=${this._onLayerChanged}
          @sample-event-click=${this._onSampleEventClick}
        ></bee-sidebar>
      `}
    `;
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    const initialParams = parseParams(window.location.search);

    // Set initial view state from URL (or defaults)
    const initLon = initialParams.view?.lon ?? DEFAULT_LON;
    const initLat = initialParams.view?.lat ?? DEFAULT_LAT;
    const initZoom = initialParams.view?.zoom ?? DEFAULT_ZOOM;
    this._currentView = { lon: initLon, lat: initLat, zoom: initZoom };
    this._viewState = { lon: initLon, lat: initLat, zoom: initZoom };

    // Restore layer/boundary mode from URL
    const initLayerMode = initialParams.ui?.layerMode ?? 'specimens';
    const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
    this._layerMode = initLayerMode;
    this._boundaryMode = initBoundaryMode;

    // Restore filter state from URL params
    const initFilter = initialParams.filter;
    if (initFilter) {
      this._filterState = {
        taxonName: initFilter.taxonName ?? null,
        taxonRank: initFilter.taxonRank ?? null,
        yearFrom: initFilter.yearFrom ?? null,
        yearTo: initFilter.yearTo ?? null,
        months: initFilter.months ?? new Set(),
        selectedCounties: initFilter.selectedCounties ?? new Set(),
        selectedEcoregions: initFilter.selectedEcoregions ?? new Set(),
      };
    }

    // Restore selected occurrences from URL
    const initOccIds = initialParams.selection?.occurrenceIds ?? [];
    if (initOccIds.length > 0) {
      this._selectedOccIds = initOccIds;
    }

    // Write initial URL state (covers fresh loads — makes URL bar show params immediately)
    const initParams = buildParams(
      { lon: initLon, lat: initLat, zoom: initZoom },
      this._filterState,
      { occurrenceIds: initOccIds },
      { layerMode: initLayerMode, boundaryMode: initBoundaryMode }
    );
    window.history.replaceState({}, '', '?' + initParams.toString());

    // Initialize DuckDB
    getDuckDB()
      .then(db => loadAllTables(db, DATA_BASE_URL))
      .then(() => {
        console.debug('DuckDB tables ready');
      })
      .catch((err: unknown) => {
        console.error('DuckDB init failed:', err);
        this._error = err instanceof Error ? err.message : String(err);
        this._loading = false;
      });

    // Register popstate handler for browser back/forward navigation
    window.addEventListener('popstate', this._onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onPopState);
    if (this._mapMoveDebounce) {
      clearTimeout(this._mapMoveDebounce);
      this._mapMoveDebounce = null;
    }
  }

  // --- Filter query ---

  private async _runFilterQuery(): Promise<void> {
    const { ecdysis, samples } = await queryVisibleIds(this._filterState);
    this._visibleEcdysisIds = ecdysis;
    this._visibleSampleIds = samples;
  }

  // --- URL state ---

  private _pushUrlState() {
    const params = buildParams(
      this._currentView,
      this._filterState,
      { occurrenceIds: this._selectedOccIds ?? [] },
      { layerMode: this._layerMode, boundaryMode: this._boundaryMode }
    );
    window.history.replaceState({}, '', '?' + params.toString());
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  }

  private _onPopState = () => {
    this._isRestoringFromHistory = true;
    if (this._mapMoveDebounce) {
      clearTimeout(this._mapMoveDebounce);
      this._mapMoveDebounce = null;
    }
    const parsed = parseParams(window.location.search);
    const lon = parsed.view?.lon ?? DEFAULT_LON;
    const lat = parsed.view?.lat ?? DEFAULT_LAT;
    const zoom = parsed.view?.zoom ?? DEFAULT_ZOOM;

    // Update view state — bee-map's updated() will apply to OL map
    this._viewState = { lon, lat, zoom };
    this._currentView = { lon, lat, zoom };

    // Restore filter state
    this._filterState = {
      taxonName: parsed.filter?.taxonName ?? null,
      taxonRank: parsed.filter?.taxonRank ?? null,
      yearFrom: parsed.filter?.yearFrom ?? null,
      yearTo: parsed.filter?.yearTo ?? null,
      months: parsed.filter?.months ?? new Set(),
      selectedCounties: parsed.filter?.selectedCounties ?? new Set(),
      selectedEcoregions: parsed.filter?.selectedEcoregions ?? new Set(),
    };

    // Restore UI state
    this._layerMode = parsed.ui?.layerMode ?? 'specimens';
    this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';

    // Restore selection
    const parsedOccIds = parsed.selection?.occurrenceIds ?? [];
    if (parsedOccIds.length > 0) {
      this._selectedOccIds = parsedOccIds;
      // bee-map will resolve these to features when it receives the property
    } else {
      this._selectedSamples = null;
      this._selectedOccIds = null;
      this._selectedSampleEvent = null;
    }

    // Run filter query for restored state
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    } else {
      this._visibleEcdysisIds = null;
      this._visibleSampleIds = null;
      this._filteredSummary = null;
    }
  };

  // --- Event handlers from bee-map ---

  private _onViewMoved(e: CustomEvent<{ lon: number; lat: number; zoom: number }>) {
    this._currentView = e.detail;
    if (!this._isRestoringFromHistory) {
      this._pushUrlState();
    } else {
      // Reset the flag after bee-map reports the view has settled
      this._isRestoringFromHistory = false;
    }
  }

  private _onSpecimenClick(e: CustomEvent<{ samples: Sample[]; occIds: string[] }>) {
    this._selectedSamples = e.detail.samples;
    this._selectedOccIds = e.detail.occIds;
    this._selectedSampleEvent = null;
    this._pushUrlState();
  }

  private _onSampleClick(e: CustomEvent<SampleEvent>) {
    this._selectedSampleEvent = e.detail;
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._pushUrlState();
  }

  private _onRegionClick(e: CustomEvent<{ name: string; shiftKey: boolean }>) {
    const { name, shiftKey } = e.detail;
    const isCounty = this._boundaryMode === 'counties';

    if (!shiftKey) {
      // Single-select: replace current selection with this region.
      // If this region was already the sole selection, clear it (toggle off).
      const currentSet = isCounty
        ? this._filterState.selectedCounties
        : this._filterState.selectedEcoregions;
      const wasOnlySelection = currentSet.size === 1 && currentSet.has(name);
      if (isCounty) {
        this._filterState = {
          ...this._filterState,
          selectedCounties: wasOnlySelection ? new Set() : new Set([name]),
          selectedEcoregions: new Set(), // clear cross-type on replace
        };
      } else {
        this._filterState = {
          ...this._filterState,
          selectedEcoregions: wasOnlySelection ? new Set() : new Set([name]),
          selectedCounties: new Set(), // clear cross-type on replace
        };
      }
    } else {
      // Shift-click: add to or remove from current selection (multi-select).
      const targetSet = isCounty
        ? this._filterState.selectedCounties
        : this._filterState.selectedEcoregions;
      const newSet = new Set(targetSet);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      if (isCounty) {
        this._filterState = { ...this._filterState, selectedCounties: newSet };
      } else {
        this._filterState = { ...this._filterState, selectedEcoregions: newSet };
      }
    }

    this._runFilterQuery().then(() => {
      this._pushUrlState();
    });
  }

  private _onMapClickEmpty() {
    if (this._boundaryMode !== 'off') {
      // Clear region filter
      this._filterState = {
        ...this._filterState,
        selectedCounties: new Set(),
        selectedEcoregions: new Set(),
      };
      this._runFilterQuery().then(() => {
        this._pushUrlState();
      });
    } else {
      // Clear selection
      this._selectedSamples = null;
      this._selectedOccIds = null;
      this._selectedSampleEvent = null;
      this._pushUrlState();
    }
  }

  private _onFilterChanged(e: CustomEvent<FilterChangedEvent>) {
    const detail = e.detail;
    const newBoundaryMode = detail.boundaryMode;

    this._filterState = {
      taxonName: detail.taxonName,
      taxonRank: detail.taxonRank,
      yearFrom: detail.yearFrom,
      yearTo: detail.yearTo,
      months: detail.months,
      selectedCounties: detail.selectedCounties,
      selectedEcoregions: detail.selectedEcoregions,
    };

    if (newBoundaryMode !== this._boundaryMode) {
      this._boundaryMode = newBoundaryMode;
    }

    // Clear selections when filter changes
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;

    this._runFilterQuery().then(() => {
      this._pushUrlState();
    });
  }

  private _onLayerChanged(e: CustomEvent<'specimens' | 'samples'>) {
    this._layerMode = e.detail;
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;
    this._pushUrlState();
  }

  private _onSampleEventClick(e: CustomEvent<{ coordinate: number[] }>) {
    this._panTo = { coordinate: e.detail.coordinate, zoom: 12 };
  }

  private _onClose() {
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;
    this._pushUrlState();
  }

  private _onDataLoaded(e: CustomEvent<{ summary: DataSummary; taxaOptions: TaxonOption[] }>) {
    this._summary = e.detail.summary;
    this._taxaOptions = e.detail.taxaOptions;
    this._loading = false;

    // If filter was restored from URL, run the filter query now that data is loaded
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }
  }

  private _onFilteredSummaryComputed(e: CustomEvent<{ filteredSummary: FilteredSummary | null }>) {
    this._filteredSummary = e.detail.filteredSummary;
  }

  private _onSampleDataLoaded(e: CustomEvent<{ recentEvents: SampleEvent[] }>) {
    this._sampleDataLoaded = true;
    this._recentSampleEvents = e.detail.recentEvents;
    this._loading = false;

    // Apply filter to samples if filter is active
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }
  }

  private _onCountyOptionsLoaded(e: CustomEvent<{ options: string[] }>) {
    this._countyOptions = e.detail.options;
  }

  private _onEcoregionOptionsLoaded(e: CustomEvent<{ options: string[] }>) {
    this._ecoregionOptions = e.detail.options;
  }

  private _onDataError(e: CustomEvent<{ message: string }>) {
    this._error = e.detail.message;
    this._loading = false;
  }
}
