// LINK-04 — Stable URL contract for cross-route deep-links into the SPA.
//
// The SPA at `/` is canonically navigated via two query params:
//
//   ?taxon=<scientificName>&taxonRank=<'family' | 'genus' | 'species'>
//
// BOTH params MUST be present. parseParams (below, lines 83-89) silently
// drops the taxon filter if either is missing — verified by
// src/tests/spa-link.test.ts.
//
// Cross-route deep-links from /species/ MUST use buildSpaTaxonLink()
// from src/lib/spa-link.ts (Phase 81 D-05). Other params (x, y, z, yr0,
// yr1, months, counties, ecor, collectors, elev_min, elev_max, o, bm,
// view) are SPA-internal and not part of the cross-route contract.

import type { FilterState, CollectorEntry } from './filter.ts';

export interface ViewState {
  lon: number;   // WGS84 longitude
  lat: number;   // WGS84 latitude
  zoom: number;
}

export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number }
  | { type: 'bounds'; west: number; south: number; east: number; north: number };

export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  viewMode: 'map' | 'table';
}

export interface AppState {
  view: ViewState;
  filter: FilterState;
  selection: SelectionState;
  ui: UiState;
}

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
  if (filter.taxonName !== null && filter.taxonRank !== null) {
    params.set('taxon', filter.taxonName);
    params.set('taxonRank', filter.taxonRank);
  }
  if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
  if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));
  if (filter.elevMin !== null) params.set('elev_min', String(filter.elevMin));
  if (filter.elevMax !== null) params.set('elev_max', String(filter.elevMax));
  if (filter.months.size > 0)  params.set('months', [...filter.months].sort((a, b) => a - b).join(','));
  if (selection.type === 'ids' && selection.ids.length > 0) {
    params.set('o', selection.ids.join(','));
  } else if (selection.type === 'cluster') {
    params.set('o', `@${selection.lon.toFixed(4)},${selection.lat.toFixed(4)},${Math.ceil(selection.radiusM)}`);
  } else if (selection.type === 'bounds') {
    params.set('sel', [
      selection.west.toFixed(4),
      selection.south.toFixed(4),
      selection.east.toFixed(4),
      selection.north.toFixed(4),
    ].join(','));
  }
  // Boundary mode and region filter — omit entirely when off (absence = off)
  if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
  if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
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

export function parseParams(search: string): Partial<AppState> {
  const p = new URLSearchParams(search);
  const result: Partial<AppState> = {};

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
  const taxonName = p.get('taxon') ?? null;
  const rawRank   = p.get('taxonRank') ?? null;
  const taxonRank = (['family', 'genus', 'species'] as const).includes(rawRank as any)
    ? rawRank as 'family' | 'genus' | 'species' : null;
  // Both must be present and valid; if either is missing treat both as absent
  const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;
  const resolvedTaxonRank = (taxonName && taxonRank) ? taxonRank : null;

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

  // Include filter sub-object when any filter param is present
  const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
    || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
    || selectedCollectors.length > 0 || elevMin !== null || elevMax !== null
    || selectedPlace !== null;
  if (hasFilter) {
    result.filter = {
      taxonName: resolvedTaxonName,
      taxonRank: resolvedTaxonRank,
      yearFrom,
      yearTo,
      months,
      selectedCounties,
      selectedEcoregions,
      selectedCollectors,
      elevMin,
      elevMax,
      selectedPlace,
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
      .filter(s => (s.startsWith('ecdysis:') || s.startsWith('inat:')) && s.length > 5);
    if (ids.length > 0) {
      result.selection = { type: 'ids', ids };
    }
  }

  // Bounds selection — sel=west,south,east,north (SEL-06)
  const selRaw = p.get('sel') ?? '';
  if (selRaw) {
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
          south < north) {
        result.selection = { type: 'bounds', west, south, east, north };
      }
    }
  }

  // UI state
  const bmRaw = p.get('bm') ?? '';
  // D-01/D-09: any non-empty place= forces boundaryMode='places', overriding bm=
  const placeImplied = selectedPlace !== null && selectedPlace !== '';
  const boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = placeImplied
    ? 'places'
    : (bmRaw === 'counties' || bmRaw === 'ecoregions' || bmRaw === 'places') ? bmRaw : 'off';
  const viewRaw = p.get('view') ?? '';
  const viewMode: 'map' | 'table' = viewRaw === 'table' ? 'table' : 'map';
  // Include UI when non-default values present
  if (boundaryMode !== 'off' || viewMode !== 'map') {
    result.ui = { boundaryMode, viewMode };
  }

  return result;
}
