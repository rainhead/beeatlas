import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { BeeMap } from './bee-map.ts';
import { type FilterState, type CollectorEntry, type PlaceOption, isFilterActive, queryVisibleGeoJSON, queryTablePage, queryAllFiltered, buildCsvFilename, type OccurrenceRow, type SpecimenSortBy, queryListPage, getOccurrencePlaceSlugs, queryTaxaTree, type OccurrenceProperties, emptyFilterState, lookupByCatalogSuffix } from './filter.ts';
import type { TaxonNode } from './taxa-tree.ts';
import { parseOccId, occIdFromRow } from './occurrence.ts';
import { buildParams, parseParams, type TierKey } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
import { markTaxaReady, taxaReady } from './ready.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './filter.ts';
import { buildTaxonOptions, resolveTaxonDisplayName, type TaxonCacheEntry } from './taxa.ts';
import type { FeatureCollection, Point } from 'geojson';
import { makeStaleGuard } from './stale-guard.ts';
import { loadTaxonPages } from './taxon-pages.ts';
import { buildSearchIndex, rankCandidates, rollUpTaxonCounts, EMPTY_INDEX,
         type SearchIndex, type SearchCandidate } from './search.ts';
import type { CachePrimeProgressDetail, CacheStateChangedDetail } from './prime-orchestrator.ts';
import { loadBuildId, loadFreshnessLabel, resolveDataUrl } from './manifest.ts';
import { fetchWhoami, loadLastKnownIdentity, signOut, startSignIn, type AuthState } from './auth-client.ts';
import { loadBasemapManifest } from './basemap-cache.ts';
import { openDiagnostics } from './diagnostics.ts';
import {
  computeBasemapState,
  primeBasemap,
  type BasemapOfflineState,
  type BasemapPrimeProgressDetail,
} from './basemap-prime.ts';
import './bee-header.ts';
import type { SearchStatus } from './bee-header.ts';
import './bee-pane.ts';
import './bee-map.ts';

/** See connectedCallback: long enough for navigator.onLine to be trustworthy. */
const WHOAMI_DELAY_MS = 1200;

const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;
// beeatlas-8zs: how close to zoom when a catalog-number lookup centres the map on a
// specimen. Tight enough that the selected point is unambiguous among its neighbours,
// wide enough to keep the surrounding locality legible.
const CATALOG_LOOKUP_ZOOM = 12;

// beeatlas-d8j: how long the update banner waits for the new service worker to take
// control before reloading anyway. Control transfer is normally near-instant; this only
// has to cover a worker busy with in-flight fetches on a slow link. It is a backstop
// against a dead button, not a budget — if it ever fires we reload on the old worker,
// which is merely the old (broken) behaviour, not something worse.
const SW_CONTROL_TIMEOUT_MS = 3000;

/**
 * The slice of workbox-window's Workbox that the update banner drives. Structural, not
 * an import: sw-registration.ts owns the real instance and hands it over on `window.__wb`
 * (see the handoff note there), and bee-atlas must not pull workbox-window into the
 * non-/app bundle — index.html mounts this same component with no service worker at all.
 */
interface WorkboxUpdateHandle {
  messageSkipWaiting(): void;
  addEventListener(type: 'controlling', listener: () => void): void;
}

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

/**
 * Copy for a DENIED geolocation permission (beeatlas-8qb).
 *
 * The Settings path below is only true on iOS, and it used to be shown
 * everywhere: a desktop Chrome user was sent to a Safari settings screen that
 * does not exist on their machine — a dead end dressed up as instructions. iOS is
 * the field surface and keeps its tested wording; everyone else gets copy that is
 * true rather than specific, because no single path holds across Chrome, Firefox,
 * Edge and Android and none is worth asserting.
 */
function locationDeniedMessage(): string {
  return isIosSafari()
    ? 'Location access is blocked. To enable, go to Settings → Safari → Location.'
    : 'Location access is blocked. Re-enable location for this site in your browser settings.';
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
  @state() private _filterState: FilterState = emptyFilterState();

  @state() private _visibleIds: Set<string> | null = null;
  @state() private _filteredGeoJSON: FeatureCollection<Point, OccurrenceProperties> | null = null;
  @state() private _filteredRowCount: number | null = null;
  @state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' | 'wilderness' = 'off';
  // Region control menu open/close (relocated from <bee-map> in Phase 157).
  @state() private _regionMenuOpen = false;
  @state() private _paneState: 'collapsed' | 'list' | 'table' | 'taxa' = 'collapsed';
  // Taxa pane (beeatlas-0of.1) — bee-atlas owns this state; bee-taxa-tree presents it.
  @state() private _taxaTree: TaxonNode[] = [];
  @state() private _taxaLoading = false;
  @state() private _taxaSpeciesCount = 0;
  @state() private _taxaExcludedForNoElevation = 0;
  @state() private _taxonPages: Record<string, string> = {};
  // Guards against a slow taxa query overwriting a newer one — same hazard the
  // filter-race guard addresses for queryVisibleIds (CLAUDE.md invariant).
  private _taxaQueryGeneration = 0;
  @state() private _tablePage = 1;
  @state() private _tableSortBy: SpecimenSortBy = 'date';
  @state() private _tableRows: OccurrenceRow[] = [];
  @state() private _tableRowCount = 0;
  @state() private _tableLoading = false;
  @state() private _listRows: OccurrenceRow[] = [];
  @state() private _listRowCount = 0;
  @state() private _listPage = 1;
  @state() private _listLoading = false;
  // D-04: member-place names per displayed occurrence, keyed on occId. Resolved
  // HERE (the state owner) from the occurrence_places bridge (getOccurrencePlaceSlugs)
  // and the places_meta slug→name source, then passed DOWN through <bee-pane> to
  // <bee-occurrence-detail> as a property — presenters never query wa-sqlite
  // themselves (state-ownership invariant, CLAUDE.md).
  @state() private _placeNamesByOccId: Map<string, string[]> = new Map();
  @state() private _selectionCount: number | null = null;
  @state() private _selectedOccIds: string[] | null = null;
  @state() private _selectedCluster: { lon: number; lat: number; radiusM: number } | null = null;
  // beeatlas-8zs / beeatlas-v66: what came of the last search submitted from
  // <bee-header>. It carries the query, so the header shows the message only while
  // its field still reads that exact string — editing clears it without a second
  // round-trip through this component.
  //
  // `miss` and `error` are deliberately distinct: a miss means "we searched and
  // nothing has that number", an error means "we could not search". Reporting the
  // second as the first tells the user a specimen does not exist when it may well —
  // reachable on an offline cold-start, where tablesReady/getDB reject because the
  // wa-sqlite wasm is not cached.
  @state() private _searchStatus: SearchStatus | null = null;
  // WR-02 / CLAUDE.md "Filter race guard": the lookup awaits, so two fast Enters can
  // resolve out of order and let the slower one clobber the newer selection. Mirrors
  // the _placeNamesGeneration / makeStaleGuard pattern.
  private _catalogLookupGeneration = 0;
  @state() private _summary: DataSummary | null = null;
  @state() private _taxaOptions: TaxonOption[] = [];
  @state() private _countyOptions: string[] = [];
  @state() private _ecoregionOptions: string[] = [];
  @state() private _collectorOptions: CollectorEntry[] = [];
  // Header search (beeatlas-7nx.5, ADR 0028). The index is assembled here from the
  // option lists this component already owns; ranking is pure (src/search.ts).
  private _searchIndex: SearchIndex = EMPTY_INDEX;
  // Ranked answers to what is currently typed, handed down to <bee-header>
  // (beeatlas-7nx.4). Recomputed per keystroke; pure and in-memory, so no debounce.
  @state() private _searchCandidates: SearchCandidate[] = [];
  @state() private _searchCandidatesTruncated = false;
  // Record counts behind each searchable thing — the ranking tie-break. Queried once
  // (they change only when the DB reloads) and cached, so _rebuildSearchIndex stays
  // synchronous and can be re-run cheaply as its other inputs land.
  private _searchWeights: {
    taxa: Map<number, number>;
    counties: Map<string, number>;
    ecoregions: Map<string, number>;
    people: Map<string, number>;
  } | null = null;
  // Named places (beeatlas-7nx.3). Two shapes on purpose — see _loadPlaces.
  @state() private _placeOptions: PlaceOption[] = [];
  @state() private _placeNameBySlug: Map<string, string> = new Map();
  // One in-flight fetch, shared. The boot path and the D-04 detail path both want
  // places.json and used to fetch it separately (this component lazily for member
  // -place names, <bee-pane> eagerly-ish for its own options) — two requests for one
  // immutable, content-hashed artifact.
  private _placesPromise: Promise<void> | null = null;
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
  // beeatlas-d8j: the tap has been taken and we are waiting for the new worker to take
  // control. Reflected on the button so the wait — which is precisely when the link is
  // slow — reads as "working", not as a button that ignored the tap.
  @state() private _reloadPending: boolean = false;
  @state() private _freshnessLabel: string | null = null;
  // From the same manifest fetch as the freshness label (beeatlas-4uj). Loaded once:
  // unlike freshness, which is refreshed on a cadence because the DATA can move under
  // a long-lived tab, the build id cannot change without a reload.
  @state() private _buildId: string | null = null;
  @state() private _storageEstimate: { usageMB: string; quotaMB: string | null } | null = null;
  // Offline basemap (beeatlas-6rs). Separate from _cacheState because the basemap
  // is an opt-in download rather than something primed automatically.
  @state() private _basemapState: BasemapOfflineState | null = null;
  @state() private _basemapProgress: { received: number; total: number } | null = null;
  private _whoamiTimer: number | null = null;
  // D-09/D-10: true when beforeinstallprompt was captured and app is not yet standalone.
  @state() private _installable: boolean = false;
  // D-11/D-12: true on iOS Safari (not standalone); computed once at construction time.
  @state() private _iosInstructable: boolean = isIosSafari() && !isStandalone();
  // 178-07 gap fix: server-derived identity for the map-page <bee-header>, fetched by
  // this component (the state owner — bee-header stays a pure presenter). Mirrors the
  // controller in src/entries/bee-header.ts, which wires every non-map page.
  @state() private _authState: AuthState | null = null;

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
  // unnecessary re-cluster work in the map on outdated filter state.
  private _filterGuard = makeStaleGuard<{ geojson: FeatureCollection<Point, OccurrenceProperties>; ids: Set<string>; rowCount: number } | null>();
  private _tableGuard = makeStaleGuard<{ rows: OccurrenceRow[]; total: number }>();
  private _listGuard = makeStaleGuard<{ rows: OccurrenceRow[]; total: number; selectionCount: number | null }>();
  // Stale-result guard for the unguarded _resolvePlaceNames async chain (WR-02):
  // bump-and-capture so a superseded resolution cannot overwrite _placeNamesByOccId.
  private _placeNamesGeneration = 0;
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
/* Map toolbar (Phase 157): a top-right flex row holding the region control
   (relocated from <bee-map>) and — when the pane is collapsed — the filter
   toggle button, separated by a 0.5rem gap. The toolbar paints above the pane:
   z-index 2 > <bee-pane>'s :host z-index 1 > <bee-map>'s z-index 0 (the
   load-bearing rule that keeps the map's bottom-right attribution below the pane
   — RETAINED, not deleted).

   row-reverse pins the region control (first child) to the RIGHT edge — the same
   spot it occupies when the pane is expanded — so opening the sidebar (which
   turns the collapsed filter button into the panel) does NOT shift the regions
   button. The filter button tucks to its left. */
.map-toolbar {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 2;
  display: flex;
  flex-direction: row-reverse;
  gap: 0.5rem;
  align-items: flex-start;
}
.region-control {
  position: relative;
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
/* Collapsed: <bee-pane> renders only the filter toggle button — make it a flex
   item in the toolbar (override its :host position:absolute; the .map-toolbar
   descendant selector outranks :host) so it sits in the row to the right of the
   region button. Phase 157 Part A. */
.map-toolbar bee-pane {
  position: static;
}
/* Expanded (list/table): <bee-pane> becomes a panel positioned relative to
   .content, so the toolbar must stop being its containing block. display:contents
   dissolves the toolbar box; the region control re-establishes its own top-right
   placement and <bee-pane> resolves against .content again (no 8rem inset). */
.content.pane-list .map-toolbar,
.content.pane-taxa .map-toolbar,
.content.pane-table .map-toolbar {
  display: contents;
}
.content.pane-list .region-control,
.content.pane-taxa .region-control,
.content.pane-table .region-control {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 2;
}
.content.pane-list bee-pane {
  position: absolute;
  top: calc(0.5em + 2.5rem);
  right: 0.5em;
  bottom: 0.5em;
  width: 25rem;
  max-height: calc(100% - 1em);
}
.content.pane-table bee-pane,
.content.pane-taxa bee-pane {
  position: absolute;
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
      : this._boundaryMode === 'wilderness' ? 'Wilderness'
      : 'Places';
    return html`
      <bee-header
        .offline=${this._offline}
        .cacheState=${this._cacheState}
        .primeProgress=${this._primeProgress}
        .freshnessLabel=${this._freshnessLabel}
        .buildId=${this._buildId}
        .storageEstimate=${this._storageEstimate}
        .diagnosticsEnabled=${true}
        .basemapState=${this._basemapState}
        .basemapProgress=${this._basemapProgress}
        .updateAvailable=${this._updateAvailable}
        .installable=${this._installable}
        .iosInstructable=${this._iosInstructable}
        .authState=${this._authState}
        .searchEnabled=${true}
        .searchStatus=${this._searchStatus}
        .searchCandidates=${this._searchCandidates}
        .searchCandidatesTruncated=${this._searchCandidatesTruncated}
        @search-query=${this._onSearchQuery}
        @search-pick=${this._onSearchPick}
      ></bee-header>
      ${this._error ? html`<div class="error-overlay">${this._error}</div>` : ''}
      ${this._loading ? html`<div class="loading-overlay">Loading…</div>` : ''}
      ${this._error ? '' : html`
        <div class=${[
          'content',
          this._paneState === 'list' ? 'pane-list' : '',
          this._paneState === 'table' ? 'pane-table' : '',
          // beeatlas-0of.1: the taxa pane reuses the TABLE geometry (full-width
          // bottom panel). Its rows are name + evidence badge + counts, which read
          // as columns and do not fit the 25rem list panel; and it is a scrolling
          // reading surface, which is what that shape is for. Without a class here
          // bee-pane would inherit no positioning at all and render unplaced.
          this._paneState === 'taxa' ? 'pane-taxa' : '',
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
            .hiddenTiers=${this._filterState.hiddenTiers}
            .offline=${this._offline}
            .basemapPrimed=${this._basemapState?.primed ?? false}
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
          <div class="map-toolbar">
          <div class="region-control">
            ${this._regionMenuOpen ? html`
              <div class="region-menu">
                <button class=${this._boundaryMode === 'off' ? 'active' : ''} @click=${() => this._selectBoundaryMode('off')}>Off</button>
                <button class=${this._boundaryMode === 'counties' ? 'active' : ''} @click=${() => this._selectBoundaryMode('counties')}>Counties</button>
                <button class=${this._boundaryMode === 'ecoregions' ? 'active' : ''} @click=${() => this._selectBoundaryMode('ecoregions')}>Ecoregions</button>
                <button class=${this._boundaryMode === 'places' ? 'active' : ''} @click=${() => this._selectBoundaryMode('places')}>Places</button>
                <button class=${this._boundaryMode === 'wilderness' ? 'active' : ''} @click=${() => this._selectBoundaryMode('wilderness')}>Wilderness</button>
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
            .taxaTree=${this._taxaTree}
            .taxaLoading=${this._taxaLoading}
            .taxaSpeciesCount=${this._taxaSpeciesCount}
            .taxaExcludedForNoElevation=${this._taxaExcludedForNoElevation}
            .taxonPages=${this._taxonPages}
            .filterState=${this._filterState}
            .taxaOptions=${this._taxaOptions}
            .taxonCache=${this._taxonCache}
            .countyOptions=${this._countyOptions}
            .ecoregionOptions=${this._ecoregionOptions}
            .collectorOptions=${this._collectorOptions}
            .placeOptions=${this._placeOptions}
            .placeNameBySlug=${this._placeNameBySlug}
            .summary=${this._summary}
            .specimenCount=${isFilterActive(this._filterState) ? this._filteredRowCount : null}
            .listRows=${this._listRows}
            .placeNames=${this._placeNamesByOccId}
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
            .hiddenTiers=${this._filterState.hiddenTiers}
            @filter-changed=${this._onFilterChanged}
            @tier-filter-changed=${this._onTierFilterChanged}
            @pane-expand-list=${this._onPaneExpandList}
            @pane-collapse=${this._onPaneCollapse}
            @pane-expand-table=${this._onPaneExpandTable}
            @pane-shrink-list=${this._onPaneShrinkList}
            @pane-show-taxa=${this._onPaneShowTaxa}
            @taxon-selected=${this._onTaxonSelected}
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
        </div>
      `}
      ${this._updateAvailable ? html`
        <div class="update-banner" role="status" aria-live="polite">
          <button
            class="update-banner__body"
            @click=${this._onBannerTap}
            ?disabled=${this._reloadPending}
            aria-busy=${this._reloadPending ? 'true' : 'false'}
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
              ? locationDeniedMessage()
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
        // hiddenTiers from filter (hasFilter recognizes tier=/legacy src=); belt-and-suspenders fallback to ui
        hiddenTiers: initFilter.hiddenTiers ?? initialParams.ui?.hiddenTiers ?? new Set(),
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
        { boundaryMode: initBoundaryMode, paneState, hiddenTiers: this._filterState.hiddenTiers }
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
        // Deep link (?pane=taxa): same reasoning — the tree needs SQLite, not just
        // tablesReady, so it cannot run from the constructor.
        if (this._paneState === 'taxa') {
          this._runTaxaQuery();
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
    window.addEventListener('basemap-prime-progress', this._onBasemapProgress);
    window.addEventListener('basemap-state-changed', this._onBasemapStateChanged);
    this.addEventListener('basemap-download-requested', this._onBasemapDownloadRequested);
    this.addEventListener('diagnostics-requested', this._onDiagnosticsRequested);
    this._refreshBasemapState();
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
    // beeatlas-1dc: seed the header from the last identity the server confirmed
    // on this device. Synchronous, network-free, and immediate — which is what
    // makes an offline cold start show who you are at all, since the deferred
    // check below is cancelled outright by the 'offline' event.
    const known = loadLastKnownIdentity();
    if (known.authenticated) this._authState = known;

    // 178-07 gap fix: fetch whoami for the map-page header. fetchWhoami() never
    // throws — it resolves to that same last-known identity on any network
    // error — so this never blocks or delays map init (mirrors
    // src/entries/bee-header.ts).
    //
    // DEFERRED, because at page-init `navigator.onLine` is not yet trustworthy:
    // on a real iPhone in airplane mode it still read true at 110 ms and only
    // flipped to false later, so fetchWhoami's own offline guard fired too early
    // to help and the request went out anyway — and on iOS a failed request in an
    // installed app raises the system "Turn On Wi-Fi" modal over the map. A
    // second of delay costs an identity chip appearing slightly late; it buys not
    // interrupting someone in the field. The 'online' handler re-runs it.
    this._whoamiTimer = window.setTimeout(() => {
      void fetchWhoami().then((state) => { this._authState = state; });
    }, WHOAMI_DELAY_MS);
    this.addEventListener('sign-in', this._onSignIn);
    this.addEventListener('sign-out', this._onSignOut);
  }

  disconnectedCallback() {
    if (this._whoamiTimer !== null) { clearTimeout(this._whoamiTimer); this._whoamiTimer = null; }
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onPopState);
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    window.removeEventListener('cache-prime-progress', this._onPrimeProgress);
    window.removeEventListener('cache-state-changed', this._onCacheStateChanged);
    window.removeEventListener('basemap-prime-progress', this._onBasemapProgress);
    window.removeEventListener('basemap-state-changed', this._onBasemapStateChanged);
    this.removeEventListener('basemap-download-requested', this._onBasemapDownloadRequested);
    this.removeEventListener('diagnostics-requested', this._onDiagnosticsRequested);
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
    this.removeEventListener('sign-in', this._onSignIn);
    this.removeEventListener('sign-out', this._onSignOut);
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
      this._rebuildSearchIndex();

      // Step 3: Backfill the display name for a taxon restored from the URL via integer
      // taxon_id — the URL carries only the id, so the "Species or group" input would
      // otherwise render empty despite an active filter. The legacy-name resolution path
      // now calls _resolveTaxonDisplayName itself (in _resolveLegacyTaxon on match), so
      // this covers only the integer-from-URL restore case.
      this._resolveTaxonDisplayName();

      // County and ecoregion options.
      //
      // Filled into LOCALS and assigned once each, rather than assigned empty and
      // pushed into. The old shape opened a window: `this._ecoregionOptions = []`
      // wiped the list, an `await` sat on either side, and any other loader that
      // rebuilt the search index in between saw counties populated and ecoregions
      // empty — after which nothing rebuilt, so ecoregions were silently missing
      // from search while counties were present (beeatlas-7nx.5, caught in the app).
      // Assign-then-mutate also hides the change from Lit, which only reacts to the
      // assignment.
      const counties: string[] = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT county FROM occurrences WHERE county IS NOT NULL ORDER BY county`,
        (rowValues: unknown[]) => { counties.push(String(rowValues[0])); }
      );
      const ecoregions: string[] = [];
      await sqlite3.exec(db,
        `SELECT DISTINCT ecoregion_l3 FROM occurrences WHERE ecoregion_l3 IS NOT NULL ORDER BY ecoregion_l3`,
        (rowValues: unknown[]) => { ecoregions.push(String(rowValues[0])); }
      );
      this._countyOptions = counties;
      this._ecoregionOptions = ecoregions;
      this._rebuildSearchIndex();

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
          // Every OTHER _filterState write re-runs the pane queries too; this one
          // only refreshed the map, which made the panes depend on a RACE. A legacy
          // ?taxon=<name> link resolves on taxaReady, while the pane queries fire on
          // loadOccurrencesTable() — whichever lands first wins. When SQLite won, the
          // pane kept the pre-resolution (unfiltered) result forever: ?taxon=Bombus&
          // taxonRank=genus&pane=taxa rendered all 92 species above 1700 m instead of
          // Bombus's 17. The table pane happened to win the race in local testing,
          // which is exactly why this was invisible. Re-run them all here.
          this._listPage = 1;
          this._runListQuery();
          this._runTableQuery();
          this._runTaxaQuery();
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
      this._rebuildSearchIndex();
    } catch (err) {
      console.error('Failed to load collector options:', err);
      // leave _collectorOptions unchanged
    }
  }

  /**
   * Load the named places (beeatlas-7nx.3).
   *
   * This used to live in <bee-pane>, which fetched it for itself — the one option
   * list that did not come down as a property. Hoisting it restores the state
   * ownership invariant and gives search the corpus it needs without a second fetch.
   *
   * TWO SHAPES, DELIBERATELY. The NAME MAP keeps every place, because a chip has to
   * resolve whatever slug the URL carries, even for a place with no records. The
   * OPTION LIST keeps only places with records, because both the autocomplete and
   * search offer a filter, and a place filter that can only ever produce an empty
   * map punishes being picked. <bee-pane> drew exactly this distinction; it is
   * preserved rather than reinvented.
   *
   * A failed fetch leaves both empty and says nothing: the chip falls back to the
   * raw slug, which is what it did before. This runs on the boot path, so it must
   * never throw.
   */
  /**
   * Count the records behind every searchable thing (beeatlas-7nx.5).
   *
   * Deliberately its own pass rather than widening the DISTINCT queries that feed
   * the pane's autocompletes: those serve a different surface with a different
   * shape, and a weight is only ever needed by search. Four GROUP BYs over a table
   * that is already resident cost single-digit milliseconds.
   *
   * The people query mirrors _loadCollectorOptions' WHERE exactly — the same rows
   * that become options must be the rows that get counted, or a collector ranks on
   * a number that does not describe the option beside it.
   */
  private async _loadSearchWeights(): Promise<void> {
    try {
      await tablesReady;
      const { sqlite3, db } = await getDB();
      const taxa = new Map<number, number>();
      const counties = new Map<string, number>();
      const ecoregions = new Map<string, number>();
      const people = new Map<string, number>();

      await sqlite3.exec(db,
        `SELECT taxon_id, COUNT(*) AS n FROM occurrences WHERE taxon_id IS NOT NULL GROUP BY taxon_id`,
        (v: unknown[]) => { taxa.set(Number(v[0]), Number(v[1])); });
      await sqlite3.exec(db,
        `SELECT county, COUNT(*) AS n FROM occurrences WHERE county IS NOT NULL GROUP BY county`,
        (v: unknown[]) => { counties.set(String(v[0]), Number(v[1])); });
      await sqlite3.exec(db,
        `SELECT ecoregion_l3, COUNT(*) AS n FROM occurrences WHERE ecoregion_l3 IS NOT NULL GROUP BY ecoregion_l3`,
        (v: unknown[]) => { ecoregions.set(String(v[0]), Number(v[1])); });
      await sqlite3.exec(db,
        `SELECT recordedBy, COUNT(*) AS n FROM occurrences
          WHERE recordedBy IS NOT NULL AND ecdysis_id IS NOT NULL GROUP BY recordedBy`,
        (v: unknown[]) => { people.set(String(v[0]), Number(v[1])); });

      this._searchWeights = { taxa, counties, ecoregions, people };
      this._rebuildSearchIndex();
    } catch (err) {
      console.error('Failed to load search weights:', err);
      // Leave the index as it stands; search degrades to whatever is already built
      // rather than throwing on the boot path.
    }
  }

  /**
   * Assemble the search index from whatever has loaded so far (beeatlas-7nx.5).
   *
   * Synchronous, idempotent, and safe to call repeatedly: its inputs arrive from
   * four independent async paths (the DB's option lists, the weights, places.json,
   * the taxon→page map) and there is no ordering between them. Each one calls this
   * when it lands, and the index simply gets better. Searching before everything has
   * arrived returns fewer candidates, never wrong ones.
   */
  private _rebuildSearchIndex(): void {
    const w = this._searchWeights;
    if (w === null) return; // nothing can be ranked without weights

    // A genus earns the weight of its species — see rollUpTaxonCounts. Without this
    // Bombus sorts below every bumblebee for the query "bombus".
    const taxonWeights = rollUpTaxonCounts(w.taxa, this._taxonCache);

    this._searchIndex = buildSearchIndex({
      taxa: this._taxaOptions.map(o => ({
        taxonId: o.taxonId,
        // The plain name is what a reader types; o.label carries "(genus)".
        name: this._taxonCache.get(o.taxonId)?.name ?? o.label,
        label: o.label,
        rank: o.rank,
        weight: taxonWeights.get(o.taxonId) ?? 0,
        // Absent for families and for the ~20 taxa with no published page. null is
        // the honest answer; a string-munged /species/ URL would be a 404.
        href: this._taxonPages[String(o.taxonId)] ?? null,
      })),
      people: this._collectorOptions.map(c => ({
        collector: c,
        weight: c.recordedBy === null ? 0 : (w.people.get(c.recordedBy) ?? 0),
        // NO LINK YET, on purpose. A collector page exists only for the logins in
        // collectors.json (124 of the 158 that appear on occurrences — 22% would
        // 404), and that file is 2.8 MB, far too heavy for the boot path just to
        // learn which. It needs the slim published map that taxon-pages.ts already
        // established for taxa; filed separately.
        href: null,
      })),
      places: this._placeOptions.map(p => ({
        slug: p.slug,
        name: p.name,
        landOwner: p.landOwner,
        weight: p.specimenCount + p.sampleCount,
        // Every place in places.json is paginated into a page (_pages/place-detail.njk).
        href: `/places/${p.slug}.html`,
      })),
      counties: this._countyOptions.map(name => ({ name, weight: w.counties.get(name) ?? 0 })),
      ecoregions: this._ecoregionOptions.map(name => ({ name, weight: w.ecoregions.get(name) ?? 0 })),
    });
  }

  private _loadPlaces(): Promise<void> {
    if (this._placesPromise !== null) return this._placesPromise;
    this._placesPromise = (async () => {
      try {
        const url = await resolveDataUrl('places_meta');
        if (!url) return;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const records = await resp.json() as {
          slug?: string; name?: string; land_owner?: string | null;
          specimen_count?: number; sample_count?: number;
        }[];
        const nameMap = new Map<string, string>();
        const options: PlaceOption[] = [];
        for (const r of records) {
          if (!r.slug || !r.name) continue;
          nameMap.set(r.slug, r.name);
          const specimenCount = r.specimen_count ?? 0;
          const sampleCount = r.sample_count ?? 0;
          if (specimenCount > 0 || sampleCount > 0) {
            options.push({
              slug: r.slug,
              name: r.name,
              landOwner: r.land_owner ?? null,
              specimenCount,
              sampleCount,
            });
          }
        }
        this._placeNameBySlug = nameMap;
        this._placeOptions = options;
      } catch {
        // Leave both empty — see above. Memoized either way: a failed fetch is not
        // retried, which is what the D-04 loader did before and keeps a dead
        // artifact from being re-requested once per detail card.
      }
    })();
    return this._placesPromise;
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
      this._rebuildSearchIndex();
    } catch (err) {
      console.error('Failed to load county/ecoregion options:', err);
    }
  }

  private async _runTaxaQuery(): Promise<void> {
    if (this._paneState !== 'taxa') return;
    // Lazy, cached, and never on the startup path: the map is only needed once the
    // taxa pane exists. loadTaxonPages never rejects — no links beats dead links.
    if (Object.keys(this._taxonPages).length === 0) {
      loadTaxonPages().then((m) => { this._taxonPages = m; });
    }
    this._taxaLoading = true;
    const generation = ++this._taxaQueryGeneration;
    try {
      const { tree, speciesCount, excludedForNoElevation } = await queryTaxaTree(this._filterState);
      // Discard a stale result: the user changed the filter while this was in
      // flight, and a late answer would silently replace the current one.
      if (generation !== this._taxaQueryGeneration) return;
      this._taxaTree = tree;
      this._taxaSpeciesCount = speciesCount;
      this._taxaExcludedForNoElevation = excludedForNoElevation;
    } catch (err: unknown) {
      if (generation !== this._taxaQueryGeneration) return;
      console.error('Taxa query failed:', err);
      this._taxaTree = [];
      this._taxaSpeciesCount = 0;
      this._taxaExcludedForNoElevation = 0;
    } finally {
      if (generation === this._taxaQueryGeneration) this._taxaLoading = false;
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
    // D-04: resolve member-place names for the freshly loaded rows. Fire-and-forget;
    // the await chain assigns _placeNamesByOccId (a @state field) which re-renders
    // the detail pane once membership resolves.
    void this._resolvePlaceNames(this._listRows);
  }

  // D-04: the slug→name map, for the member-place names that flow DOWN to
  // <bee-occurrence-detail>. Shares the one places.json fetch with the option lists
  // (beeatlas-7nx.3) rather than issuing its own.
  private async _ensurePlaceNameBySlug(): Promise<Map<string, string>> {
    await this._loadPlaces();
    return this._placeNameBySlug;
  }

  // D-04: for each displayed occurrence, query the occurrence_places bridge
  // (getOccurrencePlaceSlugs — the wa-sqlite call lives HERE, not in a presenter)
  // and map slugs to display names, sorted/deduped for determinism.
  private async _resolvePlaceNames(rows: OccurrenceRow[]): Promise<void> {
    // WR-02: guard against out-of-order resolutions. Mirrors the
    // _filterQueryGeneration / makeStaleGuard pattern — capture the generation at
    // the start; after every await point, bail if a newer call has superseded us so
    // a slower resolution cannot clobber _placeNamesByOccId with stale membership.
    const myGen = ++this._placeNamesGeneration;
    const occIds = [...new Set(rows.map(occIdFromRow).filter((id): id is string => id != null))];
    if (occIds.length === 0) { this._placeNamesByOccId = new Map(); return; }
    const nameBySlug = await this._ensurePlaceNameBySlug();
    if (myGen !== this._placeNamesGeneration) return; // superseded
    const byOccId = new Map<string, string[]>();
    await Promise.all(occIds.map(async occId => {
      const slugs = await getOccurrencePlaceSlugs(occId);
      const names = [...new Set(slugs.map(s => nameBySlug.get(s) ?? s))].sort();
      if (names.length > 0) byOccId.set(occId, names);
    }));
    if (myGen !== this._placeNamesGeneration) return; // superseded
    this._placeNamesByOccId = byOccId;
  }

  // --- URL state ---

  private _buildCurrentParams(): URLSearchParams {
    return buildParams(
      this._currentView,
      this._filterState,
      this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
      { boundaryMode: this._boundaryMode, paneState: this._paneState, hiddenTiers: this._filterState.hiddenTiers }
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

  // Re-check identity on reconnect: the last-known identity the header is
  // showing is unverified until the server confirms it, and only reconnecting
  // can. This is the field flow, not an edge case — the app is opened with no
  // signal and gets connectivity later. Also refresh the offline-maps row,
  // which is likewise unanswerable offline.
  private _onOnline = () => {
    this._offline = false;
    void this._refreshFreshness();
    void fetchWhoami().then((state) => { this._authState = state; });
    this._refreshBasemapState();
  };
  private _onOffline = () => {
    this._offline = true;
    // Cancel the pending identity check rather than letting it race the platform.
    // WHOAMI_DELAY_MS is a guess at how long navigator.onLine takes to become
    // trustworthy; this 'offline' event is the platform telling us directly, so
    // whichever arrives first, the doomed request is not sent. Identity is
    // re-fetched on 'online', so nothing is lost by skipping it.
    if (this._whoamiTimer !== null) { clearTimeout(this._whoamiTimer); this._whoamiTimer = null; }
  };

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

  // --- beeatlas-6rs offline basemap ---

  private _onBasemapProgress = (e: Event) => {
    const ce = e as CustomEvent<BasemapPrimeProgressDetail>;
    this._basemapProgress = { received: ce.detail.received, total: ce.detail.total };
  };

  private _onBasemapStateChanged = (e: Event) => {
    this._basemapState = (e as CustomEvent<BasemapOfflineState>).detail;
  };

  /**
   * The user chose to download the basemap from the account menu.
   *
   * The manifest is re-read rather than remembered from <bee-map>: it is a few
   * hundred bytes served from Cache Storage when the network cannot supply it,
   * and reading it here keeps the download from depending on the map having
   * mounted and resolved a style first.
   */
  private _onBasemapDownloadRequested = () => {
    void (async () => {
      const manifest = await loadBasemapManifest();
      if (!manifest) return;
      await primeBasemap(manifest);
    })();
  };

  // The account menu's Diagnostics row. The panel is the only way to read this
  // device's state on an installed PWA, which has no address bar and no console.
  private _onDiagnosticsRequested = () => { openDiagnostics(); };

  /** Recompute the offer's state — on mount, and whenever install status flips. */
  private _refreshBasemapState = () => {
    void (async () => {
      this._basemapState = await computeBasemapState(await loadBasemapManifest());
    })();
  };

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

  // --- 178-07 gap fix: map-page auth wiring (mirrors src/entries/bee-header.ts) ---

  // sign-in: upward CustomEvent from <bee-header> when the "Sign in with
  // iNaturalist" button is clicked. No fetch/mutation here — startSignIn()
  // navigates the browser away.
  private _onSignIn = () => {
    startSignIn(window.location.href);
  };

  // sign-out: upward CustomEvent from <bee-header> when the "Sign out" button
  // is clicked. Calls auth-client's signOut() then re-fetches whoami so the
  // header re-renders as anonymous.
  private _onSignOut = () => {
    void signOut().then(() => fetchWhoami()).then((state) => { this._authState = state; });
  };

  private _onPopoverToggle = async (e: Event) => {
    const ce = e as CustomEvent<{ open: boolean }>;
    if (ce.detail.open) {
      this._storageEstimate = await this._readStorageEstimate();
    }
  };

  /**
   * Take the update: hand control to the waiting worker, THEN reload (beeatlas-d8j).
   *
   * Order is the whole fix. `messageSkipWaiting()` only POSTS {type:'SKIP_WAITING'};
   * the waiting worker then calls skipWaiting() (src/sw.ts) and must activate and take
   * over this client before a reload is served ITS assets. Reloading on the same tick
   * races that and normally loses — the OLD worker handles the navigation, and since
   * every /app/ navigation is answered from the precached app shell (the NavigationRoute
   * in src/sw.ts), the page comes back on the old index.html and the old bundle. That is
   * why tapping again a moment later works: by then the new worker has activated.
   *
   * A slow link widens the window at both ends — in-flight fetches keep the old worker
   * busy processing the message, and the navigation itself is slower — which is exactly
   * the condition this was reported under.
   *
   * So: listen for `controlling` FIRST, post second, reload only once control has
   * actually transferred. This is the documented workbox-window ordering.
   *
   * The listener is attached here rather than globally in sw-registration.ts on purpose:
   * `controlling` also fires when ANOTHER tab takes an update, and a tab the user is
   * working in should not silently reload underneath them.
   */
  private _onBannerTap = () => {
    if (this._reloadPending) return; // a second tap must not stack another reload
    this._reloadPending = true;
    const wb = (window as Window & { __wb?: WorkboxUpdateHandle }).__wb;
    // No worker to wait on (SW unsupported, or registration failed): reload straight
    // away, exactly as before — there is no control transfer to wait for.
    if (!wb) { window.location.reload(); return; }

    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    wb.addEventListener('controlling', reload);
    wb.messageSkipWaiting();
    // Backstop: if nothing is actually waiting — a stale banner, or a message the
    // worker never processes — `controlling` never fires and the button would be dead.
    // Reloading anyway is no worse than the behaviour this replaced.
    window.setTimeout(reload, SW_CONTROL_TIMEOUT_MS);
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
    this._runTaxaQuery();
    this._replaceUrlState();
  };

  private _refreshFreshness = async () => {
    this._freshnessLabel = await loadFreshnessLabel();
    if (this._buildId === null) this._buildId = await loadBuildId();
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
      hiddenTiers: parsed.filter?.hiddenTiers ?? parsed.ui?.hiddenTiers ?? new Set(),
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
      this._runTaxaQuery();
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

  // beeatlas-8zs / v66 / 7nx: answer a row the reader chose in <bee-header>.
  //
  // The header ranks nothing and resolves nothing: it emits `search-query` to ask
  // for candidates and `search-pick` to report the choice. The seam v66 named for
  // what it would become is now what it became — `search-submit` is retired, since
  // Enter on the field just means "pick the first candidate".
  //
  // A label number is the ONLY kind that still has to ask the DB here. Every other
  // kind names a set, and _applyViewCandidate applies it from data the candidate
  // already carries (ADR 0028).
  //
  // Jumping to the specimen named by a physical label number is a SELECTION, not a
  // filter (the 999.8 separation): it resolves the typed number to an occ_id and
  // opens the same detail card a map click would, leaving FilterState's SHAPE
  // untouched.
  //
  // The one thing it does touch is the filter's VALUE, and only when it has to: an
  // active filter that excludes the resolved specimen would intersect it away in
  // queryListPage and hide its point on the map, leaving "1 selected" over an empty
  // card. Reaching the specimen is what the user asked for, so the filter yields.
  //
  // NOTE the yield is NOT recoverable via Back. Filter changes are written with
  // replaceState (_replaceUrlState), so clearing the filter overwrites the very entry
  // that held it; Back lands on the last PUSHED entry, which is a viewport session
  // (_writeViewportHistory) and may predate the filter entirely. Making the yield
  // undoable would mean pushing an entry before the clear — a deliberate change to
  // history behaviour, not a comment fix, so it is left alone here.
  private _onSearchQuery = (e: CustomEvent<{ query: string }>) => {
    const typed = e.detail.query.trim();
    if (typed === '') {
      this._catalogLookupGeneration++; // an emptied field abandons the lookup too
      this._searchCandidates = [];
      this._searchCandidatesTruncated = false;
      // An emptied field has not failed at anything — retire the message with it.
      this._searchStatus = null;
      return;
    }
    // A NEW QUERY SUPERSEDES WHATEVER IS IN FLIGHT, whatever it turns out to be.
    // The bump belongs here, not only on a pick: the reader has moved on the moment
    // they type, and a query that ranks to nothing never produces a pick at all. The
    // guard was originally bumped on every submission for exactly this reason —
    // without it, a label lookup started before the reader retyped lands late,
    // replaces the message they are looking at, and moves the map to a specimen they
    // had already abandoned.
    this._catalogLookupGeneration++;

    const { candidates, truncated } = rankCandidates(this._searchIndex, typed);
    this._searchCandidates = candidates;
    this._searchCandidatesTruncated = truncated;
    // A query nothing answers to is a miss the moment it is ranked — the reader
    // should not have to press Enter to be told there is nothing there. A ranking
    // that DID find something supersedes whatever message was showing; the header
    // renders a status only while the field still holds its query, so this only
    // ever clears a message that is already hidden.
    this._searchStatus = candidates.length === 0 ? { query: typed, kind: 'miss' } : null;
  };

  private _onSearchPick = async (e: CustomEvent<{ candidate: SearchCandidate; query: string }>) => {
    const candidate = e.detail.candidate;
    const typed = e.detail.query.trim();
    // Bump the generation on EVERY submission, before the validity checks — a
    // submission supersedes whatever is in flight regardless of what it turns out
    // to be. Bumping only for lookups we actually run leaves the hole this guard
    // exists to close: submit a good number, then a malformed one, and the earlier
    // lookup still lands, overwriting the newer answer and moving the map.
    const myGen = ++this._catalogLookupGeneration;
    // A view is applied synchronously from what the candidate already carries. Only
    // a label row still has to ask the DB — it names a record it has not fetched
    // (ADR 0028), which is why it alone can come back a miss.
    if (candidate.kind !== 'label') { this._applyViewCandidate(candidate, typed); return; }

    let result;
    try {
      result = await lookupByCatalogSuffix(candidate.suffix, this._filterState);
    } catch (err) {
      console.error('Catalog lookup failed:', err);
      if (myGen !== this._catalogLookupGeneration) return; // superseded
      // NOT a miss: we never got an answer, so we must not claim there is none.
      this._searchStatus = { query: typed, kind: 'error' };
      return;
    }
    if (myGen !== this._catalogLookupGeneration) return; // superseded
    if (result.rows.length === 0) { this._searchStatus = { query: typed, kind: 'miss' }; return; }

    const occIds = result.rows
      .map(row => occIdFromRow(row))
      .filter((id): id is string => id !== null);
    if (occIds.length === 0) { this._searchStatus = { query: typed, kind: 'miss' }; return; }

    // Reported, not left blank: the header closes its popover on a hit, and it
    // cannot tell "resolved" from "nothing has been searched for yet".
    this._searchStatus = { query: typed, kind: 'hit' };
    const filterCleared = result.hiddenByFilter;
    if (filterCleared) this._filterState = emptyFilterState();
    this._selectedOccIds = occIds;
    this._selectedCluster = null;
    this._paneState = 'list';
    this._listPage = 1;

    // Centre the map on the specimen — a label number carries no hint of where the
    // record is, so leaving the viewport put would land the selection off-screen.
    // Zoom in only if the current view is wider than CATALOG_LOOKUP_ZOOM; never
    // zoom a user back OUT of a closer view they had chosen.
    const { lat, lon } = result.rows[0]!;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      this._viewState = { lat, lon, zoom: Math.max(this._currentView.zoom, CATALOG_LOOKUP_ZOOM) };
    }

    if (filterCleared) this._runFilterQuery();
    this._runListQuery();
    this._runTableQuery();
    this._runTaxaQuery();
    this._replaceUrlState();
  };

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
    this._runTaxaQuery();
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
    this._runTaxaQuery();
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
    this._runTableQuery();
    this._runTaxaQuery();    // table
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
      this._runTaxaQuery();
    } else {
      // Clear record selection only (D-06: bounds filter is preserved)
      this._selectedOccIds = null;
      this._selectedCluster = null;
      this._paneState = 'collapsed';
      this._replaceUrlState();
    }
  }

  /**
   * Apply a search result that names a VIEW (beeatlas-7nx.5, ADR 0028).
   *
   * The counterpart to the label path above. That one resolves a RECORD, so it
   * selects and the filter yields to it; this one names a set, so it sets the one
   * FilterState dimension that expresses that set and changes nothing else.
   *
   * COMPOSITION (ADR 0028): the named dimension is REPLACED — searching one county
   * after another shows the second, not both — and every other dimension is LEFT
   * ALONE, so a search composes with the year, elevation or bounds already in force.
   * This is deliberately not the label yield: a selection can be hidden by a filter
   * (queryListPage intersects them), whereas a filter can only compose to zero,
   * which is a legible answer rather than a broken screen.
   *
   * Everything after the dimension is set mirrors _onFilterChanged, because this IS
   * a filter change and the two must not drift — same boundary-layer auto-switch,
   * same selection clearing, same pane handling, same query fan-out. The differences
   * from the pane are exactly two: search names one dimension rather than sending a
   * whole FilterState, and search reports a hit so the header can close its popover.
   */
  private _applyViewCandidate(c: SearchCandidate, typed: string): void {
    const prev = this._filterState;
    let next: FilterState;
    switch (c.kind) {
      case 'taxon':
        // c.label is the pane's own label scheme (buildTaxonLabel), so a chip from
        // search is spelled exactly like a chip from the autocomplete.
        next = { ...prev, taxonId: c.taxonId, taxonDisplayName: c.label };
        break;
      case 'person':
        next = { ...prev, selectedCollectors: [c.collector] };
        break;
      case 'place':
        next = { ...prev, selectedPlace: c.slug };
        break;
      case 'county':
        next = { ...prev, selectedCounties: new Set([c.name]) };
        break;
      case 'ecoregion':
        next = { ...prev, selectedEcoregions: new Set([c.name]) };
        break;
      case 'label':
        return; // handled by the lookup path; never reaches here
    }
    this._filterState = next;

    // Same auto-switch the pane does: a region filter brings its boundary layer up,
    // or the filter is invisible on the map.
    if (c.kind === 'county') this._boundaryMode = 'counties';
    else if (c.kind === 'ecoregion') this._boundaryMode = 'ecoregions';
    else if (c.kind === 'place') this._boundaryMode = 'places';

    // Reported, not inferred — the header cannot tell "resolved" from "nothing has
    // been searched for yet", and it closes the popover on a hit (ADR 0021).
    this._searchStatus = { query: typed, kind: 'hit' };

    // Clear record selections, as any other filter change does: a pinned selection
    // would intersect the new view and show a card for a record it no longer contains.
    this._selectedOccIds = null;
    this._selectedCluster = null;
    if (this._paneState !== 'list') this._paneState = 'collapsed';
    if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }

    this._tablePage = 1;
    this._runFilterQuery().then(() => {
      this._replaceUrlState();
    });
    this._runTableQuery();
    this._runTaxaQuery();
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
      // FilterChangedEvent carries no hiddenTiers — preserve active tier filter explicitly (Pitfall 1)
      hiddenTiers: this._filterState.hiddenTiers,
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
    this._runTaxaQuery();
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
    this._runTaxaQuery();
  }

  private _onSortChanged(e: CustomEvent<{ sortBy: SpecimenSortBy }>) {
    this._tableSortBy = e.detail.sortBy;
    this._tablePage = 1;
    this._runTableQuery();
    this._runTaxaQuery();
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
    this._runTaxaQuery();
    this._replaceUrlState();
  }

  private _onPaneShrinkList() {
    this._paneState = 'list';
    this._replaceUrlState();
  }

  private _onPaneShowTaxa() {
    this._paneState = 'taxa';
    this._runTaxaQuery();
    this._replaceUrlState();
  }

  // A taxon row in the tree refines the CURRENT filter rather than navigating away:
  // the pane exists to explore this result set, so drilling in should keep every
  // other facet (geography, year, collector, tier) exactly as it is.
  private _onTaxonSelected(e: CustomEvent<{ taxonId: number; name: string; rank: string }>) {
    this._filterState = {
      ...this._filterState,
      taxonId: e.detail.taxonId,
      taxonDisplayName: e.detail.name,
    };
    this._listPage = 1;
    this._runFilterQuery();
    this._runListQuery();
    this._runTableQuery();
    this._runTaxaQuery();
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
    // Search (beeatlas-7nx.5). Both land after the DB is up, like the option lists,
    // and each rebuilds the index when it arrives — there is no ordering between them.
    void this._loadSearchWeights();
    if (Object.keys(this._taxonPages).length === 0) {
      void loadTaxonPages().then(m => { this._taxonPages = m; this._rebuildSearchIndex(); });
    }
    // Named places (beeatlas-7nx.3). Eager, alongside the other option lists —
    // <bee-pane> loaded this lazily and only when a place was already SELECTED, so
    // its place autocomplete was empty on a fresh session and a place could not be
    // found by typing its name until one had somehow been chosen already.
    void this._loadPlaces().then(() => this._rebuildSearchIndex());
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
      this._runTaxaQuery();
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

  private _onTierFilterChanged(e: CustomEvent<{ hiddenTiers: Set<TierKey> }>) {
    // Write _filterState first (Pitfall 4 — assign before querying)
    this._filterState = { ...this._filterState, hiddenTiers: e.detail.hiddenTiers };
    this._listPage = 1;
    this._runFilterQuery();  // map + filter-result count
    this._runListQuery();    // sidebar list
    this._runTableQuery();
    this._runTaxaQuery();   // table view
    this._replaceUrlState(); // URL sync (now also triggers isFilterActive → style-cache bypass)
  }

  private _toggleRegionMenu() {
    this._regionMenuOpen = !this._regionMenuOpen;
  }

  private _selectBoundaryMode(mode: 'off' | 'counties' | 'ecoregions' | 'places' | 'wilderness') {
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
  private _applyBoundaryMode(newMode: 'off' | 'counties' | 'ecoregions' | 'places' | 'wilderness') {
    this._boundaryMode = newMode;
    const leavingPlaces = newMode !== 'places' && this._filterState.selectedPlace !== null;
    if (leavingPlaces) {
      this._filterState = { ...this._filterState, selectedPlace: null };
      this._tablePage = 1;
      this._runFilterQuery().then(() => {
        this._replaceUrlState();
      });
      this._runTableQuery();
      this._runTaxaQuery();
    } else {
      this._replaceUrlState();
    }
  }
}
