import type { FilterState } from './filter.ts';

export interface ViewState {
  lon: number;   // WGS84 longitude
  lat: number;   // WGS84 latitude
  zoom: number;
}

export interface SelectionState {
  occurrenceIds: string[];   // e.g. ["ecdysis:12345"]
}

export interface UiState {
  layerMode: 'specimens' | 'samples';
  boundaryMode: 'off' | 'counties' | 'ecoregions';
  viewMode: 'map' | 'table';
  sortColumn: string;       // per D-06; default 'year'
  sortDir: 'asc' | 'desc'; // per D-06; default 'desc'
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
  if (filter.taxonName !== null) {
    params.set('taxon', filter.taxonName);
    params.set('taxonRank', filter.taxonRank!);
  }
  if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
  if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));
  if (filter.months.size > 0)  params.set('months', [...filter.months].sort((a, b) => a - b).join(','));
  if (selection.occurrenceIds.length > 0) {
    params.set('o', selection.occurrenceIds.join(','));
  }
  if (ui.layerMode !== 'specimens') params.set('lm', ui.layerMode);  // omit default value
  // Boundary mode and region filter — omit entirely when off (absence = off)
  if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
  if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
  if (ui.sortColumn !== 'year') params.set('sort', ui.sortColumn);
  if (ui.sortDir !== 'desc') params.set('dir', ui.sortDir);
  if (filter.selectedCounties.size > 0) {
    params.set('counties', [...filter.selectedCounties].sort().join(','));
  }
  if (filter.selectedEcoregions.size > 0) {
    params.set('ecor', [...filter.selectedEcoregions].sort().join(','));
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

  const yearFrom = parseInt(p.get('yr0') ?? '') || null;
  const yearTo   = parseInt(p.get('yr1') ?? '') || null;
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

  // Include filter sub-object when any filter param is present
  const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
    || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0;
  if (hasFilter) {
    result.filter = {
      taxonName: resolvedTaxonName,
      taxonRank: resolvedTaxonRank,
      yearFrom,
      yearTo,
      months,
      selectedCounties,
      selectedEcoregions,
    };
  }

  // Selection state — occurrenceIds
  const oRaw = p.get('o') ?? '';
  const occurrenceIds = oRaw
    ? oRaw.split(',').map(s => s.trim()).filter(s => s.startsWith('ecdysis:') && s.length > 8)
    : [];
  if (occurrenceIds.length > 0) {
    result.selection = { occurrenceIds };
  }

  // UI state
  const lmRaw = p.get('lm') ?? '';
  const layerMode: 'specimens' | 'samples' = lmRaw === 'samples' ? 'samples' : 'specimens';
  const bmRaw = p.get('bm') ?? '';
  const boundaryMode: 'off' | 'counties' | 'ecoregions' =
    (bmRaw === 'counties' || bmRaw === 'ecoregions') ? bmRaw : 'off';
  const viewRaw = p.get('view') ?? '';
  const viewMode: 'map' | 'table' = viewRaw === 'table' ? 'table' : 'map';
  const sortRaw = p.get('sort') ?? '';
  const sortColumn = sortRaw || 'year';
  const dirRaw = p.get('dir') ?? '';
  const sortDir: 'asc' | 'desc' = dirRaw === 'asc' ? 'asc' : 'desc';
  // Include UI when non-default values present
  if (layerMode !== 'specimens' || boundaryMode !== 'off' || viewMode !== 'map' || sortColumn !== 'year' || sortDir !== 'desc') {
    result.ui = { layerMode, boundaryMode, viewMode, sortColumn, sortDir };
  }

  return result;
}
