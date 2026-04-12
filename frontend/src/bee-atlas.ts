import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { type FilterState, type CollectorEntry, isFilterActive, queryVisibleIds, queryTablePage, queryAllFiltered, buildCsvFilename, queryFilteredCounts, type SpecimenRow, type SampleRow } from './filter.ts';
import { buildParams, parseParams } from './url-state.ts';
import { getDuckDB, loadAllTables, tablesReady } from './duckdb.ts';
import type { Sample, Specimen, DataSummary, TaxonOption, FilteredSummary, FilterChangedEvent, SampleEvent } from './bee-sidebar.ts';
import './bee-map.ts';
import './bee-sidebar.ts';
import './bee-table.ts';

export interface FeedEntry {
  filename: string;
  url: string;
  title: string;
  filter_type: string;
  filter_value: string;
  entry_count: number;
}

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
    selectedCollectors: [],
  };

  @state() private _visibleEcdysisIds: Set<string> | null = null;
  @state() private _visibleSampleIds: Set<string> | null = null;
  @state() private _layerMode: 'specimens' | 'samples' = 'specimens';
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @state() private _viewMode: 'map' | 'table' = 'map';
  @state() private _tablePage = 1;
  @state() private _tableRows: SpecimenRow[] | SampleRow[] = [];
  @state() private _tableRowCount = 0;
  @state() private _tableLoading = false;
  @state() private _selectedSamples: Sample[] | null = null;
  @state() private _selectedSampleEvent: SampleEvent | null = null;
  @state() private _selectedOccIds: string[] | null = null;
  @state() private _summary: DataSummary | null = null;
  @state() private _filteredSummary: FilteredSummary | null = null;
  @state() private _taxaOptions: TaxonOption[] = [];
  @state() private _countyOptions: string[] = [];
  @state() private _ecoregionOptions: string[] = [];
  @state() private _collectorOptions: CollectorEntry[] = [];
  @state() private _sampleDataLoaded = false;
  @state() private _recentSampleEvents: SampleEvent[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _viewState: { lon: number; lat: number; zoom: number } | null = null;
  @state() private _panTo: { coordinate: number[]; zoom: number } | null = null;
  @state() private _activeFeedEntries: FeedEntry[] = [];

  // Non-reactive private fields
  private _isRestoringFromHistory = false;
  private _feedIndex: Map<string, FeedEntry> = new Map();
  private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  // Monotonic counter used to discard stale async filter-query results.
  // Root cause of chip-removal flicker: _filterState updates synchronously (Lit
  // re-render + bee-map.updated() → regionLayer.changed() → OL canvas repaint)
  // while _runFilterQuery is async. When the previous query resolves it would
  // overwrite _visibleEcdysisIds/_visibleSampleIds with stale data, causing a
  // flash of the wrong filter state. The generation guard ensures only the
  // most-recently-started query can commit its result.
  private _filterQueryGeneration = 0;
  private _tableQueryGeneration = 0;
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
bee-table {
  flex-grow: 1;
  min-width: 0;
  position: relative;
}
bee-sidebar {
  flex-shrink: 0;
  width: 25rem;
  border-left: 1px solid var(--border-input);
  overflow-y: auto;
  scrollbar-gutter: stable;
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

  render() {
    return html`
      ${this._error ? html`<div class="error-overlay">${this._error}</div>` : ''}
      ${this._loading ? html`<div class="loading-overlay">Loading\u2026</div>` : ''}
      ${this._error ? '' : html`
        ${this._viewMode === 'map'
          ? html`<bee-map
              .layerMode=${this._layerMode}
              .boundaryMode=${this._boundaryMode}
              .visibleEcdysisIds=${this._visibleEcdysisIds}
              .visibleSampleIds=${this._visibleSampleIds}
              .selectedOccIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
              .countyOptions=${this._countyOptions}
              .ecoregionOptions=${this._ecoregionOptions}
              .viewState=${this._viewState}
              .panTo=${this._panTo}
              .filterState=${this._filterState}
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
              @boundary-mode-changed=${this._onBoundaryModeChanged}
            ></bee-map>`
          : html`<bee-table
              .rows=${this._tableRows}
              .rowCount=${this._tableRowCount}
              .layerMode=${this._layerMode}
              .page=${this._tablePage}
              .loading=${this._tableLoading}
              @page-changed=${this._onPageChanged}
              @download-csv=${this._onDownloadCsv}
            ></bee-table>`
        }
        <bee-sidebar
          .samples=${this._selectedSamples}
          .summary=${this._summary}
          .taxaOptions=${this._taxaOptions}
          .filteredSummary=${this._filteredSummary}
          .layerMode=${this._layerMode}
          .viewMode=${this._viewMode}
          .recentSampleEvents=${this._visibleSampleIds !== null
            ? this._recentSampleEvents.filter(e => this._visibleSampleIds!.has(`inat:${e.observation_id}`))
            : this._recentSampleEvents}
          .sampleDataLoaded=${this._sampleDataLoaded}
          .selectedSampleEvent=${this._selectedSampleEvent}
          .filterState=${this._filterState}
          .countyOptions=${this._countyOptions}
          .ecoregionOptions=${this._ecoregionOptions}
          .collectorOptions=${this._collectorOptions}
          .activeFeedEntries=${this._activeFeedEntries}
          @close=${this._onClose}
          @filter-changed=${this._onFilterChanged}
          @layer-changed=${this._onLayerChanged}
          @view-changed=${this._onViewChanged}
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

    // Restore layer/boundary/view mode from URL
    const initLayerMode = initialParams.ui?.layerMode ?? 'specimens';
    const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
    const initViewMode = initialParams.ui?.viewMode ?? 'map';
    this._layerMode = initLayerMode;
    this._boundaryMode = initBoundaryMode;
    this._viewMode = initViewMode;
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
        selectedCollectors: initFilter.selectedCollectors ?? [],
      };
    }

    // If URL restores an active filter, initialize visible ID sets to empty (hide-all)
    // so no dots flash before the async filter query completes.
    if (isFilterActive(this._filterState)) {
      this._visibleEcdysisIds = new Set();
      this._visibleSampleIds = new Set();
    }

    // Start filter query early — queryVisibleIds awaits tablesReady internally,
    // so this runs in parallel with DuckDB init and resolves as soon as tables load.
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
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
      { layerMode: initLayerMode, boundaryMode: initBoundaryMode, viewMode: initViewMode }
    );
    window.history.replaceState({}, '', '?' + initParams.toString());

    // Initialize DuckDB
    getDuckDB()
      .then(db => loadAllTables(db, DATA_BASE_URL))
      .then(() => {
        console.debug('DuckDB tables ready');
        if (this._viewMode === 'table') {
          this._loadSummaryFromDuckDB();
          this._runTableQuery();
        }
      })
      .catch((err: unknown) => {
        console.error('DuckDB init failed:', err);
        this._error = err instanceof Error ? err.message : String(err);
        this._loading = false;
      });

    // Register popstate handler for browser back/forward navigation
    window.addEventListener('popstate', this._onPopState);

    // Fetch feed index for sidebar feed discovery (D-07, D-10)
    fetch('/data/feeds/index.json')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((entries: FeedEntry[]) => {
        this._feedIndex = new Map(entries.map(e => [e.filter_value, e]));
        this._computeActiveFeedEntries(); // handles URL-restored filter state (Pitfall 2)
      })
      .catch(() => {}); // D-10: silent failure, feature simply absent
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

  private _computeActiveFeedEntries(): void {
    const entries = this._filterState.selectedCollectors
      .map(c => c.recordedBy ? this._feedIndex.get(c.recordedBy) : undefined)
      .filter((e): e is FeedEntry => e !== undefined);
    this._activeFeedEntries = entries;
  }

  private async _runFilterQuery(): Promise<void> {
    const generation = ++this._filterQueryGeneration;
    const { ecdysis, samples } = await queryVisibleIds(this._filterState);
    // Discard result if a newer query has started since this one began.
    if (generation !== this._filterQueryGeneration) return;
    this._visibleEcdysisIds = ecdysis;
    this._visibleSampleIds = samples;
  }

  private async _loadSummaryFromDuckDB(): Promise<void> {
    await tablesReady;
    const db = await getDuckDB();
    const conn = await db.connect();
    try {
      const summaryResult = await conn.query(`
        SELECT COUNT(*) AS total_specimens,
               COUNT(DISTINCT scientificName) AS species_count,
               COUNT(DISTINCT genus) AS genus_count,
               COUNT(DISTINCT family) AS family_count,
               MIN(year) AS earliest_year,
               MAX(year) AS latest_year
        FROM ecdysis
      `);
      const row = summaryResult.toArray()[0]?.toJSON();
      if (!row) { this._loading = false; return; }
      this._summary = {
        totalSpecimens: Number(row.total_specimens),
        speciesCount: Number(row.species_count),
        genusCount: Number(row.genus_count),
        familyCount: Number(row.family_count),
        earliestYear: Number(row.earliest_year),
        latestYear: Number(row.latest_year),
      };

      const taxaResult = await conn.query(
        `SELECT DISTINCT family, genus, scientificName FROM ecdysis ORDER BY family, genus, scientificName`
      );
      const families = new Set<string>();
      const genera = new Set<string>();
      const species = new Set<string>();
      for (const r of taxaResult.toArray()) {
        const obj = r.toJSON() as Record<string, unknown>;
        if (obj.family) families.add(String(obj.family));
        if (obj.genus) genera.add(String(obj.genus));
        if (obj.scientificName) species.add(String(obj.scientificName));
      }
      this._taxaOptions = [
        ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
        ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
        ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
      ];

      const countyResult = await conn.query(
        `SELECT DISTINCT county FROM ecdysis WHERE county IS NOT NULL ORDER BY county`
      );
      this._countyOptions = countyResult.toArray().map(r => String((r.toJSON() as Record<string, unknown>).county));

      const ecoregionResult = await conn.query(
        `SELECT DISTINCT ecoregion_l3 FROM ecdysis WHERE ecoregion_l3 IS NOT NULL ORDER BY ecoregion_l3`
      );
      this._ecoregionOptions = ecoregionResult.toArray().map(r => String((r.toJSON() as Record<string, unknown>).ecoregion_l3));

      const collectorResult = await conn.query(`
        SELECT e.recordedBy, MIN(s.observer) AS observer
        FROM ecdysis e
        LEFT JOIN samples s ON e.inat_observation_id = s.observation_id
        WHERE e.recordedBy IS NOT NULL
        GROUP BY e.recordedBy
        ORDER BY e.recordedBy
      `);
      this._collectorOptions = collectorResult.toArray().map(r => {
        const obj = r.toJSON() as Record<string, unknown>;
        const recordedBy = String(obj.recordedBy);
        const observer = obj.observer != null ? String(obj.observer) : null;
        return { displayName: recordedBy, recordedBy, observer } satisfies CollectorEntry;
      });
    } catch (err) {
      console.error('Failed to load summary from DuckDB:', err);
    } finally {
      await conn.close();
      this._loading = false;
    }
  }

  private async _loadCollectorOptions(): Promise<void> {
    await tablesReady;
    const db = await getDuckDB();
    const conn = await db.connect();
    try {
      // Join ecdysis → samples via inat_observation_id to map collector names to iNat usernames.
      // DISTINCT because one collector may have many specimens; take any matching observer per name.
      const result = await conn.query(`
        SELECT e.recordedBy, MIN(s.observer) AS observer
        FROM ecdysis e
        LEFT JOIN samples s ON e.inat_observation_id = s.observation_id
        WHERE e.recordedBy IS NOT NULL
        GROUP BY e.recordedBy
        ORDER BY e.recordedBy
      `);
      this._collectorOptions = result.toArray().map(r => {
        const obj = r.toJSON() as Record<string, unknown>;
        const recordedBy = String(obj.recordedBy);
        const observer = obj.observer != null ? String(obj.observer) : null;
        return { displayName: recordedBy, recordedBy, observer } satisfies CollectorEntry;
      });
    } finally {
      await conn.close();
    }
  }

  private async _runTableQuery(): Promise<void> {
    if (this._viewMode !== 'table') return;
    this._tableLoading = true;
    const generation = ++this._tableQueryGeneration;
    try {
      const { rows, total } = await queryTablePage(
        this._filterState, this._layerMode, this._tablePage
      );
      if (generation !== this._tableQueryGeneration) return;
      this._tableRows = rows;
      this._tableRowCount = total;
    } catch (err) {
      console.error('Table query failed:', err);
      if (generation !== this._tableQueryGeneration) return;
      this._tableRows = [];
      this._tableRowCount = 0;
    } finally {
      if (generation === this._tableQueryGeneration) {
        this._tableLoading = false;
      }
    }
  }

  // --- URL state ---

  private _pushUrlState() {
    const params = buildParams(
      this._currentView,
      this._filterState,
      { occurrenceIds: this._selectedOccIds ?? [] },
      { layerMode: this._layerMode, boundaryMode: this._boundaryMode, viewMode: this._viewMode }
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
      selectedCollectors: parsed.filter?.selectedCollectors ?? [],
    };

    // Restore UI state
    this._layerMode = parsed.ui?.layerMode ?? 'specimens';
    this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';
    this._viewMode = parsed.ui?.viewMode ?? 'map';
    this._tablePage = 1;
    if (this._viewMode === 'table') {
      this._runTableQuery();
    }

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
    // Known limitation: sample event selection is not URL-persisted.
    // The 'o=' param only serializes ecdysis: specimen IDs; inat: sample events
    // are not included, so navigating back will restore map/filter state but
    // the sample event panel will be blank.
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

    this._filterState = {
      taxonName: detail.taxonName,
      taxonRank: detail.taxonRank,
      yearFrom: detail.yearFrom,
      yearTo: detail.yearTo,
      months: detail.months,
      selectedCounties: detail.selectedCounties,
      selectedEcoregions: detail.selectedEcoregions,
      selectedCollectors: detail.selectedCollectors,
    };

    // Clear selections when filter changes
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;

    this._tablePage = 1;  // per D-09
    this._computeActiveFeedEntries();
    this._runFilterQuery().then(() => {
      this._pushUrlState();
    });
    this._runTableQuery();
    if (this._viewMode === 'table' && this._summary) {
      queryFilteredCounts(this._filterState).then(c => {
        if (c && this._summary) {
          this._filteredSummary = { ...c, total: this._summary, isActive: true };
        } else {
          this._filteredSummary = null;
        }
      });
    }
  }

  private _onLayerChanged(e: CustomEvent<'specimens' | 'samples'>) {
    this._layerMode = e.detail;
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;
    this._tablePage = 1;
    this._runTableQuery();
    if (this._viewMode === 'table' && this._summary) {
      queryFilteredCounts(this._filterState).then(c => {
        if (c && this._summary) this._filteredSummary = { ...c, total: this._summary, isActive: true };
      });
    }
    this._pushUrlState();
  }

  private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
    this._viewMode = e.detail;
    if (this._viewMode === 'table') {
      this._tableLoading = true;
      this._runTableQuery();
      if (this._loading) {
        // bee-map data-loaded hasn't fired yet; load summary from DuckDB
        this._loadSummaryFromDuckDB();
      }
    }
    this._pushUrlState();
  }

  private _onPageChanged(e: CustomEvent<{ page: number }>) {
    this._tablePage = e.detail.page;
    this._runTableQuery();
  }

  private async _onDownloadCsv() {
    try {
      const rows = await queryAllFiltered(this._filterState, this._layerMode);
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]!);
      const csvLines = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = row[h];
            const str = val == null ? '' : String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? '"' + str.replace(/"/g, '""') + '"'
              : str;
          }).join(',')
        ),
      ];
      const csvContent = csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const filename = buildCsvFilename(this._filterState, this._layerMode);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download failed:', err);
    }
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
    this._loadCollectorOptions();

    // If filter was restored from URL, run the filter query now that data is loaded
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }

    // If table view is active, run table query now that data is loaded
    if (this._viewMode === 'table') {
      this._runTableQuery();
    }

    // If occurrences were restored from URL, fetch their specimen data now that DuckDB is ready
    if (this._selectedOccIds && this._selectedOccIds.length > 0 && this._selectedSamples === null) {
      this._restoreSelectionSamples(this._selectedOccIds);
    }
  }

  private async _restoreSelectionSamples(occIds: string[]) {
    const ecdysisIds = occIds
      .filter(id => id.startsWith('ecdysis:'))
      .map(id => id.slice('ecdysis:'.length))
      .filter(id => /^\d+$/.test(id));  // only accept pure integer suffixes (CLAUDE.md: ecdysis IDs are ecdysis:<integer>)
    if (ecdysisIds.length === 0) return;
    let conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDuckDB>>['connect']>> | null = null;
    try {
      const db = await getDuckDB();
      conn = await db.connect();
      const idList = ecdysisIds.map(id => `'${id}'`).join(',');
      const result = await conn.query(`
        SELECT ecdysis_id, year, month, scientificName, recordedBy, fieldNumber,
               inat_observation_id, floralHost, inat_host, inat_quality_grade
        FROM ecdysis
        WHERE CAST(ecdysis_id AS VARCHAR) IN (${idList})
      `);
      const map = new Map<string, Sample>();
      for (const row of result.toArray()) {
        const obj = row.toJSON();
        const key = `${obj.year}-${obj.month}-${obj.recordedBy}-${obj.fieldNumber}`;
        if (!map.has(key)) {
          map.set(key, {
            year: Number(obj.year),
            month: Number(obj.month),
            recordedBy: String(obj.recordedBy),
            fieldNumber: String(obj.fieldNumber),
            species: [],
          });
        }
        const specimen: Specimen = {
          name: String(obj.scientificName),
          occid: String(obj.ecdysis_id),
          inatObservationId: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null,
          floralHost: obj.floralHost ?? null,
          inatHost: obj.inat_host ?? null,
          inatQualityGrade: obj.inat_quality_grade ?? null,
        };
        map.get(key)!.species.push(specimen);
      }
      this._selectedSamples = [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
    } catch (err) {
      console.error('Failed to restore selection from URL:', err);
    } finally {
      if (conn) await conn.close();
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

  private _onBoundaryModeChanged(e: CustomEvent<'off' | 'counties' | 'ecoregions'>) {
    this._boundaryMode = e.detail;
    this._pushUrlState();
  }
}
