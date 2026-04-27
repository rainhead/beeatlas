import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { type FilterState, type CollectorEntry, isFilterActive, queryVisibleIds, queryTablePage, queryAllFiltered, buildCsvFilename, type OccurrenceRow, OCCURRENCE_COLUMNS, type SpecimenSortBy } from './filter.ts';
import { buildParams, parseParams } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';
import './bee-header.ts';
import './bee-filter-panel.ts';
import './bee-map.ts';

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
    elevMin: null,
    elevMax: null,
  };

  @state() private _visibleIds: Set<string> | null = null;
  @state() private _filteredRowCount: number | null = null;
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @state() private _viewMode: 'map' | 'table' = 'map';
  @state() private _tablePage = 1;
  @state() private _tableSortBy: SpecimenSortBy = 'date';
  @state() private _tableRows: OccurrenceRow[] = [];
  @state() private _tableRowCount = 0;
  @state() private _tableLoading = false;
  @state() private _selectedOccurrences: OccurrenceRow[] | null = null;
  @state() private _selectedOccIds: string[] | null = null;
  @state() private _selectedCluster: { lon: number; lat: number; radiusM: number } | null = null;
  @state() private _summary: DataSummary | null = null;
  @state() private _taxaOptions: TaxonOption[] = [];
  @state() private _countyOptions: string[] = [];
  @state() private _ecoregionOptions: string[] = [];
  @state() private _collectorOptions: CollectorEntry[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _viewState: { lon: number; lat: number; zoom: number } | null = null;
  @state() private _sidebarOpen = false;
  @state() private _tableFilterOpen = false;

  // Non-reactive private fields
  private _isRestoringFromHistory = false;
  private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  // Monotonic counter used to discard stale async filter-query results.
  // Root cause of chip-removal flicker: _filterState updates synchronously (Lit
  // re-render + bee-map.updated() → regionLayer.changed() → OL canvas repaint)
  // while _runFilterQuery is async. When the previous query resolves it would
  // overwrite _visibleIds with stale data, causing a flash of the wrong filter
  // state. The generation guard ensures only the most-recently-started query
  // can commit its result.
  private _filterQueryGeneration = 0;
  private _tableQueryGeneration = 0;
  private _currentView: { lon: number; lat: number; zoom: number } = {
    lon: DEFAULT_LON,
    lat: DEFAULT_LAT,
    zoom: DEFAULT_ZOOM,
  };

  static styles = css`
:host {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
}
.content {
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
  min-height: 0;
}
.content.table-mode {
  flex-direction: column;
}
.content.table-mode bee-map {
  height: 18%;
  flex-grow: 0;
  flex-shrink: 0;
  min-height: 0;
}
bee-sidebar {
  right: 0.5em;
  top: calc(0.5em + 2.5rem + 2.5rem + 0.5em);
  width: 25rem;
  bottom: 0.5em;
}
bee-filter-panel {
  right: 0.5em;
  top: calc(0.5em + 2.5rem);
}
.content.table-mode bee-filter-panel {
  top: auto;
  right: auto;
  left: 0.5em;
  bottom: 3.5rem;
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
  .content {
    flex-direction: column;
  }
  bee-sidebar {
    position: static;
    right: auto;
    top: auto;
    bottom: auto;
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border-input);
    flex-grow: 1;
  }
}
  `;

  render() {
    return html`
      <bee-header
        .viewMode=${this._viewMode}
        @view-changed=${this._onViewChanged}
      ></bee-header>
      ${this._error ? html`<div class="error-overlay">${this._error}</div>` : ''}
      ${this._loading ? html`<div class="loading-overlay">Loading\u2026</div>` : ''}
      ${this._error ? '' : html`
        <div class="${this._viewMode === 'table' ? 'content table-mode' : 'content'}">
          <bee-map
            .boundaryMode=${this._boundaryMode}
            .visibleIds=${this._visibleIds}
            .selectedOccIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .viewState=${this._viewState}
            .filterState=${this._filterState}
            @view-moved=${this._onViewMoved}
            @map-click-occurrence=${this._onOccurrenceClick}
            @map-click-region=${this._onRegionClick}
            @map-click-empty=${this._onMapClickEmpty}
            @data-loaded=${this._onDataLoaded}
            @data-error=${this._onDataError}
            @boundary-mode-changed=${this._onBoundaryModeChanged}
          ></bee-map>
          ${this._viewMode === 'table' ? html`<bee-table
            .rows=${this._tableRows}
            .rowCount=${this._tableRowCount}
            .page=${this._tablePage}
            .loading=${this._tableLoading}
            .sortBy=${this._tableSortBy}
            .filterActive=${isFilterActive(this._filterState)}
            .selectedIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
            @page-changed=${this._onPageChanged}
            @download-csv=${this._onDownloadCsv}
            @sort-changed=${this._onSortChanged}
            @row-pan=${this._onRowPan}
            @toggle-filter=${this._onToggleFilter}
          ></bee-table>` : nothing}
          <bee-filter-panel
            .filterState=${this._filterState}
            .taxaOptions=${this._taxaOptions}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .collectorOptions=${this._collectorOptions}
            .summary=${this._summary}
            .specimenCount=${isFilterActive(this._filterState) ? this._filteredRowCount : null}
            .hideButton=${this._viewMode === 'table'}
            .externalOpen=${this._tableFilterOpen}
            .openUpward=${this._viewMode === 'table'}
            @filter-changed=${this._onFilterChanged}
          ></bee-filter-panel>
          ${this._viewMode === 'map' && this._sidebarOpen ? html`<bee-sidebar
            .occurrences=${this._selectedOccurrences}
            @close=${this._onClose}
          ></bee-sidebar>` : nothing}
        </div>
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

    // Restore boundary/view mode from URL
    const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
    const initViewMode = initialParams.ui?.viewMode ?? 'map';
    this._boundaryMode = initBoundaryMode;
    this._viewMode = initViewMode;
    if (initViewMode === 'table') import('./bee-table.ts');
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
        elevMin: initFilter.elevMin ?? null,
        elevMax: initFilter.elevMax ?? null,
      };
    }

    // If URL restores an active filter, initialize visible ID set to empty (hide-all)
    // so no dots flash before the async filter query completes.
    if (isFilterActive(this._filterState)) {
      this._visibleIds = new Set();
    }

    // Start filter query early — queryVisibleIds awaits tablesReady internally,
    // so this runs in parallel with SQLite init and resolves as soon as tables load.
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }

    // Restore selected occurrences from URL
    const initSel = initialParams.selection;
    if (initSel?.type === 'ids' && initSel.ids.length > 0) {
      import('./bee-sidebar.ts');
      this._selectedOccIds = initSel.ids;
      this._sidebarOpen = true;
    } else if (initSel?.type === 'cluster') {
      import('./bee-sidebar.ts');
      this._selectedCluster = { lon: initSel.lon, lat: initSel.lat, radiusM: initSel.radiusM };
      this._sidebarOpen = true;
    }

    // Write initial URL state (covers fresh loads — makes URL bar show params immediately)
    const initParams = buildParams(
      { lon: initLon, lat: initLat, zoom: initZoom },
      this._filterState,
      initSel ?? { type: 'ids' as const, ids: [] },
      { boundaryMode: initBoundaryMode, viewMode: initViewMode }
    );
    window.history.replaceState({}, '', '?' + initParams.toString());

    // Initialize SQLite (deferred to avoid competing with the parquet file
    // for bandwidth on the critical path).
    loadOccurrencesTable(DATA_BASE_URL)
      .then(() => {
        console.debug('SQLite tables ready');
        if (this._viewMode === 'table') {
          this._loadSummaryFromSQLite();
          this._runTableQuery();
        }
      })
      .catch((err: unknown) => {
        console.error('SQLite init failed:', err);
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
    const generation = ++this._filterQueryGeneration;
    const result = await queryVisibleIds(this._filterState);
    // Discard result if a newer query has started since this one began.
    if (generation !== this._filterQueryGeneration) return;
    this._visibleIds = result?.ids ?? null;
    this._filteredRowCount = result?.rowCount ?? null;
  }

  private async _loadSummaryFromSQLite(): Promise<void> {
    await tablesReady;
    const { sqlite3, db } = await getDB();
    try {
      // Summary stats
      let summaryRow: Record<string, unknown> = {};
      await sqlite3.exec(db, `
        SELECT COUNT(*) AS total_specimens,
               COUNT(DISTINCT scientificName) AS species_count,
               COUNT(DISTINCT genus) AS genus_count,
               COUNT(DISTINCT family) AS family_count,
               MIN(year) AS earliest_year,
               MAX(year) AS latest_year
        FROM occurrences
        WHERE ecdysis_id IS NOT NULL
      `, (rowValues: unknown[], columnNames: string[]) => {
        summaryRow = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
      });
      if (Object.keys(summaryRow).length === 0) { this._loading = false; return; }
      this._summary = {
        totalSpecimens: Number(summaryRow.total_specimens),
        speciesCount: Number(summaryRow.species_count),
        genusCount: Number(summaryRow.genus_count),
        familyCount: Number(summaryRow.family_count),
        earliestYear: Number(summaryRow.earliest_year),
        latestYear: Number(summaryRow.latest_year),
      };

      // Taxa options
      const taxaRows: Record<string, unknown>[] = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL ORDER BY family, genus, scientificName`,
        (rowValues: unknown[], columnNames: string[]) => {
          taxaRows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])));
        }
      );
      const families = new Set<string>();
      const genera = new Set<string>();
      const species = new Set<string>();
      for (const obj of taxaRows) {
        if (obj.family) families.add(String(obj.family));
        if (obj.genus) genera.add(String(obj.genus));
        if (obj.scientificName) species.add(String(obj.scientificName));
      }
      this._taxaOptions = [
        ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
        ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
        ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
      ];

      // County options
      this._countyOptions = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT county FROM occurrences WHERE county IS NOT NULL ORDER BY county`,
        (rowValues: unknown[]) => { this._countyOptions.push(String(rowValues[0])); }
      );

      // Ecoregion options
      this._ecoregionOptions = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT ecoregion_l3 FROM occurrences WHERE ecoregion_l3 IS NOT NULL ORDER BY ecoregion_l3`,
        (rowValues: unknown[]) => { this._ecoregionOptions.push(String(rowValues[0])); }
      );

      // _collectorOptions is populated by _loadCollectorOptions, called from _onDataLoaded
      // independently of view mode — no need to duplicate the query here.
    } catch (err) {
      const code = (err as any)?.code;
      console.error('Failed to load summary from SQLite:', err, code !== undefined ? `(SQLite error code ${code})` : '');
    } finally {
      this._loading = false;
    }
  }

  private async _loadCollectorOptions(): Promise<void> {
    await tablesReady;
    const { sqlite3, db } = await getDB();
    // occurrences table has both recordedBy (from ecdysis) and observer (from samples) on the same row.
    // DISTINCT because one collector may have many specimens; take any matching observer per name.
    const newOptions: CollectorEntry[] = [];
    try {
      await sqlite3.exec(db, `
        SELECT recordedBy, MIN(host_inat_login) AS host_inat_login
        FROM occurrences
        WHERE recordedBy IS NOT NULL AND ecdysis_id IS NOT NULL
        GROUP BY recordedBy
        ORDER BY recordedBy
      `, (rowValues: unknown[], columnNames: string[]) => {
        const obj = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
        const recordedBy = String(obj.recordedBy);
        const host_inat_login = obj.host_inat_login != null ? String(obj.host_inat_login) : null;
        newOptions.push({ displayName: recordedBy, recordedBy, host_inat_login } satisfies CollectorEntry);
      });
      this._collectorOptions = newOptions;
    } catch (err) {
      console.error('Failed to load collector options:', err);
      // leave _collectorOptions unchanged
    }
  }

  private async _loadCountyEcoregionOptions(): Promise<void> {
    try {
      await tablesReady;
      const { sqlite3, db } = await getDB();

      const counties: string[] = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT county FROM occurrences WHERE county IS NOT NULL ORDER BY county`,
        (rowValues: unknown[]) => { counties.push(String(rowValues[0])); }
      );
      this._countyOptions = counties;

      const ecoregions: string[] = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT ecoregion_l3 FROM occurrences WHERE ecoregion_l3 IS NOT NULL ORDER BY ecoregion_l3`,
        (rowValues: unknown[]) => { ecoregions.push(String(rowValues[0])); }
      );
      this._ecoregionOptions = ecoregions;
    } catch (err) {
      console.error('Failed to load county/ecoregion options:', err);
    }
  }

  private async _runTableQuery(): Promise<void> {
    if (this._viewMode !== 'table') return;
    this._tableLoading = true;
    const generation = ++this._tableQueryGeneration;
    // Parse selected IDs into integer arrays for SQL priority ordering.
    const selEcdysisIds: number[] = [];
    const selInatIds: number[] = [];
    for (const id of this._selectedOccIds ?? []) {
      if (id.startsWith('ecdysis:')) {
        const n = parseInt(id.slice('ecdysis:'.length), 10);
        if (!isNaN(n)) selEcdysisIds.push(n);
      } else if (id.startsWith('inat:')) {
        const n = parseInt(id.slice('inat:'.length), 10);
        if (!isNaN(n)) selInatIds.push(n);
      }
    }
    try {
      const { rows, total } = await queryTablePage(
        this._filterState, this._tablePage, this._tableSortBy,
        selEcdysisIds, selInatIds
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
      // Clear loading regardless of generation; the active query will set it again if needed.
      this._tableLoading = false;
    }
  }

  // --- URL state ---

  private _pushUrlState() {
    const params = buildParams(
      this._currentView,
      this._filterState,
      this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, viewMode: this._viewMode }
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
      elevMin: parsed.filter?.elevMin ?? null,
      elevMax: parsed.filter?.elevMax ?? null,
    };

    // Restore UI state
    this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';
    this._viewMode = parsed.ui?.viewMode ?? 'map';
    this._tablePage = 1;
    if (this._viewMode === 'table') {
      this._runTableQuery();
    }

    // Restore selection
    const parsedSel = parsed.selection;
    if (parsedSel?.type === 'ids' && parsedSel.ids.length > 0) {
      this._selectedOccIds = parsedSel.ids;
      this._selectedCluster = null;
      this._sidebarOpen = true;
    } else if (parsedSel?.type === 'cluster') {
      this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
      this._selectedOccIds = null;
      this._sidebarOpen = true;
    } else {
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._sidebarOpen = false;
    }

    // Run filter query for restored state
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    } else {
      this._visibleIds = null;
      this._filteredRowCount = null;
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

  private _onOccurrenceClick(e: CustomEvent<{ occurrences: OccurrenceRow[]; occIds: string[]; centroid?: { lon: number; lat: number }; radiusM?: number }>) {
    import('./bee-sidebar.ts');
    this._selectedOccurrences = e.detail.occurrences.sort((a, b) => b.date.localeCompare(a.date));
    this._selectedOccIds = e.detail.occIds;
    if (e.detail.centroid && e.detail.radiusM != null) {
      this._selectedCluster = { lon: e.detail.centroid.lon, lat: e.detail.centroid.lat, radiusM: e.detail.radiusM };
    } else {
      this._selectedCluster = null;
    }
    this._sidebarOpen = true;
    if (this._viewMode === 'table') {
      this._tablePage = 1;
      this._runTableQuery();
    }
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
    this._tablePage = 1;
    this._runTableQuery();
  }

  private _onMapClickEmpty() {
    if (this._boundaryMode !== 'off') {
      // Clear region filter and any open selection
      this._filterState = {
        ...this._filterState,
        selectedCounties: new Set(),
        selectedEcoregions: new Set(),
      };
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._sidebarOpen = false;
      this._runFilterQuery().then(() => {
        this._pushUrlState();
      });
      this._tablePage = 1;
      this._runTableQuery();
    } else {
      // Clear selection
      this._selectedOccurrences = null;
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._sidebarOpen = false;
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
      elevMin: (detail as any).elevMin ?? null,
      elevMax: (detail as any).elevMax ?? null,
    };

    // Clear selections when filter changes
    this._selectedOccurrences = null;
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._sidebarOpen = false;

    this._tablePage = 1;  // per D-09
    this._runFilterQuery().then(() => {
      this._pushUrlState();
    });
    this._runTableQuery();
  }

  private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
    this._viewMode = e.detail;
    if (this._viewMode === 'table') {
      import('./bee-table.ts');
      this._tableLoading = true;
      this._runTableQuery();
      if (this._loading) {
        // bee-map data-loaded hasn't fired yet; load summary from SQLite
        this._loadSummaryFromSQLite();
      }
      this._sidebarOpen = false;  // D-08: close sidebar when entering table mode
    } else {
      this._tableFilterOpen = false;
    }
    this._pushUrlState();
  }

  private _onToggleFilter() {
    this._tableFilterOpen = !this._tableFilterOpen;
    (this.shadowRoot?.querySelector('bee-filter-panel') as any)?.setOpen(this._tableFilterOpen);
  }

  private _onRowPan(e: CustomEvent<{ lat: number; lon: number }>) {
    this._viewState = { lat: e.detail.lat, lon: e.detail.lon, zoom: this._currentView.zoom };
  }

  private _onPageChanged(e: CustomEvent<{ page: number }>) {
    this._tablePage = e.detail.page;
    this._runTableQuery();
  }

  private _onSortChanged(e: CustomEvent<{ sortBy: SpecimenSortBy }>) {
    this._tableSortBy = e.detail.sortBy;
    this._tablePage = 1;
    this._runTableQuery();
  }

  private async _onDownloadCsv() {
    try {
      const rows = await queryAllFiltered(this._filterState, this._tableSortBy);
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]!);
      const csvLines = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = (row as any)[h];
            const str = val == null ? '' : String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')
              ? '"' + str.replace(/"/g, '""') + '"'
              : str;
          }).join(',')
        ),
      ];
      const csvContent = csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const filename = buildCsvFilename(this._filterState);
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

  private _onClose() {
    this._selectedOccurrences = null;
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._sidebarOpen = false;
    this._pushUrlState();
  }

  private _onDataLoaded(e: CustomEvent<{ summary: DataSummary; taxaOptions: TaxonOption[] }>) {
    this._summary = e.detail.summary;
    this._taxaOptions = e.detail.taxaOptions;
    this._loading = false;
    this._loadCollectorOptions();
    // Load county and ecoregion options from SQLite
    // (previously loaded from region GeoJSON sources, now stubbed for Phase 71)
    this._loadCountyEcoregionOptions();

    // If filter was restored from URL, run the filter query now that data is loaded.
    // Guard against the case where firstUpdated already started a query that has resolved.
    if (isFilterActive(this._filterState) && this._visibleIds === null) {
      this._runFilterQuery();
    }

    // If table view is active, run table query now that data is loaded
    if (this._viewMode === 'table') {
      this._runTableQuery();
    }

    // Restore ID-based selection
    if (this._selectedOccIds && this._selectedOccIds.length > 0 && this._selectedOccurrences === null) {
      this._restoreSelectionOccurrences(this._selectedOccIds);
    }
    // Restore cluster-based selection
    if (this._selectedCluster && this._selectedOccurrences === null) {
      this._restoreClusterSelection(this._selectedCluster);
    }
  }

  private async _restoreSelectionOccurrences(occIds: string[]) {
    try {
      const { sqlite3, db } = await getDB();
      const ecdysisIds = occIds
        .filter(id => id.startsWith('ecdysis:'))
        .map(id => id.slice('ecdysis:'.length))
        .filter(id => /^\d+$/.test(id));
      const inatIds = occIds
        .filter(id => id.startsWith('inat:'))
        .map(id => id.slice('inat:'.length))
        .filter(id => /^\d+$/.test(id));

      // Safety: ecdysisIds/inatIds have already been filtered to /^\d+$/.
      // If this assertion fails, the regex guard above has been changed — do NOT remove it.
      if (ecdysisIds.some(id => !/^\d+$/.test(id)) || inatIds.some(id => !/^\d+$/.test(id))) {
        console.error('ID validation failed; skipping selection restore');
        return;
      }

      const conditions: string[] = [];
      if (ecdysisIds.length > 0) {
        conditions.push(`CAST(ecdysis_id AS TEXT) IN (${ecdysisIds.map(id => `'${id}'`).join(',')})`);
      }
      if (inatIds.length > 0) {
        conditions.push(`CAST(observation_id AS TEXT) IN (${inatIds.map(id => `'${id}'`).join(',')})`);
      }
      if (conditions.length === 0) return;

      const colList = OCCURRENCE_COLUMNS.join(', ');
      const rows: OccurrenceRow[] = [];
      await sqlite3.exec(db, `
        SELECT ${colList}
        FROM occurrences
        WHERE ${conditions.join(' OR ')}
        ORDER BY date DESC, recordedBy ASC
      `, (rowValues: unknown[], columnNames: string[]) => {
        rows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])) as unknown as OccurrenceRow);
      });
      this._selectedOccurrences = rows;
    } catch (err) {
      console.error('Failed to restore selection from URL:', err);
    }
  }

  private async _restoreClusterSelection({ lon, lat, radiusM }: { lon: number; lat: number; radiusM: number }) {
    try {
      await tablesReady;
      const { sqlite3, db } = await getDB();
      const degPerMetre = 1 / 111320;
      const dLat = radiusM * degPerMetre;
      const dLon = Math.min(radiusM * degPerMetre / Math.cos(lat * Math.PI / 180), 180);
      const colList = OCCURRENCE_COLUMNS.join(', ');
      const rows: OccurrenceRow[] = [];
      await sqlite3.exec(db, `
        SELECT ${colList}
        FROM occurrences
        WHERE lat BETWEEN ${lat - dLat} AND ${lat + dLat}
          AND lon BETWEEN ${lon - dLon} AND ${lon + dLon}
      `, (rowValues: unknown[], columnNames: string[]) => {
        rows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])) as unknown as OccurrenceRow);
      });

      // Post-filter with haversine for precision
      const filtered = rows.filter(obj => {
        const rLat = Number(obj.lat);
        const rLon = Number(obj.lon);
        const R = 6371000;
        const dLatR = (rLat - lat) * Math.PI / 180;
        const dLonR = (rLon - lon) * Math.PI / 180;
        const a = Math.sin(dLatR / 2) ** 2 +
          Math.cos(lat * Math.PI / 180) * Math.cos(rLat * Math.PI / 180) * Math.sin(dLonR / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return dist <= radiusM;
      });

      // Build IDs list for selectedOccIds
      const restoredIds = filtered.map(obj =>
        obj.ecdysis_id != null ? `ecdysis:${obj.ecdysis_id}` : `inat:${Number(obj.observation_id)}`
      );
      this._selectedOccIds = restoredIds;
      this._selectedOccurrences = filtered.sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      console.error('Failed to restore cluster selection from URL:', err);
    }
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
