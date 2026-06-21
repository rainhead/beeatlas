// LINK-04 — Stable URL contract for cross-route deep-links into the SPA.
//
// New format (Phase 130+):
//   ?taxon=<integer taxon_id>
//
// Legacy format (pre-Phase 130, backward-compatible):
//   ?taxon=<scientificName>&taxonRank=<'family' | 'genus' | 'species'>
//
// Legacy URLs are detected by non-integer taxon= values and stored as
// _pendingLegacyTaxon in the filter for async resolution after the taxon
// cache is loaded. The taxonRank param is read for twin disambiguation.
//
// Cross-route deep-links from the static taxon pages (_pages/*.njk) emit the
// new integer format directly: `/?taxon=<taxon_id>` (Phase 130+, D-06 — rank is
// derivable from the taxon cache). Other params (x, y, z, yr0, yr1, months,
// counties, ecor, collectors, elev_min, elev_max, o, bm, view) are SPA-internal
// and not part of the cross-route contract.

import type { FilterState, CollectorEntry } from './filter.ts';

export interface ViewState {
  lon: number;   // WGS84 longitude
  lat: number;   // WGS84 latitude
  zoom: number;
}

export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number };

export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist';

const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs', 'checklist']);

export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
  hiddenSources?: Set<SourceKey>;
}

export interface AppState {
  view: ViewState;
  filter: FilterState;
  selection: SelectionState;
  ui: UiState;
}

/**
 * Extended return type for parseParams — includes an optional pending-legacy
 * taxon record for two-phase URL back-compat resolution (D-06).
 * When `taxon=` is a non-integer (legacy name format), `pendingLegacyTaxon` is
 * populated for async resolution after the taxon cache loads in bee-atlas.ts.
 * The raw name string is NEVER interpolated into SQL (threat T-130-LU).
 */
export type ParsedParams = Partial<AppState> & {
  pendingLegacyTaxon?: { name: string; rank: string | null };
};

export function buildParams(
  view: ViewState,
  filter: FilterState,
  selection: SelectionState,
  ui: UiState
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('x', view.lon.toFixed(4));
  params.set('y', view.lat.toFixed(4));
  params.set('z', view.zoom.toFixed(2));
  if (filter.taxonId !== null) {
    params.set('taxon', String(filter.taxonId));
    // taxonRank param intentionally dropped (D-06); rank is derivable from the taxa cache
  }
  if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
  if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));
  if (filter.elevMin !== null) params.set('elev_min', String(filter.elevMin));
  if (filter.elevMax !== null) params.set('elev_max', String(filter.elevMax));
  if (filter.months.size > 0)  params.set('months', [...filter.months].sort((a, b) => a - b).join(','));
  if (filter.bounds !== null) {
    params.set('bbox', [
      filter.bounds.west.toFixed(4),
      filter.bounds.south.toFixed(4),
      filter.bounds.east.toFixed(4),
      filter.bounds.north.toFixed(4),
    ].join(','));
  }
  if (selection.type === 'ids' && selection.ids.length > 0) {
    params.set('o', selection.ids.join(','));
  } else if (selection.type === 'cluster') {
    params.set('o', `@${selection.lon.toFixed(4)},${selection.lat.toFixed(4)},${Math.ceil(selection.radiusM)}`);
  }
  // Boundary mode and region filter — omit entirely when off (absence = off)
  if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
  if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);
  if (ui.hiddenSources && ui.hiddenSources.size > 0) {
    const visibleSources = [...VALID_SOURCES].filter(s => !ui.hiddenSources!.has(s)).sort();
    if (visibleSources.length > 0) params.set('src', visibleSources.join(','));
  }
  if (filter.selectedCounties.size > 0) {
    params.set('counties', [...filter.selectedCounties].sort().join(','));
  }
  if (filter.selectedEcoregions.size > 0) {
    params.set('ecor', [...filter.selectedEcoregions].sort().join(','));
  }
  if (filter.selectedPlace !== null) {
    params.set('place', filter.selectedPlace);
  }
  if (filter.selectedCollectors.length > 0) {
    // Each entry encoded as "recordedBy:host_inat_login" (either part may be empty)
    params.set('collectors', filter.selectedCollectors.map(c =>
      `${encodeURIComponent(c.recordedBy ?? '')}:${encodeURIComponent(c.host_inat_login ?? '')}`
    ).join('|'));
  }
  return params;
}

export function parseParams(search: string): ParsedParams {
  const p = new URLSearchParams(search);
  const result: ParsedParams = {};

  // View state — only include if all coordinates are valid
  const x = parseFloat(p.get('x') ?? '');
  const y = parseFloat(p.get('y') ?? '');
  const z = parseFloat(p.get('z') ?? '');
  const lonValid  = isFinite(x) && x >= -180 && x <= 180;
  const latValid  = isFinite(y) && y >= -90  && y <= 90;
  const zoomValid = isFinite(z) && z >= 1    && z <= 22;
  if (lonValid && latValid && zoomValid) {
    result.view = { lon: x, lat: y, zoom: z };
  }

  // Filter state — build when any filter param is present
  // D-06: new format encodes taxon= as integer taxon_id; legacy format encodes name+taxonRank
  const taxonRaw = p.get('taxon') ?? null;
  const taxonRankRaw = p.get('taxonRank') ?? null;
  let resolvedTaxonId: number | null = null;
  if (taxonRaw !== null) {
    const asInt = parseInt(taxonRaw, 10);
    if (!isNaN(asInt) && String(asInt) === taxonRaw) {
      // New integer format — T-130-IV: parseInt + roundtrip guard rejects non-canonical forms
      resolvedTaxonId = asInt;
    } else {
      // Legacy name format: store for async resolution after taxon cache loads.
      // The raw name string is NEVER interpolated into SQL (T-130-LU) — only used for
      // an exact-match equality lookup against the in-memory _taxonCache.
      result.pendingLegacyTaxon = { name: taxonRaw, rank: taxonRankRaw };
    }
  }

  const yearFromRaw = parseInt(p.get('yr0') ?? '', 10);
  const yearFrom = isNaN(yearFromRaw) ? null : yearFromRaw;
  const yearToRaw = parseInt(p.get('yr1') ?? '', 10);
  const yearTo = isNaN(yearToRaw) ? null : yearToRaw;
  const elevMinRaw = parseInt(p.get('elev_min') ?? '', 10);
  const elevMin = isNaN(elevMinRaw) ? null : elevMinRaw;
  const elevMaxRaw = parseInt(p.get('elev_max') ?? '', 10);
  const elevMax = isNaN(elevMaxRaw) ? null : elevMaxRaw;
  const monthsStr = p.get('months') ?? '';
  const months = new Set(
    monthsStr ? monthsStr.split(',').map(Number).filter(n => n >= 1 && n <= 12) : []
  );

  const countiesRaw = p.get('counties') ?? '';
  const selectedCounties = new Set<string>(
    countiesRaw ? countiesRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  const ecorRaw = p.get('ecor') ?? '';
  const selectedEcoregions = new Set<string>(
    ecorRaw ? ecorRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  const selectedPlace = p.get('place') ?? null;

  const collectorsRaw = p.get('collectors') ?? '';
  const selectedCollectors: CollectorEntry[] = collectorsRaw
    ? collectorsRaw.split('|').flatMap(part => {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) return [];
        const recordedBy = decodeURIComponent(part.slice(0, colonIdx)) || null;
        const host_inat_login = decodeURIComponent(part.slice(colonIdx + 1)) || null;
        if (!recordedBy && !host_inat_login) return [];
        const displayName = recordedBy ?? host_inat_login!;
        return [{ displayName, recordedBy, host_inat_login }];
      })
    : [];

  // Bounds filter — bbox=west,south,east,north (canonical post-999.8 format, D-02)
  let boundsResult: { west: number; south: number; east: number; north: number } | null = null;
  const bboxRaw = p.get('bbox') ?? '';
  if (bboxRaw) {
    const parts = bboxRaw.split(',');
    if (parts.length === 4) {
      const west  = parseFloat(parts[0]!);
      const south = parseFloat(parts[1]!);
      const east  = parseFloat(parts[2]!);
      const north = parseFloat(parts[3]!);
      if (isFinite(west)  && west  >= -180 && west  <= 180 &&
          isFinite(east)  && east  >= -180 && east  <= 180 &&
          isFinite(south) && south >= -90  && south <= 90  &&
          isFinite(north) && north >= -90  && north <= 90  &&
          south < north && west < east) {
        // west < east rejects inverted/corrupt boxes (WA never crosses the
        // antimeridian; a crafted bbox= with west>=east would silently match
        // zero rows otherwise — code review WR-02).
        boundsResult = { west, south, east, north };
      }
    }
  }

  // Legacy bounds back-compat — sel=west,south,east,north (SEL-06 / D-03)
  // Maps into filter.bounds (not selection); silently migrates to bbox= on next URL write.
  const selRaw = p.get('sel') ?? '';
  if (selRaw && boundsResult === null) {
    const parts = selRaw.split(',');
    if (parts.length === 4) {
      const west  = parseFloat(parts[0]!);
      const south = parseFloat(parts[1]!);
      const east  = parseFloat(parts[2]!);
      const north = parseFloat(parts[3]!);
      if (isFinite(west)  && west  >= -180 && west  <= 180 &&
          isFinite(east)  && east  >= -180 && east  <= 180 &&
          isFinite(south) && south >= -90  && south <= 90  &&
          isFinite(north) && north >= -90  && north <= 90  &&
          south < north && west < east) {
        // west < east rejects inverted/corrupt boxes (WA never crosses the
        // antimeridian; a crafted bbox= with west>=east would silently match
        // zero rows otherwise — code review WR-02).
        boundsResult = { west, south, east, north };
      }
    }
  }

  // Include filter sub-object when any filter param is present
  const hasFilter = resolvedTaxonId !== null || yearFrom !== null || yearTo !== null
    || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
    || selectedCollectors.length > 0 || elevMin !== null || elevMax !== null
    || selectedPlace !== null || boundsResult !== null;
  if (hasFilter) {
    result.filter = {
      taxonId: resolvedTaxonId,
      taxonDisplayName: null,  // display name not available from URL; resolved from cache
      yearFrom,
      yearTo,
      months,
      selectedCounties,
      selectedEcoregions,
      selectedCollectors,
      elevMin,
      elevMax,
      selectedPlace,
      bounds: boundsResult,
    };
  }

  // Selection state — ids or cluster centroid
  const oRaw = p.get('o') ?? '';
  if (oRaw.startsWith('@')) {
    const parts = oRaw.slice(1).split(',');
    if (parts.length === 3) {
      const lon = parseFloat(parts[0]!);
      const lat = parseFloat(parts[1]!);
      const radiusM = parseInt(parts[2]!, 10);
      if (isFinite(lon) && lon >= -180 && lon <= 180 &&
          isFinite(lat) && lat >= -90  && lat <= 90  &&
          isFinite(radiusM) && radiusM > 0 && radiusM <= 100000) {
        result.selection = { type: 'cluster', lon, lat, radiusM };
      }
    }
  } else if (oRaw) {
    const ids = oRaw.split(',').map(s => s.trim())
      // Phase 137 (PRO-04): accept checklist:N so a shared/reloaded checklist selection survives the URL roundtrip.
      .filter(s => (s.startsWith('ecdysis:') || s.startsWith('inat:') || s.startsWith('inat_obs:') || s.startsWith('checklist:')) && s.length > 5);
    if (ids.length > 0) {
      result.selection = { type: 'ids', ids };
    }
  }

  // UI state
  const bmRaw = p.get('bm') ?? '';
  // D-01/D-09: any non-empty place= forces boundaryMode='places', overriding bm=
  const placeImplied = selectedPlace !== null && selectedPlace !== '';
  const boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = placeImplied
    ? 'places'
    : (bmRaw === 'counties' || bmRaw === 'ecoregions' || bmRaw === 'places') ? bmRaw : 'off';
  const paneRaw = p.get('pane') ?? '';
  const viewRaw = p.get('view') ?? '';
  // Option A precedence: pane= wins; view=table is legacy alias when pane= absent
  const paneState: 'list' | 'table' | 'collapsed' =
    paneRaw === 'list' ? 'list'
    : paneRaw === 'table' ? 'table'
    : viewRaw === 'table' ? 'table'
    : 'collapsed';
  const srcRaw = p.get('src');
  let hiddenSources: Set<SourceKey> | undefined;
  if (srcRaw) {
    const visible = new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s as SourceKey)) as SourceKey[]);
    const hidden = new Set([...VALID_SOURCES].filter(s => !visible.has(s)));
    hiddenSources = hidden.size > 0 ? hidden : undefined;
  }
  // Include UI when non-default values present
  if (boundaryMode !== 'off' || paneState !== 'collapsed' || (hiddenSources && hiddenSources.size > 0)) {
    result.ui = { boundaryMode, paneState, hiddenSources };
  }

  return result;
}
