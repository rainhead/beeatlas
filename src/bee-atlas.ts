import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { type FilterState, type CollectorEntry, isFilterActive, queryVisibleGeoJSON, queryTablePage, queryAllFiltered, buildCsvFilename, type OccurrenceRow, type SpecimenSortBy, queryListPage, type OccurrenceProperties } from './filter.ts';
import { parseOccId } from './occurrence.ts';
import { buildParams, parseParams, type SourceKey } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
import { markTaxaReady } from './ready.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './filter.ts';
import { buildTaxonOptions, resolveTaxonDisplayName, type TaxonCacheEntry } from './taxa.ts';
import type { FeatureCollection, Point } from 'geojson';
import { makeStaleGuard } from './stale-guard.ts';
import './bee-header.ts';
import './bee-pane.ts';
import './bee-map.ts';

const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

@customElement('bee-atlas')
export class BeeAtlas extends LitElement {
  // App-level state — all formerly on BeeMap, now owned here
  @state() private _filterState: FilterState = {
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

  @state() private _visibleIds: Set<string> | null = null;
  @state() private _filteredGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  @state() private _filteredRowCount: number | null = null;
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
  @state() private _paneState: 'collapsed' | 'list' | 'table' = 'collapsed';
  @state() private _hiddenSources: Set<SourceKey> = new Set();
  @state() private _tablePage = 1;
  @state() private _tableSortBy: SpecimenSortBy = 'date';
  @state() private _tableRows: OccurrenceRow[] = [];
  @state() private _tableRowCount = 0;
  @state() private _tableLoading = false;
  @state() private _listRows: OccurrenceRow[] = [];
  @state() private _listRowCount = 0;
  @state() private _listPage = 1;
  @state() private _listLoading = false;
  @state() private _selectionCount: number | null = null;
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
  @state() private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null;

  // Non-reactive private fields
  // _taxonCache is NOT @state — only _taxaOptions (the sorted option array) drives re-renders.
  private _taxonCache: Map<number, TaxonCacheEntry> = new Map();
  // Pending legacy taxon from URL (non-integer taxon= value) resolved async after cache loads.
  private _pendingLegacyTaxon: { name: string; rank: string | null } | null = null;
  private _isRestoringFromHistory = false;
  private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  private _selectionDrawnGeneration = 0;
  // Stale-discard guards for the three async query paths. A superseded query
  // returns null rather than committing its result, preventing flicker and
  // unnecessary MapboxGL re-cluster work on outdated filter state.
  private _filterGuard = makeStaleGuard<{ geojson: FeatureCollection<Point, OccurrenceProperties>; ids: Set<string>; rowCount: number } | null>();
  private _tableGuard = makeStaleGuard<{ rows: OccurrenceRow[]; total: number }>();
  private _listGuard = makeStaleGuard<{ rows: OccurrenceRow[]; total: number; selectionCount: number | null }>();
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
  position: relative;
  z-index: 0;
}
bee-pane {
  top: calc(0.5em + 2.5rem);
  right: 0.5em;
}
.content.pane-list bee-pane {
  bottom: 0.5em;
  width: 25rem;
  max-height: calc(100% - 1em);
}
.content.pane-table bee-pane {
  bottom: 0;
  left: 0;
  right: 0;
  top: auto;
  height: 60%;
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
  .content.pane-list bee-pane {
    top: auto;
    bottom: 0;
    height: 60%;
    width: auto;
    max-height: none;
    left: 0;
    right: 0;
    border-radius: 8px 8px 0 0;
  }
}
  `;

  render() {
    return html`
      <bee-header></bee-header>
      ${this._error ? html`<div class="error-overlay">${this._error}</div>` : ''}
      ${this._loading ? html`<div class="loading-overlay">Loading…</div>` : ''}
      ${this._error ? '' : html`
        <div class=${[
          'content',
          this._paneState === 'list' ? 'pane-list' : '',
          this._paneState === 'table' ? 'pane-table' : '',
        ].filter(Boolean).join(' ')}>
          <bee-map
            .boundaryMode=${this._boundaryMode}
            .visibleIds=${this._visibleIds}
            .filteredGeoJSON=${this._filteredGeoJSON}
            .selectedOccIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .viewState=${this._viewState}
            .filterState=${this._filterState}
            .hiddenSources=${this._hiddenSources}
            @view-moved=${this._onViewMoved}
            @map-click-occurrence=${this._onOccurrenceClick}
            @map-click-region=${this._onRegionClick}
            @map-click-empty=${this._onMapClickEmpty}
            @data-loaded=${this._onDataLoaded}
            @data-error=${this._onDataError}
            @boundary-mode-changed=${this._onBoundaryModeChanged}
            @place-selected=${this._onPlaceSelected}
            @selection-drawn=${this._onSelectionDrawn}
          ></bee-map>
          <bee-pane
            .paneState=${this._paneState}
            .filterState=${this._filterState}
            .taxaOptions=${this._taxaOptions}
            .taxonCache=${this._taxonCache}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .collectorOptions=${this._collectorOptions}
            .summary=${this._summary}
            .specimenCount=${isFilterActive(this._filterState) ? this._filteredRowCount : null}
            .listRows=${this._listRows}
            .listRowCount=${this._listRowCount}
            .listPage=${this._listPage}
            .listLoading=${this._listLoading}
            .selectionCount=${this._selectionCount}
            .rows=${this._tableRows}
            .rowCount=${this._tableRowCount}
            .page=${this._tablePage}
            .loading=${this._tableLoading}
            .sortBy=${this._tableSortBy}
            .filterActive=${isFilterActive(this._filterState)}
            .selectedIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
            .hiddenSources=${this._hiddenSources}
            @filter-changed=${this._onFilterChanged}
            @source-filter-changed=${this._onSourceFilterChanged}
            @pane-expand-list=${this._onPaneExpandList}
            @pane-collapse=${this._onPaneCollapse}
            @pane-expand-table=${this._onPaneExpandTable}
            @pane-shrink-list=${this._onPaneShrinkList}
            @page-changed=${this._onPageChanged}
            @download-csv=${this._onDownloadCsv}
            @sort-changed=${this._onSortChanged}
            @row-pan=${this._onRowPan}
            @list-page-changed=${this._onListPageChanged}
            @pane-clear-selection=${this._onClearSelection}
          ></bee-pane>
        </div>
      `}
    `;
  }

  private _bootT0 = performance.now();

  public firstUpdated(_changedProperties: PropertyValues): void {
    const initialParams = parseParams(window.location.search);

    // Set initial view state from URL (or defaults)
    const initLon = initialParams.view?.lon ?? DEFAULT_LON;
    const initLat = initialParams.view?.lat ?? DEFAULT_LAT;
    const initZoom = initialParams.view?.zoom ?? DEFAULT_ZOOM;
    this._currentView = { lon: initLon, lat: initLat, zoom: initZoom };
    this._viewState = { lon: initLon, lat: initLat, zoom: initZoom };

    // Restore boundary/pane state from URL
    const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
    const paneState = initialParams.ui?.paneState ?? 'collapsed';
    this._boundaryMode = initBoundaryMode;
    this._paneState = paneState;
    this._hiddenSources = initialParams.ui?.hiddenSources ?? new Set();
    if (paneState === 'table') import('./bee-table.ts');
    // Restore filter state from URL params
    const initFilter = initialParams.filter;
    if (initFilter) {
      this._filterState = {
        taxonId: initFilter.taxonId ?? null,
        taxonDisplayName: initFilter.taxonDisplayName ?? null,
        yearFrom: initFilter.yearFrom ?? null,
        yearTo: initFilter.yearTo ?? null,
        months: initFilter.months ?? new Set(),
        selectedCounties: initFilter.selectedCounties ?? new Set(),
        selectedEcoregions: initFilter.selectedEcoregions ?? new Set(),
        selectedCollectors: initFilter.selectedCollectors ?? [],
        elevMin: initFilter.elevMin ?? null,
        elevMax: initFilter.elevMax ?? null,
        selectedPlace: initFilter.selectedPlace ?? null,
      };
    }
    // Store any pending legacy taxon for async resolution after the taxon cache loads.
    if (initialParams.pendingLegacyTaxon) {
      this._pendingLegacyTaxon = initialParams.pendingLegacyTaxon;
    }

    // If URL restores an active filter — or a legacy taxon name still pending async
    // resolution (taxonId not yet known) — initialize the visible ID set to empty
    // (hide-all) so no UNFILTERED dots flash before the filter resolves and the async
    // query completes. Without the pending-legacy case, a /?taxon=<name>&taxonRank=…
    // link renders the full clustered set until the taxon cache loads (the race).
    if (isFilterActive(this._filterState) || this._pendingLegacyTaxon != null) {
      this._visibleIds = new Set();
      this._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
    }

    // Start filter query early — queryVisibleIds awaits tablesReady internally,
    // so this runs in parallel with SQLite init and resolves as soon as tables load.
    // A pending legacy taxon has no taxonId yet; its query runs from
    // _resolveLegacyTaxon once the taxon cache loads.
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }

    // Restore selected occurrences from URL
    const initSel = initialParams.selection;
    if (initSel?.type === 'ids' && initSel.ids.length > 0) {
      this._selectedOccIds = initSel.ids;
      this._paneState = 'list';
    } else if (initSel?.type === 'cluster') {
      this._selectedCluster = { lon: initSel.lon, lat: initSel.lat, radiusM: initSel.radiusM };
      this._paneState = 'list';
    } else if (initSel?.type === 'bounds') {
      this._selectionBounds = { west: initSel.west, south: initSel.south, east: initSel.east, north: initSel.north };
      this._paneState = 'list';
    }
    // _runListQuery will be triggered by _onDataLoaded once SQLite is ready

    // Write initial URL state (covers fresh loads — makes URL bar show params
    // immediately). Skip while a legacy taxon name is pending resolution: the incoming
    // URL already carries the meaningful taxon=<name>&taxonRank=<rank>, and re-encoding
    // _filterState now (taxonId still null) would drop it. The canonical integer form
    // is written from _loadSummaryFromSQLite once the taxon resolves.
    if (this._pendingLegacyTaxon == null) {
      const initParams = buildParams(
        { lon: initLon, lat: initLat, zoom: initZoom },
        this._filterState,
        initSel ?? { type: 'ids' as const, ids: [] },
        { boundaryMode: initBoundaryMode, paneState }
      );
      window.history.replaceState({}, '', '?' + initParams.toString());
    }

    // Initialize SQLite (deferred to avoid competing with the parquet file
    // for bandwidth on the critical path).
    loadOccurrencesTable()
      .then(async () => {
        console.debug('SQLite tables ready');
        if (this._paneState === 'table') {
          // _loadSummaryFromSQLite is called from _onDataLoaded (unconditionally); only run
          // the table query here since it depends on SQLite being ready, not on tablesReady.
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
    const guarded = await this._filterGuard(() => queryVisibleGeoJSON(this._filterState));
    if (guarded === null) return;
    this._filteredGeoJSON = guarded.result?.geojson ?? null;
    this._visibleIds = guarded.result?.ids ?? null;
    this._filteredRowCount = guarded.result?.rowCount ?? null;
  }

  private async _loadSummaryFromSQLite(): Promise<void> {
    await tablesReady;
    const { sqlite3, db } = await getDB();
    try {
      // Summary stats
      let summaryRow: Record<string, unknown> = {};
      await sqlite3.exec(db, `
        SELECT COUNT(*) AS total_specimens,
               MIN(year) AS earliest_year,
               MAX(year) AS latest_year
        FROM occurrences
        WHERE ecdysis_id IS NOT NULL
      `, (rowValues: unknown[], columnNames: string[]) => {
        summaryRow = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
      });
      if (Object.keys(summaryRow).length === 0) {
        console.warn('Summary query returned no rows — DB may be empty');
        this._loading = false;
        return;
      }
      this._summary = {
        totalSpecimens: Number(summaryRow.total_specimens),
        earliestYear: Number(summaryRow.earliest_year),
        latestYear: Number(summaryRow.latest_year),
      };

      // Taxa cache + options (D-08: lazy, after tablesReady, not on boot path)
      // Step 1: Load all is_anthophila=1 taxa into _taxonCache.
      const cacheRows: Array<{ taxon_id: number; rank: string; name: string; lineage_path: string | null }> = [];
      await sqlite3.exec(db,
        `SELECT taxon_id, rank, name, lineage_path FROM taxa WHERE is_anthophila = 1`,
        (rowValues: unknown[], columnNames: string[]) => {
          const obj = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
          cacheRows.push(obj as { taxon_id: number; rank: string; name: string; lineage_path: string | null });
        }
      );
      this._taxonCache = new Map(cacheRows.map(r => [
        r.taxon_id,
        { rank: r.rank, name: r.name, lineagePath: r.lineage_path },
      ]));
      // Signal the taxon-cache readiness barrier (ready.ts). Nothing awaits it yet
      // (additive — step 1 of the map-init readiness work); legacy-taxon resolution
      // will await this in a later change instead of the current _pendingLegacyTaxon
      // store-and-resolve dance.
      markTaxaReady();

      // Step 2: D-01 enumeration — get distinct present occurrence taxon_ids, then
      // ancestry-expand to build the eligible autocomplete set. This avoids the 10-second
      // EXISTS form; runtime-verified equivalent in ~3.5 ms (Phase 130 Wave 0).
      const presentIds = new Set<number>();
      await sqlite3.exec(db,
        `SELECT DISTINCT taxon_id FROM occurrences WHERE taxon_id IS NOT NULL`,
        (rowValues: unknown[]) => {
          const id = rowValues[0];
          if (typeof id === 'number') presentIds.add(id);
        }
      );
      this._taxaOptions = buildTaxonOptions(presentIds, this._taxonCache);

      // Step 3: Resolve any pending legacy taxon from URL (non-integer taxon= value).
      const hadPendingLegacy = this._pendingLegacyTaxon != null;
      if (this._pendingLegacyTaxon) {
        this._resolveLegacyTaxon(this._pendingLegacyTaxon);
      }
      // Step 3b: Backfill the display name for a taxon restored from the URL — the
      // URL carries only the integer taxon_id, so the "Species or group" input would
      // otherwise render empty despite an active filter. Covers both the integer
      // restore (firstUpdated) and legacy-name resolution paths.
      this._resolveTaxonDisplayName();
      // Step 3c: the pending legacy taxon is now resolved (or proven stale) and
      // _pendingLegacyTaxon is null, lifting the URL-write suppression — write the
      // canonical integer-form URL, replacing the legacy taxon=<name>&taxonRank=<rank>.
      if (hadPendingLegacy) {
        this._replaceUrlState();
      }

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

  /**
   * Resolve a legacy taxon {name, rank} record to a taxonId via _taxonCache lookup.
   * If the cache is already populated, resolves immediately. If not (called before the
   * cache loads), stores as _pendingLegacyTaxon for resolution in _loadSummaryFromSQLite.
   * Uses rank for twin disambiguation (e.g. genus vs subgenus Bombus).
   * The raw name string is NEVER used in SQL — only in an in-memory equality lookup (T-130-LU).
   */
  private _resolveLegacyTaxon(pending: { name: string; rank: string | null }): void {
    if (this._taxonCache.size === 0) {
      // Cache not yet loaded — store for resolution after cache loads
      this._pendingLegacyTaxon = pending;
      return;
    }
    this._pendingLegacyTaxon = null;
    const { name, rank } = pending;
    for (const [id, entry] of this._taxonCache) {
      if (entry.name === name && (rank === null || entry.rank === rank)) {
        this._filterState = { ...this._filterState, taxonId: id };
        if (isFilterActive(this._filterState)) {
          this._runFilterQuery();
        }
        return;
      }
    }
    // No match found — stale bookmark; leave the taxon filter inactive. Clear the
    // hide-all guard (set in firstUpdated for the pending legacy taxon) so the full
    // set renders instead of an empty map — unless some OTHER URL filter is active.
    if (!isFilterActive(this._filterState)) {
      this._filteredGeoJSON = null;
      this._visibleIds = null;
    }
  }

  /**
   * Backfill taxonDisplayName from the taxon cache when a taxon filter was restored
   * from the URL or browser history (which encode only the integer taxon_id) or
   * resolved from a legacy name. Without this the "Species or group" input renders
   * empty even though the filter is active. Uses the same label scheme as the
   * autocomplete so a restored chip matches a freshly-selected one. No-op when the
   * display name is already present or the id is unknown (stale bookmark).
   */
  private _resolveTaxonDisplayName(): void {
    const { taxonId, taxonDisplayName } = this._filterState;
    if (taxonId === null || taxonDisplayName) return;
    const label = resolveTaxonDisplayName(taxonId, this._taxonCache);
    if (label !== null) {
      this._filterState = { ...this._filterState, taxonDisplayName: label };
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
    if (this._paneState !== 'table') return;
    this._tableLoading = true;
    const selEcdysisIds: number[] = [];
    const selInatIds: number[] = [];
    const selInatObsIds: number[] = [];
    const selChecklistIds: number[] = [];
    for (const id of this._selectedOccIds ?? []) {
      const parsed = parseOccId(id);
      if (parsed === null) continue;
      if (parsed.source === 'ecdysis') selEcdysisIds.push(parsed.numericId);
      else if (parsed.source === 'inat_obs') selInatObsIds.push(parsed.numericId);
      else if (parsed.source === 'checklist') selChecklistIds.push(parsed.numericId);
      else selInatIds.push(parsed.numericId);
    }
    const guarded = await this._tableGuard(async () => {
      try {
        return await queryTablePage(
          this._filterState, this._tablePage, this._tableSortBy,
          selEcdysisIds, selInatIds, selChecklistIds, selInatObsIds
        );
      } catch (err) {
        console.error('Table query failed:', err);
        return { rows: [], total: 0 };
      }
    });
    if (guarded === null) return; // stale — active query owns loading state
    this._tableRows = guarded.result.rows;
    this._tableRowCount = guarded.result.total;
    this._tableLoading = false;
  }

  private async _runListQuery(): Promise<void> {
    this._listLoading = true;
    const selEcdysisIds: number[] = [];
    const selInatIds: number[] = [];
    const selInatObsIds: number[] = [];
    const selChecklistIds: number[] = [];
    for (const id of this._selectedOccIds ?? []) {
      const parsed = parseOccId(id);
      if (parsed === null) continue;
      if (parsed.source === 'ecdysis') selEcdysisIds.push(parsed.numericId);
      else if (parsed.source === 'inat_obs') selInatObsIds.push(parsed.numericId);
      else if (parsed.source === 'checklist') selChecklistIds.push(parsed.numericId);
      else selInatIds.push(parsed.numericId);
    }
    const hasSelection = selEcdysisIds.length > 0 || selInatIds.length > 0 || selInatObsIds.length > 0 || selChecklistIds.length > 0 || this._selectionBounds !== null;
    const guarded = await this._listGuard(async () => {
      try {
        const { rows, total } = await queryListPage(
          this._filterState, this._listPage, this._tableSortBy,
          selEcdysisIds, selInatIds, selInatObsIds, selChecklistIds,
          this._selectionBounds ?? null
        );
        return { rows, total, selectionCount: hasSelection ? total : null };
      } catch (err) {
        console.error('List query failed:', err);
        return { rows: [], total: 0, selectionCount: null };
      }
    });
    if (guarded === null) return; // stale — active query owns loading state
    this._listRows = guarded.result.rows;
    this._listRowCount = guarded.result.total;
    this._selectionCount = guarded.result.selectionCount;
    this._listLoading = false;
  }

  // --- URL state ---

  private _buildCurrentParams(): URLSearchParams {
    return buildParams(
      this._currentView,
      this._filterState,
      this._selectionBounds && this._paneState === 'list'
        ? { type: 'bounds' as const, ...this._selectionBounds }
        : this._selectedCluster
          ? { type: 'cluster' as const, ...this._selectedCluster }
          : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
    );
  }

  private _replaceUrlState() {
    // Suppress writes while a legacy taxon name is pending resolution — _filterState
    // has no taxonId yet, so buildParams would drop the taxon and strand the URL at
    // ?x=&y=&z=. The integer-form URL is written from _loadSummaryFromSQLite once the
    // taxon cache loads and resolves it (Step 3c).
    if (this._pendingLegacyTaxon != null) return;
    const params = this._buildCurrentParams();
    window.history.replaceState({}, '', '?' + params.toString());
  }

  private _pushUrlStateDebounced() {
    // Called only from _onViewMoved — schedules a pushState entry for the
    // final resting position of the map so view moves create history entries.
    // Suppressed while a legacy taxon is pending (see _replaceUrlState) so the
    // map settling during load doesn't strand the URL without the taxon.
    if (this._pendingLegacyTaxon != null) return;
    this._replaceUrlState();
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + this._buildCurrentParams().toString());
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
      taxonId: parsed.filter?.taxonId ?? null,
      taxonDisplayName: parsed.filter?.taxonDisplayName ?? null,
      yearFrom: parsed.filter?.yearFrom ?? null,
      yearTo: parsed.filter?.yearTo ?? null,
      months: parsed.filter?.months ?? new Set(),
      selectedCounties: parsed.filter?.selectedCounties ?? new Set(),
      selectedEcoregions: parsed.filter?.selectedEcoregions ?? new Set(),
      selectedCollectors: parsed.filter?.selectedCollectors ?? [],
      elevMin: parsed.filter?.elevMin ?? null,
      elevMax: parsed.filter?.elevMax ?? null,
      selectedPlace: parsed.filter?.selectedPlace ?? null,
    };
    // Handle legacy taxon back-compat on history navigation.
    // If _taxonCache is already populated, resolve immediately; otherwise store for later.
    if (parsed.pendingLegacyTaxon) {
      this._resolveLegacyTaxon(parsed.pendingLegacyTaxon);
    } else {
      this._pendingLegacyTaxon = null; // clear any stale pending from a previous navigation
    }
    // Backfill the display name for the integer taxon_id restored from history — the
    // cache is already loaded by the time history navigation fires.
    this._resolveTaxonDisplayName();

    // Restore UI state
    this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';
    this._hiddenSources = parsed.ui?.hiddenSources ?? new Set();
    const paneState = parsed.ui?.paneState ?? 'collapsed';
    this._tablePage = 1;

    // Restore selection
    const parsedSel = parsed.selection;
    if (parsedSel?.type === 'ids' && parsedSel.ids.length > 0) {
      this._selectedOccIds = parsedSel.ids;
      this._selectedCluster = null;
      this._selectionBounds = null;
    } else if (parsedSel?.type === 'cluster') {
      this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
      this._selectedOccIds = null;
      this._selectionBounds = null;
    } else if (parsedSel?.type === 'bounds') {
      this._selectionBounds = { west: parsedSel.west, south: parsedSel.south, east: parsedSel.east, north: parsedSel.north };
      this._selectedOccIds = null;
      this._selectedCluster = null;
    } else {
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;
    }

    // Derive final paneState once, after selection is known.
    // A selection always forces 'list'; otherwise use the URL-encoded value.
    const hasSelection = (parsedSel?.type === 'ids' && parsedSel.ids.length > 0)
      || parsedSel?.type === 'cluster'
      || parsedSel?.type === 'bounds';
    const finalPaneState = hasSelection ? 'list' : paneState;
    this._paneState = finalPaneState;
    if (finalPaneState === 'table') {
      this._runTableQuery();
    }
    if (finalPaneState === 'list') {
      this._listPage = 1;
      this._runListQuery();
    }

    // Run filter query for restored state
    if (isFilterActive(this._filterState)) {
      this._visibleIds = new Set(); // hide all until query resolves, preventing stale dot flash
      this._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
      this._runFilterQuery();
    } else {
      this._visibleIds = null;
      this._filteredGeoJSON = null;
      this._filteredRowCount = null;
    }
  };

  // --- Event handlers from bee-map ---

  private _onViewMoved(e: CustomEvent<{ lon: number; lat: number; zoom: number }>) {
    this._currentView = e.detail;
    if (!this._isRestoringFromHistory) {
      this._pushUrlStateDebounced();
    } else {
      // Reset the flag after bee-map reports the view has settled
      this._isRestoringFromHistory = false;
    }
  }

  private _onOccurrenceClick(e: CustomEvent<{ occurrences: OccurrenceRow[]; occIds: string[]; centroid?: { lon: number; lat: number }; radiusM?: number }>) {
    this._selectedOccIds = e.detail.occIds;
    this._selectionBounds = null;
    if (e.detail.centroid && e.detail.radiusM != null) {
      this._selectedCluster = { lon: e.detail.centroid.lon, lat: e.detail.centroid.lat, radiusM: e.detail.radiusM };
    } else {
      this._selectedCluster = null;
    }
    this._paneState = 'list';
    this._listPage = 1;
    this._runListQuery();
    this._replaceUrlState();
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

    const newFilter = this._filterState;
    const hasSelection = isCounty
      ? newFilter.selectedCounties.size > 0
      : newFilter.selectedEcoregions.size > 0;
    if (hasSelection) {
      this._openSidebarForFilter(newFilter);
    } else {
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;
      this._paneState = 'collapsed';
    }
    this._runFilterQuery().then(() => {
      this._replaceUrlState();
    });
    this._tablePage = 1;
    this._runTableQuery();
  }

  private _onPlaceSelected(e: CustomEvent<{ slug: string }>) {
    const { slug } = e.detail;
    // Toggle off if the same place is clicked again (mirrors _onRegionClick single-select behavior)
    const wasSelected = this._filterState.selectedPlace === slug;
    this._filterState = {
      ...this._filterState,
      selectedPlace: wasSelected ? null : slug,
    };
    this._tablePage = 1;
    if (!wasSelected) {
      this._openSidebarForFilter(this._filterState);
    } else {
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;
      this._paneState = 'collapsed';
    }
    this._runFilterQuery().then(() => {
      this._replaceUrlState();
    });
    this._runTableQuery();
  }

  private _openSidebarForFilter(_filterState: FilterState): void {
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;
    this._paneState = 'list';
    this._listPage = 1;
    this._runListQuery();
  }

  private async _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
    ++this._selectionDrawnGeneration;
    this._selectionBounds = e.detail;
    // Synchronously clear prior selection state before any await
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._paneState = 'list';
    this._listPage = 1;
    this._runListQuery();
    this._replaceUrlState();
  }

  private _onMapClickEmpty() {
    if (this._boundaryMode !== 'off') {
      // Clear region filter and any open selection
      this._filterState = {
        ...this._filterState,
        selectedCounties: new Set(),
        selectedEcoregions: new Set(),
      };
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;
      this._paneState = 'collapsed';
      this._runFilterQuery().then(() => {
        this._replaceUrlState();
      });
      this._tablePage = 1;
      this._runTableQuery();
    } else {
      // Clear selection
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._selectionBounds = null;
      this._paneState = 'collapsed';
      this._replaceUrlState();
    }
  }

  private _onFilterChanged(e: CustomEvent<FilterChangedEvent>) {
    const detail = e.detail;
    const prev = this._filterState;

    this._filterState = {
      taxonId: detail.taxonId,
      taxonDisplayName: detail.taxonDisplayName,
      yearFrom: detail.yearFrom,
      yearTo: detail.yearTo,
      months: detail.months,
      selectedCounties: detail.selectedCounties,
      selectedEcoregions: detail.selectedEcoregions,
      selectedCollectors: detail.selectedCollectors,
      elevMin: detail.elevMin ?? null,
      elevMax: detail.elevMax ?? null,
      selectedPlace: detail.selectedPlace ?? null,
    };

    // Auto-switch boundary layer to match newly added region filter type.
    if (detail.selectedCounties.size > prev.selectedCounties.size) {
      this._boundaryMode = 'counties';
    } else if (detail.selectedEcoregions.size > prev.selectedEcoregions.size) {
      this._boundaryMode = 'ecoregions';
    } else if (detail.selectedPlace !== null && prev.selectedPlace === null) {
      this._boundaryMode = 'places';
    }

    // Clear selections when filter changes
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;
    if (this._paneState !== 'list') this._paneState = 'collapsed';
    if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }

    this._tablePage = 1;  // per D-09
    this._runFilterQuery().then(() => {
      this._replaceUrlState();
    });
    this._runTableQuery();
  }

  private _onRowPan(e: CustomEvent<{ lat: number; lon: number }>) {
    if (this._paneState === 'table') {
      this._paneState = 'list';
      this._replaceUrlState();
    }
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

  private _onListPageChanged(e: CustomEvent<{ page: number }>) {
    this._listPage = e.detail.page;
    this._runListQuery();
  }

  private _onClearSelection() {
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;
    this._selectionCount = null;
    this._listPage = 1;
    this._runListQuery();
    this._replaceUrlState();
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

  private _onPaneExpandList() {
    this._paneState = 'list';
    this._listPage = 1;
    this._runListQuery();
    this._replaceUrlState();
  }

  private _onPaneCollapse() {
    this._selectedOccIds = null;
    this._selectedCluster = null;
    this._selectionBounds = null;
    this._paneState = 'collapsed';
    this._replaceUrlState();
  }

  private _onPaneExpandTable() {
    this._paneState = 'table';
    import('./bee-table.ts');
    this._tableLoading = true;
    this._runTableQuery();
    this._replaceUrlState();
  }

  private _onPaneShrinkList() {
    this._paneState = 'list';
    this._replaceUrlState();
  }

  private _onDataLoaded(_e: CustomEvent) {
    // _summary is owned solely by _loadSummaryFromSQLite — do NOT read from event payload (D-06 Pitfall 2).
    // _taxaOptions is built in _loadSummaryFromSQLite (from taxa table) — not from geo-blob event.
    // Call _loadSummaryFromSQLite here so the taxa cache loads for all users (not just table pane).
    this._loadSummaryFromSQLite();
    // _loading = false is set in _loadSummaryFromSQLite's finally block; do not set it here
    // to avoid a race where the loading screen lifts before the taxa cache is ready.
    const _heapMB = ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;
    console.log(`[BENCHMARK] data-loaded (loading screen lifted): ${(performance.now() - this._bootT0).toFixed(0)} ms from boot | main-thread heap: ${_heapMB.toFixed(1)} MB`);
    this._loadCollectorOptions();
    // Load county and ecoregion options from SQLite
    // (previously loaded from region GeoJSON sources, now stubbed for Phase 71)
    this._loadCountyEcoregionOptions();

    // If filter was restored from URL, (re-)run the filter query now that data is loaded.
    // The generation counter in _runFilterQuery discards stale results, so this is safe
    // even if firstUpdated already started a query.
    if (isFilterActive(this._filterState)) {
      this._runFilterQuery();
    }

    // If table view is active, run table query now that data is loaded
    if (this._paneState === 'table') {
      this._runTableQuery();
    }

    // If list view is active, run list query now that data is loaded
    if (this._paneState === 'list') {
      this._runListQuery();
    }
  }

  private _onDataError(e: CustomEvent<{ message: string }>) {
    this._error = e.detail.message;
    this._loading = false;
  }

  private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<SourceKey> }>) {
    this._hiddenSources = e.detail.hiddenSources;
    this._replaceUrlState();
  }

  private _onBoundaryModeChanged(e: CustomEvent<'off' | 'counties' | 'ecoregions' | 'places'>) {
    const newMode = e.detail;
    this._boundaryMode = newMode;
    const leavingPlaces = newMode !== 'places' && this._filterState.selectedPlace !== null;
    if (leavingPlaces) {
      this._filterState = { ...this._filterState, selectedPlace: null };
      this._tablePage = 1;
      this._runFilterQuery().then(() => {
        this._replaceUrlState();
      });
      this._runTableQuery();
    } else {
      this._replaceUrlState();
    }
  }
}
