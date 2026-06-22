import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { BeeMap } from './bee-map.ts';
import { type FilterState, type CollectorEntry, isFilterActive, queryVisibleGeoJSON, queryTablePage, queryAllFiltered, buildCsvFilename, type OccurrenceRow, type SpecimenSortBy, queryListPage, type OccurrenceProperties } from './filter.ts';
import { parseOccId } from './occurrence.ts';
import { buildParams, parseParams, type SourceKey } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
import { markTaxaReady, taxaReady } from './ready.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './filter.ts';
import { buildTaxonOptions, resolveTaxonDisplayName, type TaxonCacheEntry } from './taxa.ts';
import type { FeatureCollection, Point } from 'geojson';
import { makeStaleGuard } from './stale-guard.ts';
import type { CachePrimeProgressDetail, CacheStateChangedDetail } from './prime-orchestrator.ts';
import { loadFreshnessLabel } from './manifest.ts';
import './bee-header.ts';
import './bee-pane.ts';
import './bee-map.ts';

const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

// --- D-12: iOS Safari detection helpers ---
// These are module-level functions (not methods) so install-affordance.test.ts can
// find the key strings via readFileSync without mounting a component.

// isStandalone: returns true when the app is already installed / launched from home screen.
// Checks both the W3C display-mode media query (Android + iOS 13+) and the Apple-proprietary
// navigator.standalone (iOS Safari specific; not on Android Chrome).
function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// isIosSafari: returns true on iOS Safari (iPhone/iPad) but NOT on Chrome/Firefox/Edge iOS,
// in-app WebViews (Facebook, Instagram, Line), or desktop Safari on macOS.
//
// Heuristics:
//  1. UA contains iPad|iPhone|iPod (standard iOS), OR
//     navigator.platform === 'MacIntel' && maxTouchPoints > 1 (iPadOS 13+ desktop-mode UA
//     where iPad lies and says it's macOS — RESEARCH §iOS Detection, Pitfall 5).
//  2. UA contains 'Safari' (excludes non-WebKit browsers in theory, but real gate is step 3).
//  3. UA does NOT contain CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line (browser-in-app
//     exclusions — share-sheet not available in those contexts, D-12).
//
// NOTE: Do NOT parse iOS version numbers — navigator.userAgent is frozen at iOS 26+ for WKWebView.
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIosDevice) return false;
  if (!ua.includes('Safari')) return false;
  if (/CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// D-02: near-me ±10 km bounding box helper
// ---------------------------------------------------------------------------
// Pure function — no class dependency. Exported so tests can call it directly.
// Returns null when any edge is non-finite (polar cos→0, NaN inputs — T-153-07).
export function boundsFromLocation(loc: { lat: number; lon: number }): { west: number; south: number; east: number; north: number } | null {
  const dLat = 10 / 111.32;
  const dLon = 10 / (111.32 * Math.cos(loc.lat * Math.PI / 180));
  // Guard: dLon is non-finite (polar singularity) or absurdly large (near-polar — the box
  // would span more than the full globe, making it meaningless). T-153-07.
  if (!isFinite(dLon) || dLon > 180) return null;
  const west  = loc.lon - dLon;
  const east  = loc.lon + dLon;
  const south = loc.lat - dLat;
  const north = loc.lat + dLat;
  if (!isFinite(west) || !isFinite(east) || !isFinite(south) || !isFinite(north)) return null;
  return { west, east, south, north };
}

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
    bounds: null,
  };

  @state() private _visibleIds: Set<string> | null = null;
  @state() private _filteredGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  @state() private _filteredRowCount: number | null = null;
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
  // Region control menu open/close (relocated from <bee-map> in Phase 157).
  @state() private _regionMenuOpen = false;
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
  // Dedicated flag: true while a legacy taxon from the URL is pending resolution via
  // the await-taxaReady flow. Feeds intendedFilterActive — the single gate for hide-all
  // and URL-write suppression. MUST be @state: intendedFilterActive (a derived getter) is
  // bound into <bee-map> as .intendedFilterActive, so a mutation here must schedule a
  // re-render to propagate the gate. Without @state, propagation would depend on an
  // incidental co-mutation of another reactive field at every call site (fragile).
  @state() private _filterResolving = false;
  @state() private _offline: boolean = !navigator.onLine;
  @state() private _cacheState: { ready: boolean; cached: string[]; missing: string[] } | null = null;
  @state() private _primeProgress: { received: number; total: number; assetInFlight: string | null } | null = null;
  @state() private _updateAvailable: boolean = false;
  @state() private _freshnessLabel: string | null = null;
  @state() private _storageEstimate: { usageMB: string; quotaMB: string | null } | null = null;
  // D-09/D-10: true when beforeinstallprompt was captured and app is not yet standalone.
  @state() private _installable: boolean = false;
  // D-11/D-12: true on iOS Safari (not standalone); computed once at construction time.
  @state() private _iosInstructable: boolean = isIosSafari() && !isStandalone();

  // LOC-02: location state owned by bee-atlas (pure-presenter invariant — bee-map only emits)
  @state() private _userLocation: { lat: number; lon: number; accuracy: number } | null = null;
  // LOC-03: set true on geolocation error; drives the app-level denial banner
  @state() private _locationError: boolean = false;
  // LOC-03: distinct copy — 'denied' (code 1) vs 'unavailable' (code 2/3)
  @state() private _locationErrorKind: 'denied' | 'unavailable' | null = null;

  // W1 (plan-checker fix): query accessor so _onNearMeRequested can call
  // requestUserLocation() imperatively without reaching through renderRoot.
  @query('bee-map') private _beeMap!: BeeMap;

  // Non-reactive private fields
  // _taxonCache is NOT @state — only _taxaOptions (the sorted option array) drives re-renders.
  private _taxonCache: Map<number, TaxonCacheEntry> = new Map();
  // D-10: MediaQueryList for display-mode: standalone, used to clear install state
  // when the app transitions to standalone mode after mount.
  private _standaloneQuery = matchMedia('(display-mode: standalone)');
  private _isRestoringFromHistory = false;
  // Session-coalescing (D-01/D-02): once the first settled viewport move of an
  // exploration session fires a pushState, subsequent moves replaceState onto it.
  // Resets to false on any non-viewport _replaceUrlState() call (D-03) and after
  // a popstate navigation (D-07), so the next pan/zoom starts a fresh entry.
  private _viewportSessionActive = false;
  // D-07 / NEAR: true while a near-me geolocation request is in flight.
  // Set true by _onNearMeRequested; cleared in _onUserLocationChanged on both
  // success and error paths. Non-reactive — toggling this must never trigger
  // a re-render on its own (the subsequent _filterState.bounds / _locationError
  // state mutations drive any needed renders).
  private _nearMePending = false;
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

  /**
   * Single gate: are we in a state where we intend to filter but may not have the filter
   * query result yet? True when either an ordinary filter is active OR a legacy taxon from
   * the URL is still being resolved (_filterResolving). Both the firstUpdated hide-all guard
   * and the _replaceUrlState/_writeViewportHistory URL-write suppression read this getter.
   */
  get intendedFilterActive(): boolean {
    // isFilterActive covers f.bounds !== null (Phase 999.8-03), so bounds-only state
    // correctly trips the hide-all gate (style-cache bypass — CLAUDE.md invariant).
    return isFilterActive(this._filterState) || this._filterResolving;
  }

  // Human-readable bounding box shown IN the "County, ecoregion, or place" input when a
  // bounds filter (near-me / shift-drag) is active. SW → NE corners (lat, lon).
  private get _boundsFilterLabel(): string {
    const b = this._filterState.bounds;
    if (b === null) return '';
    return `${b.south.toFixed(3)}, ${b.west.toFixed(3)} → ${b.north.toFixed(3)}, ${b.east.toFixed(3)}`;
  }

  /**
   * Current user location — exposed for Phase 153 "Near me" filter consumption.
   * Null until the user grants geolocation permission and the first GPS fix arrives.
   */
  get userLocation() { return this._userLocation; }

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
/* Region control relocated from <bee-map> (Phase 157): as a sibling of
   <bee-pane> in .content it can paint above the pane (z-index 2 > pane's 1),
   escaping <bee-map>'s z-index:0 stacking context — without deleting that
   load-bearing rule (keeps Mapbox bottom-right attribution below the pane). */
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
/* Collapsed pane: Phase 157 Part A — lay the filter toggle BESIDE (left of)
   the regions button, not stacked below it. The offset clears the widest
   region-button label ("Ecoregions"). Expanded geometry (.pane-list /
   .pane-table / narrow @media) is governed by the rules below, unchanged. */
bee-pane {
  top: 0.5em;
  right: calc(1em + 8rem);
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
.update-banner {
  position: fixed;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  left: 16px;
  right: 16px;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
  padding: 12px 16px;
  background: var(--banner-bg, var(--header-bg));
  color: var(--banner-text, #ffffff);
  border-left: 4px solid var(--banner-accent, var(--accent));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 40;
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}
.update-banner__body {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
}
.update-banner__body:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.update-banner__dismiss {
  background: transparent;
  border: none;
  color: var(--banner-text, #ffffff);
  opacity: 0.6;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}
.update-banner__dismiss:hover { opacity: 0.9; }
.update-banner__dismiss:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .update-banner {
    transition: none;
    animation: none;
  }
}
/* LOC-03: denial/unavailable banner — mirrors .update-banner with error accent color */
.location-error-banner {
  position: fixed;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  left: 16px;
  right: 16px;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
  padding: 12px 16px;
  background: var(--banner-bg, var(--header-bg));
  color: var(--banner-text, #ffffff);
  border-left: 4px solid #d9534f;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 40;
}
.location-error-banner__body {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}
.location-error-banner__dismiss {
  background: transparent;
  border: none;
  color: var(--banner-text, #ffffff);
  opacity: 0.6;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}
.location-error-banner__dismiss:hover { opacity: 0.9; }
.location-error-banner__dismiss:focus-visible { outline: 2px solid #d9534f; outline-offset: 2px; }
  `;

  render() {
    const regionLabel = this._boundaryMode === 'off' ? 'Regions'
      : this._boundaryMode === 'counties' ? 'Counties'
      : this._boundaryMode === 'ecoregions' ? 'Ecoregions'
      : 'Places';
    return html`
      <bee-header
        .offline=${this._offline}
        .cacheState=${this._cacheState}
        .primeProgress=${this._primeProgress}
        .freshnessLabel=${this._freshnessLabel}
        .storageEstimate=${this._storageEstimate}
        .updateAvailable=${this._updateAvailable}
        .installable=${this._installable}
        .iosInstructable=${this._iosInstructable}
      ></bee-header>
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
            .intendedFilterActive=${this.intendedFilterActive}
            .selectedOccIds=${this._selectedOccIds ? new Set(this._selectedOccIds) : null}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .viewState=${this._viewState}
            .filterState=${this._filterState}
            .hiddenSources=${this._hiddenSources}
            .offline=${this._offline}
            @view-moved=${this._onViewMoved}
            @map-click-occurrence=${this._onOccurrenceClick}
            @map-click-region=${this._onRegionClick}
            @map-click-empty=${this._onMapClickEmpty}
            @data-loaded=${this._onDataLoaded}
            @data-error=${this._onDataError}
            @place-selected=${this._onPlaceSelected}
            @selection-drawn=${this._onSelectionDrawn}
            @user-location-changed=${this._onUserLocationChanged}
          ></bee-map>
          <div class="region-control">
            ${this._regionMenuOpen ? html`
              <div class="region-menu">
                <button class=${this._boundaryMode === 'off' ? 'active' : ''} @click=${() => this._selectBoundaryMode('off')}>Off</button>
                <button class=${this._boundaryMode === 'counties' ? 'active' : ''} @click=${() => this._selectBoundaryMode('counties')}>Counties</button>
                <button class=${this._boundaryMode === 'ecoregions' ? 'active' : ''} @click=${() => this._selectBoundaryMode('ecoregions')}>Ecoregions</button>
                <button class=${this._boundaryMode === 'places' ? 'active' : ''} @click=${() => this._selectBoundaryMode('places')}>Places</button>
              </div>
            ` : ''}
            <button class="region-btn" @click=${this._toggleRegionMenu}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="1" y="1" width="6" height="6" rx="1"/>
                <rect x="9" y="1" width="6" height="6" rx="1"/>
                <rect x="1" y="9" width="6" height="6" rx="1"/>
                <rect x="9" y="9" width="6" height="6" rx="1"/>
              </svg>
              ${regionLabel}
            </button>
          </div>
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
            @near-me-requested=${this._onNearMeRequested}
            @near-me-cleared=${this._onNearMeCleared}
            .boundsFilterActive=${this._filterState.bounds !== null}
            .boundsFilterLabel=${this._boundsFilterLabel}
          ></bee-pane>
        </div>
      `}
      ${this._updateAvailable ? html`
        <div class="update-banner" role="status" aria-live="polite">
          <button
            class="update-banner__body"
            @click=${this._onBannerTap}
            aria-label="A data update is available, tap to reload"
          >A data update is available — tap to reload</button>
          <button
            class="update-banner__dismiss"
            @click=${this._onBannerDismiss}
            aria-label="Dismiss update for this session"
          >✕</button>
        </div>
      ` : ''}
      ${this._locationError ? html`
        <div class="location-error-banner" role="alert" aria-live="polite">
          <span class="location-error-banner__body">
            ${this._locationErrorKind === 'denied'
              ? 'Location access is blocked. To enable, go to Settings → Safari → Location.'
              : 'Unable to determine your location.'}
          </span>
          <button
            class="location-error-banner__dismiss"
            @click=${() => { this._locationError = false; }}
            aria-label="Dismiss location error"
          >✕</button>
        </div>
      ` : ''}
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
        bounds: initFilter.bounds ?? null,
      };
    }
    // If URL contains a legacy taxon name, start the await-taxaReady resolution flow.
    // _awaitLegacyTaxonResolution sets _filterResolving = true (feeds intendedFilterActive)
    // and waits for taxaReady before calling _resolveLegacyTaxon — no store-and-poll dance.
    if (initialParams.pendingLegacyTaxon) {
      this._awaitLegacyTaxonResolution(initialParams.pendingLegacyTaxon);
    }

    // Hide-all when intendedFilterActive is true is now carried structurally by passing
    // .intendedFilterActive=${this.intendedFilterActive} to <bee-map> (Plan 144-02).
    // <bee-map> renders filteredGeoJSON ?? empty when intendedFilterActive=true, so no
    // empty-collection pre-seed is needed here. The flash is prevented by construction.

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
    }
    // _runListQuery will be triggered by _onDataLoaded once SQLite is ready

    // Write initial URL state (covers fresh loads — makes URL bar show params
    // immediately). Skip while a legacy taxon name is pending resolution (_filterResolving):
    // the incoming URL already carries the meaningful taxon=<name>&taxonRank=<rank>, and
    // re-encoding _filterState now (taxonId still null) would drop it. The canonical integer
    // form is written from _loadSummaryFromSQLite once the taxon resolves.
    // NOTE: gate on !_filterResolving (not !intendedFilterActive) so an ordinary active
    // filter still writes its URL on first load — only pending-legacy resolution suppresses.
    if (!this._filterResolving) {
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
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
    window.addEventListener('cache-prime-progress', this._onPrimeProgress);
    window.addEventListener('cache-state-changed', this._onCacheStateChanged);
    window.addEventListener('sw-update-available', this._onSwUpdateAvailable);
    this.addEventListener('cache-popover-toggle', this._onPopoverToggle);
    this.addEventListener('cache-update-acted', this._onBannerTap);
    // D-09/D-10: install affordance listeners
    window.addEventListener('pwa-installable', this._onPwaInstallable);
    window.addEventListener('pwa-installed', this._onPwaInstalled);
    this.addEventListener('install-prompt', this._onInstallPrompt);
    // D-10: clear install button if display-mode flips to standalone after mount
    this._standaloneQuery.addEventListener('change', this._onStandaloneChange);
    // Initial freshness fetch + refresh cadence (PATTERNS.md Pitfall 6)
    void this._refreshFreshness();
    window.addEventListener('focus', this._refreshFreshness);
    // Phase 157: close the relocated region menu on outside click.
    document.addEventListener('click', this._onDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onPopState);
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    window.removeEventListener('cache-prime-progress', this._onPrimeProgress);
    window.removeEventListener('cache-state-changed', this._onCacheStateChanged);
    window.removeEventListener('sw-update-available', this._onSwUpdateAvailable);
    this.removeEventListener('cache-popover-toggle', this._onPopoverToggle);
    this.removeEventListener('cache-update-acted', this._onBannerTap);
    // D-09/D-10: install affordance cleanup
    window.removeEventListener('pwa-installable', this._onPwaInstallable);
    window.removeEventListener('pwa-installed', this._onPwaInstalled);
    this.removeEventListener('install-prompt', this._onInstallPrompt);
    this._standaloneQuery.removeEventListener('change', this._onStandaloneChange);
    window.removeEventListener('focus', this._refreshFreshness);
    document.removeEventListener('click', this._onDocumentClick);
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

      // Step 3: Backfill the display name for a taxon restored from the URL via integer
      // taxon_id — the URL carries only the id, so the "Species or group" input would
      // otherwise render empty despite an active filter. The legacy-name resolution path
      // now calls _resolveTaxonDisplayName itself (in _resolveLegacyTaxon on match), so
      // this covers only the integer-from-URL restore case.
      this._resolveTaxonDisplayName();

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
      // Signal the taxon-cache readiness barrier (ready.ts) UNCONDITIONALLY. The await-based
      // legacy resolver in firstUpdated/_onPopState is waiting on this; it sets
      // _filterResolving=true (hide-all) and only clears it once _resolveLegacyTaxon runs.
      // markTaxaReady() MUST fire even on the empty-DB early return and the catch path —
      // otherwise taxaReady never resolves, _filterResolving sticks true, and the map
      // renders empty forever. Idempotent (Promise.resolve is a no-op after the first call),
      // so the happy path (cache built above) and the failure paths (empty cache → resolver
      // finds no match → clears _filterResolving) are both correct.
      markTaxaReady();
    }
  }

  /**
   * Start the one-shot async legacy-taxon resolution flow: set _filterResolving, await
   * taxaReady (so the cache is guaranteed populated), then call _resolveLegacyTaxon.
   * Called from firstUpdated and _onPopState's legacy branch. Fire-and-forget (void) —
   * the caller already set the hide-all guard via _filterResolving.
   */
  private _awaitLegacyTaxonResolution(pending: { name: string; rank: string | null }): void {
    this._filterResolving = true;
    void (async () => {
      await taxaReady;
      this._resolveLegacyTaxon(pending);
    })();
  }

  /**
   * Resolve a legacy taxon {name, rank} record to a taxonId via _taxonCache lookup.
   * MUST be called only after taxaReady has resolved (cache guaranteed non-empty).
   * Uses rank for twin disambiguation (e.g. genus vs subgenus Bombus).
   * The raw name string is NEVER used in SQL — only in an in-memory equality lookup (T-130-LU).
   * Clears _filterResolving on both match and stale paths so intendedFilterActive re-evaluates.
   */
  private _resolveLegacyTaxon(pending: { name: string; rank: string | null }): void {
    const { name, rank } = pending;
    for (const [id, entry] of this._taxonCache) {
      if (entry.name === name && (rank === null || entry.rank === rank)) {
        this._filterState = { ...this._filterState, taxonId: id };
        this._filterResolving = false;
        if (isFilterActive(this._filterState)) {
          this._runFilterQuery();
          // Write canonical integer-form URL once legacy taxon resolves — replaces
          // the legacy taxon=<name>&taxonRank=<rank> with the integer form.
          // Safe: _filterResolving is now false so _replaceUrlState is unsuppressed.
          this._resolveTaxonDisplayName();
          this._replaceUrlState();
        }
        return;
      }
    }
    // No match found — stale bookmark; leave the taxon filter inactive. Clear the
    // hide-all guard (set in firstUpdated for the pending legacy taxon) so the full
    // set renders instead of an empty map — unless some OTHER URL filter is active.
    this._filterResolving = false;
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
    const hasSelection = selEcdysisIds.length > 0 || selInatIds.length > 0 || selInatObsIds.length > 0 || selChecklistIds.length > 0;
    const guarded = await this._listGuard(async () => {
      try {
        const { rows, total } = await queryListPage(
          this._filterState, this._listPage, this._tableSortBy,
          selEcdysisIds, selInatIds, selInatObsIds, selChecklistIds
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
      this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenSources: this._hiddenSources }
    );
  }

  private _replaceUrlState() {
    // Suppress writes while a legacy taxon name is pending resolution (_filterResolving) —
    // _filterState has no taxonId yet, so buildParams would drop the taxon and strand the
    // URL at ?x=&y=&z=. The integer-form URL is written from _loadSummaryFromSQLite once
    // the taxon cache loads and resolves it (Step 3c).
    if (this._filterResolving) return;
    // Every non-viewport state change (filter/selection/boundary/pane/source) ends the
    // current exploration session (D-03) so the next viewport move starts a fresh entry.
    this._viewportSessionActive = false;
    const params = this._buildCurrentParams();
    window.history.replaceState({}, '', '?' + params.toString());
  }

  private _writeViewportHistory() {
    // Called only from _onViewMoved (settled moveend path). Implements session-coalescing
    // (D-01/D-02): the first settled move of an exploration session pushes one history entry
    // and marks the session active; subsequent moves in the same session replaceState onto
    // it (keeping the URL live without adding entries).
    // IMPORTANT: writes replaceState DIRECTLY (not via _replaceUrlState()) to avoid
    // resetting _viewportSessionActive on every live-URL update (D-03 exclusion).
    if (this._filterResolving) return; // D-05: suppress during legacy-taxon resolution
    const url = '?' + this._buildCurrentParams().toString();
    if (!this._viewportSessionActive) {
      window.history.pushState({}, '', url);
      this._viewportSessionActive = true;
    } else {
      window.history.replaceState({}, '', url);
    }
  }

  private _onOnline = () => { this._offline = false; void this._refreshFreshness(); };
  private _onOffline = () => { this._offline = true; };

  // --- Phase 150 cache state handlers ---

  private _onPrimeProgress = (e: Event) => {
    const ce = e as CustomEvent<CachePrimeProgressDetail>;
    this._primeProgress = {
      received: ce.detail.received,
      total: ce.detail.total,
      assetInFlight: ce.detail.assetInFlight,
    };
  };

  private _onCacheStateChanged = (e: Event) => {
    const ce = e as CustomEvent<CacheStateChangedDetail>;
    this._cacheState = {
      ready: ce.detail.ready,
      cached: ce.detail.cached,
      missing: ce.detail.missing,
    };
  };

  private _onSwUpdateAvailable = () => { this._updateAvailable = true; };

  // --- Phase 151 install affordance handlers (D-09/D-10/D-11) ---

  // pwa-installable: dispatched by install-prompt.ts after capturing beforeinstallprompt.
  // Only set _installable = true if not already standalone (D-10 gate).
  private _onPwaInstallable = () => { if (!isStandalone()) this._installable = true; };

  // pwa-installed: dispatched by install-prompt.ts after appinstalled or after prompt() resolves.
  private _onPwaInstalled = () => { this._installable = false; };

  // install-prompt: upward CustomEvent from <bee-header> when Android Install button is clicked.
  // Calls window.__pwaPrompt?() which triggers the native install dialog (D-09).
  private _onInstallPrompt = () => {
    void (window as Window & { __pwaPrompt?: () => Promise<void> }).__pwaPrompt?.();
  };

  // Clears install state when the display-mode flips to standalone (e.g. after install).
  private _onStandaloneChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      this._installable = false;
      this._iosInstructable = false;
    }
  };

  private _onPopoverToggle = async (e: Event) => {
    const ce = e as CustomEvent<{ open: boolean }>;
    if (ce.detail.open) {
      this._storageEstimate = await this._readStorageEstimate();
    }
  };

  private _onBannerTap = () => {
    const wb = (window as Window & { __wb?: { messageSkipWaiting(): void } }).__wb;
    wb?.messageSkipWaiting();
    window.location.reload();
  };

  private _onBannerDismiss = () => { this._updateAvailable = false; };

  // LOC-02 / LOC-03 / NEAR-01: relay handler for user-location-changed from <bee-map>
  // On success: store position in _userLocation, clear error; if a near-me request is
  //   pending, compute a ±10 km box and apply it as _filterState.bounds (D-01/999.8).
  // On error: set _locationError true, clear stale _userLocation (security: T-152-04);
  //   clear _nearMePending so a bad-accuracy or denied fix cannot strand the flag (W2).
  private _onUserLocationChanged(
    e: CustomEvent<{ lat: number; lon: number; accuracy: number } | { error: { code: number; message: string } }>
  ) {
    if ('error' in e.detail) {
      this._locationError = true;
      this._locationErrorKind = e.detail.error.code === 1 ? 'denied' : 'unavailable';
      this._userLocation = null; // clear stale position on revocation (T-152-04)
      this._nearMePending = false; // D-08: denial clears pending flag; no bounds applied
    } else {
      // Validate accuracy is a finite non-negative number before storing (RESEARCH V5)
      const { lat, lon, accuracy } = e.detail;
      // W2 (plan-checker fix): clear _nearMePending here BEFORE the early-return so a
      // malformed fix (bad accuracy) cannot strand the pending flag indefinitely.
      if (!isFinite(accuracy) || accuracy < 0) {
        this._nearMePending = false;
        return;
      }
      this._userLocation = { lat, lon, accuracy };
      this._locationError = false;
      // NEAR-01 / D-02: if a near-me request is pending, compute the ±10 km box and
      // apply it via the shared bounds-selection path (same as shift-drag, D-01).
      if (this._nearMePending) {
        this._nearMePending = false;
        const box = boundsFromLocation({ lat, lon });
        if (box !== null) {
          this._applyBoundsFilter(box);
        }
      }
    }
  }

  // NEAR-01 / D-06: handler for near-me-requested from <bee-pane> button.
  // Sets the pending flag and triggers the GeolocateControl via the @query accessor.
  // The resulting user-location-changed success drives box-compute in _onUserLocationChanged.
  private _onNearMeRequested = () => {
    this._nearMePending = true;
    this._locationError = false; // clear any prior error so the new attempt starts clean
    // W1 (plan-checker fix): use the @query accessor to obtain a live element ref.
    // A null ref would make this a silent no-op — the guard surfaces that as a no-op
    // rather than crashing, but the acceptance assertion in tests verifies the ref resolves.
    this._beeMap?.requestUserLocation();
  };

  // NEAR-01 / D-07: handler for near-me-cleared from <bee-pane> ✕ button.
  // The ONLY path that clears _filterState.bounds (D-07).
  // D-04: does NOT touch _paneState. D-05: does NOT null record selection.
  private _onNearMeCleared = () => {
    this._nearMePending = false;
    this._filterState = { ...this._filterState, bounds: null };
    // Re-run so the map/list/table all drop the bounds constraint (a still-active
    // taxon/date filter would otherwise keep showing the stale bounded set). The list
    // must refresh too: under D-04 the pane is no longer force-collapsed on clear, so an
    // open list would otherwise show a stale bounded page (code review WR-01).
    this._listPage = 1;
    this._runFilterQuery();
    this._runListQuery();
    this._runTableQuery();
    this._replaceUrlState();
  };

  private _refreshFreshness = async () => {
    this._freshnessLabel = await loadFreshnessLabel();
  };

  private async _readStorageEstimate(): Promise<{ usageMB: string; quotaMB: string | null } | null> {
    if (typeof navigator.storage?.estimate !== 'function') return null;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      if (typeof usage !== 'number') return null;
      const usageMB = (usage / 1_048_576).toFixed(1);
      const quotaMB = (typeof quota === 'number' && quota > 0 && quota < 200 * 1_048_576)
        ? Math.round(quota / 1_048_576).toString()
        : null;
      return { usageMB, quotaMB };
    } catch {
      return null;
    }
  }

  private _onPopState = () => {
    this._isRestoringFromHistory = true;
    // D-07: reset session so the next user pan/zoom starts a new history entry.
    this._viewportSessionActive = false;
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
      bounds: parsed.filter?.bounds ?? null,
    };
    // Handle legacy taxon back-compat on history navigation via the same await-taxaReady
    // flow as firstUpdated. By the time popstate fires, taxaReady is already resolved
    // (cache loaded), so the await completes synchronously in the microtask queue.
    if (parsed.pendingLegacyTaxon) {
      this._awaitLegacyTaxonResolution(parsed.pendingLegacyTaxon);
    } else {
      this._filterResolving = false; // clear any stale flag from a previous navigation
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
    } else if (parsedSel?.type === 'cluster') {
      this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
      this._selectedOccIds = null;
    } else {
      this._selectedOccIds = null;
      this._selectedCluster = null;
    }

    // Derive final paneState once, after selection is known.
    // A selection always forces 'list'; otherwise use the URL-encoded value.
    const hasSelection = (parsedSel?.type === 'ids' && parsedSel.ids.length > 0)
      || parsedSel?.type === 'cluster';
    const finalPaneState = hasSelection ? 'list' : paneState;
    this._paneState = finalPaneState;
    if (finalPaneState === 'table') {
      this._runTableQuery();
    }
    if (finalPaneState === 'list') {
      this._listPage = 1;
      this._runListQuery();
    }

    // Run filter query for restored state.
    // Clear stale filtered data before the query resolves; hide-all is now carried
    // structurally by intendedFilterActive=true flowing to <bee-map> (Plan 144-02) —
    // bee-map renders filteredGeoJSON ?? empty, so null here → empty render → no flash.
    if (isFilterActive(this._filterState)) {
      this._visibleIds = null;
      this._filteredGeoJSON = null;
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
      this._writeViewportHistory();
    } else {
      // Reset the flag after bee-map reports the view has settled (D-06)
      this._isRestoringFromHistory = false;
    }
  }

  private _onOccurrenceClick(e: CustomEvent<{ occurrences: OccurrenceRow[]; occIds: string[]; centroid?: { lon: number; lat: number }; radiusM?: number }>) {
    this._selectedOccIds = e.detail.occIds;
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
    // D-05: bounds is a filter; do NOT clear it when opening the sidebar for a filter change
    this._paneState = 'list';
    this._listPage = 1;
    this._runListQuery();
  }

  // Shared bounds-filter state transition — called by BOTH _onSelectionDrawn (shift-drag)
  // and the near-me success path. Guarantees byte-identical _filterState.bounds (D-01).
  // D-04: does NOT touch _paneState (bounds is "just another filter" — no pane force-open).
  // D-05: does NOT null _selectedOccIds or _selectedCluster (bounds + record selection coexist).
  private _applyBoundsFilter(bounds: { west: number; south: number; east: number; north: number }): void {
    this._filterState = { ...this._filterState, bounds };
    this._listPage = 1;
    this._runFilterQuery();   // map: show only in-bounds occurrences
    this._runListQuery();     // list
    this._runTableQuery();    // table
    this._replaceUrlState();
  }

  private _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
    this._applyBoundsFilter(e.detail);
  }

  private _onMapClickEmpty() {
    if (this._boundaryMode !== 'off') {
      // Clear region filter and any open record selection (D-06: bounds filter is preserved)
      this._filterState = {
        ...this._filterState,
        selectedCounties: new Set(),
        selectedEcoregions: new Set(),
      };
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._paneState = 'collapsed';
      this._runFilterQuery().then(() => {
        this._replaceUrlState();
      });
      this._tablePage = 1;
      this._runTableQuery();
    } else {
      // Clear record selection only (D-06: bounds filter is preserved)
      this._selectedOccIds = null;
      this._selectedCluster = null;
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
      // D-05: FilterChangedEvent carries no bounds — preserve active bounds explicitly
      bounds: this._filterState.bounds,
    };

    // Auto-switch boundary layer to match newly added region filter type.
    if (detail.selectedCounties.size > prev.selectedCounties.size) {
      this._boundaryMode = 'counties';
    } else if (detail.selectedEcoregions.size > prev.selectedEcoregions.size) {
      this._boundaryMode = 'ecoregions';
    } else if (detail.selectedPlace !== null && prev.selectedPlace === null) {
      this._boundaryMode = 'places';
    }

    // Clear record selections when filter changes (D-05: bounds is preserved above)
    this._selectedOccIds = null;
    this._selectedCluster = null;
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
    // D-05: clearing per-record selection leaves bounds filter active
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
    // D-07: pane collapse does NOT clear bounds filter (only near-me-cleared does)
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

    // If a filter (including bounds) was restored from URL, run the map query now
    // that data is loaded. isFilterActive covers bounds (f.bounds !== null), so a
    // restored bbox= or legacy sel= box populates the map. The generation counter in
    // _runFilterQuery discards stale results, so this is safe even if firstUpdated
    // already started a query.
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

  private _toggleRegionMenu() {
    this._regionMenuOpen = !this._regionMenuOpen;
  }

  private _selectBoundaryMode(mode: 'off' | 'counties' | 'ecoregions' | 'places') {
    this._regionMenuOpen = false;
    if (mode === this._boundaryMode) return;
    this._applyBoundaryMode(mode);
  }

  // Close the region menu when a click lands outside the relocated control.
  // composedPath() pierces the shadow boundary; clicks on the button/menu keep
  // it open (mirrors the prior <bee-map> behavior).
  private _onDocumentClick = (e: MouseEvent) => {
    if (!this._regionMenuOpen) return;
    const control = this.renderRoot?.querySelector('.region-control');
    if (control && !e.composedPath().includes(control)) {
      this._regionMenuOpen = false;
    }
  };

  // Shared boundary-mode side effects (extracted from the former
  // _onBoundaryModeChanged event handler). Set the mode, clear the selected
  // place when leaving 'places' (re-running filter/table queries), and sync URL.
  private _applyBoundaryMode(newMode: 'off' | 'counties' | 'ecoregions' | 'places') {
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
