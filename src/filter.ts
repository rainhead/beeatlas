import { getDB, tablesReady } from './sqlite.ts';
import { occIdFromRow } from './occurrence.ts';
import type { FeatureCollection, Point, Feature } from 'geojson';

// A resolved collector entry links a human name to an iNat username (either may be null).
// Stored in FilterState.selectedCollectors and used as CollectorOption in autocomplete.
export interface CollectorEntry {
  displayName: string;          // human name if known, else iNat username
  recordedBy: string | null;    // ecdysis.recordedBy value (null if only known as iNat user)
  host_inat_login: string | null; // iNat username from samples/WABA (null if no iNat link)
}

export interface FilterState {
  taxonId: number | null;           // integer taxon_id from the taxa table (filter key)
  taxonDisplayName: string | null;  // display-only label for chip + CSV filename, never a filter key
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;              // 1-12; empty Set = no month filter active
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
  selectedPlace: string | null;     // D-07 — singular; multi-place is deferred PRICH-02
}

export interface OccurrenceProperties {
  occId: string;
  recencyTier: 'thisYear' | 'lastYear' | 'earlier';
  source: string;
}

function _recencyTier(year: number): OccurrenceProperties['recencyTier'] {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

export interface OccurrenceRow {
  taxon_id: number | null;
  lat: number;
  lon: number;
  date: string;
  county: string | null;
  ecoregion_l3: string | null;
  place_slug: string | null;
  ecdysis_id: number | null;
  catalog_number: string | null;
  recordedBy: string | null;
  fieldNumber: string | null;
  floralHost: string | null;
  host_observation_id: number | null;
  inat_host: string | null;
  inat_quality_grade: string | null;
  modified: string | null;
  specimen_observation_id: number | null;
  elevation_m: number | null;
  year: number | null;
  month: number | null;
  observation_id: number | null;
  host_inat_login: string | null;
  is_provisional: boolean;
  specimen_inat_quality_grade: string | null;
  specimen_count: number | null;
  sample_id: number | null;
  sample_host: string | null;
  // Phase 137 (PRO-04): checklist rows carry checklist_id (= ObjectID); null for all other sources.
  checklist_id: number | null;
  // Phase 138 (D-10): checklist detail fields; null for all other sources.
  verbatim_name: string | null;
  locality: string | null;
  collapsed_count: number | null;
  source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null;
  image_url: string | null;
  obs_url: string | null;
  user_login: string | null;
  license: string | null;
  // JOIN-resolved from taxa.name; null when taxon_id IS NULL (not a mart column)
  display_name: string | null;
  // JOIN-resolved from taxa.rank; null when taxon_id IS NULL (not a mart column)
  display_rank: string | null;
}

export const OCCURRENCE_COLUMNS = [
  'taxon_id', 'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',
  'ecdysis_id', 'catalog_number', 'recordedBy', 'fieldNumber',
  'floralHost', 'host_observation_id', 'inat_host',
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'host_inat_login', 'specimen_count', 'sample_id', 'sample_host',
  'is_provisional', 'specimen_inat_quality_grade',
  'checklist_id',
  'verbatim_name',
  'locality',
  'collapsed_count',
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;

const PAGE_SIZE = 100;

export type SpecimenSortBy = 'date' | 'modified';

const SPECIMEN_ORDER = 'date DESC, recordedBy ASC, fieldNumber ASC';
const SPECIMEN_ORDER_MODIFIED = 'modified DESC, recordedBy ASC, fieldNumber ASC';

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

export function buildCsvFilename(f: FilterState): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (!isFilterActive(f)) return `occurrences-all-${date}.csv`;

  const segments: string[] = [];

  // Priority: taxon > collector > year > county/ecoregion
  // Taxon (display name used for readability; taxonId is the filter key)
  if (f.taxonDisplayName !== null && segments.length < 2) {
    segments.push(slugify(f.taxonDisplayName));
  }

  // Collector (second priority, only if taxon not set)
  if (f.selectedCollectors.length > 0 && segments.length < 2) {
    segments.push(slugify(f.selectedCollectors[0]!.displayName));
  }

  // Year (third priority)
  if (segments.length < 2 && (f.yearFrom !== null || f.yearTo !== null)) {
    if (f.yearFrom !== null && f.yearTo !== null) {
      if (f.yearFrom === f.yearTo) {
        segments.push(String(f.yearFrom));
      } else {
        segments.push(`${f.yearFrom}-${f.yearTo}`);
      }
    } else if (f.yearFrom !== null) {
      segments.push(String(f.yearFrom));
    } else if (f.yearTo !== null) {
      segments.push(String(f.yearTo));
    }
  }

  // County/ecoregion (fourth priority)
  if (segments.length < 2) {
    const firstCounty = f.selectedCounties.size > 0 ? (f.selectedCounties.values().next().value as string) : null;
    const firstEcor = f.selectedEcoregions.size > 0 ? (f.selectedEcoregions.values().next().value as string) : null;
    const region = firstCounty ?? firstEcor;
    if (region !== null) {
      segments.push(slugify(region));
    }
  }

  return `occurrences-${segments.join('-')}-${date}.csv`;
}

export async function queryAllFiltered(
  f: FilterState,
  sortBy: SpecimenSortBy = 'date'
): Promise<Record<string, unknown>[]> {
  const { occurrenceWhere } = buildFilterSQL(f);
  const orderBy = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER;
  const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name, t.rank AS display_rank';

  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE ${occurrenceWhere} ORDER BY ${orderBy}`,
    (rowValues: unknown[], columnNames: string[]) => {
      const obj: Record<string, unknown> = {};
      columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
      rows.push(obj);
    }
  );
  return rows;
}

export async function queryTablePage(
  f: FilterState,
  page: number,
  sortBy: SpecimenSortBy = 'date',
  selectedEcdysisIds: number[] = [],
  selectedInatIds: number[] = [],
  selectedChecklistIds: number[] = [],
  selectedInatObsIds: number[] = []
): Promise<{ rows: OccurrenceRow[]; total: number }> {
  // Build a selection-priority prefix so selected rows always sort to the top.
  // IDs are pre-validated as integers by the caller.
  const selParts: string[] = [];
  if (selectedEcdysisIds.length > 0) selParts.push(`ecdysis_id IN (${selectedEcdysisIds.join(',')})`);
  if (selectedInatIds.length > 0) selParts.push(`observation_id IN (${selectedInatIds.join(',')})`);
  if (selectedChecklistIds.length > 0) selParts.push(`checklist_id IN (${selectedChecklistIds.join(',')})`);
  // Phase 138 (WR-01): inat_obs (provisional/WABA) selections were collected by
  // _runTableQuery but never threaded here, so they lost their table-view sort
  // priority. Mirror queryListPage so all four sources can be pinned to the top.
  if (selectedInatObsIds.length > 0) selParts.push(`specimen_observation_id IN (${selectedInatObsIds.join(',')})`);
  const priorityExpr = selParts.length > 0
    ? `CASE WHEN (${selParts.join(' OR ')}) THEN 0 ELSE 1 END, `
    : '';

  const baseOrder = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER;
  const orderBy = priorityExpr + baseOrder;
  const offset = (page - 1) * PAGE_SIZE;

  const { occurrenceWhere } = buildFilterSQL(f);
  const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name, t.rank AS display_rank';

  await tablesReady;
  const { sqlite3, db } = await getDB();
  let total = 0;
  await sqlite3.exec(db,
    `SELECT COUNT(*) as n FROM occurrences o WHERE ${occurrenceWhere}`,
    (rowValues: unknown[], columnNames: string[]) => {
      total = Number(rowValues[columnNames.indexOf('n')] ?? 0);
    }
  );
  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE ${occurrenceWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    (rowValues: unknown[], columnNames: string[]) => {
      const obj: Record<string, unknown> = {};
      columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
      rows.push(obj);
    }
  );
  return { rows: rows as unknown as OccurrenceRow[], total };
}

export function isFilterActive(f: FilterState): boolean {
  return f.taxonId !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0
    || f.selectedCollectors.length > 0
    || f.elevMin !== null
    || f.elevMax !== null
    || f.selectedPlace !== null;
}

// INVARIANT: the returned clause qualifies the occurrences table as `o`
// (e.g. `o.taxon_id`). Every consumer MUST alias the occurrences table as `o`
// in its FROM clause (`FROM occurrences o` or `FROM occurrences o LEFT JOIN taxa t …`).
// `taxon_id` exists in BOTH occurrences and taxa, so an unqualified reference is
// ambiguous once `taxa` is joined for display_name resolution.
export function buildFilterSQL(f: FilterState): { occurrenceWhere: string } {
  const occurrenceClauses: string[] = [];

  // Taxon filter — descendant subquery against taxa.lineage_path (MFILT-01)
  // taxonId is a TypeScript number; interpolated as a bare integer — no string escaping needed (T-130-01)
  // The clause matches the taxon itself (o.taxon_id = N) plus all descendants (instr materialized-path).
  // Outer taxon_id is qualified `o.` (occurrences); the inner subquery's taxon_id is scoped to taxa.
  if (f.taxonId !== null) {
    occurrenceClauses.push(
      `(o.taxon_id = ${f.taxonId} OR o.taxon_id IN (` +
      `SELECT taxon_id FROM taxa ` +
      `WHERE lineage_path IS NOT NULL ` +
      `AND instr(lineage_path, '/${f.taxonId}/') > 0))`
    );
  }

  // Year range — direct column comparison; null year for sample-only rows naturally excludes them
  if (f.yearFrom !== null) {
    occurrenceClauses.push(`year >= ${f.yearFrom}`);
  }
  if (f.yearTo !== null) {
    occurrenceClauses.push(`year <= ${f.yearTo}`);
  }

  // Month filter — direct column comparison; null month for sample-only rows naturally excludes them
  if (f.months.size > 0) {
    const monthList = [...f.months].join(',');
    occurrenceClauses.push(`month IN (${monthList})`);
  }

  // County filter
  if (f.selectedCounties.size > 0) {
    const counties = [...f.selectedCounties].map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    occurrenceClauses.push(`county IN (${counties})`);
  }

  // Ecoregion filter
  if (f.selectedEcoregions.size > 0) {
    const ecors = [...f.selectedEcoregions].map(e => `'${e.replace(/'/g, "''")}'`).join(',');
    occurrenceClauses.push(`ecoregion_l3 IN (${ecors})`);
  }

  // Place filter — singular value (D-08); multi-place is deferred PRICH-02
  if (f.selectedPlace !== null) {
    const escaped = f.selectedPlace.replace(/'/g, "''");
    occurrenceClauses.push(`place_slug = '${escaped}'`);
  }

  // Collector filter — single OR clause combining recordedBy (ecdysis) and host_inat_login (iNat)
  if (f.selectedCollectors.length > 0) {
    const recordedBys = f.selectedCollectors
      .filter(c => c.recordedBy !== null)
      .map(c => `'${c.recordedBy!.replace(/'/g, "''")}'`);
    const logins = f.selectedCollectors
      .filter(c => c.host_inat_login !== null)
      .map(c => `'${c.host_inat_login!.replace(/'/g, "''")}'`);
    const parts: string[] = [];
    if (recordedBys.length > 0) parts.push(`recordedBy IN (${recordedBys.join(',')})`);
    if (logins.length > 0) parts.push(`host_inat_login IN (${logins.join(',')})`);
    if (parts.length > 0) occurrenceClauses.push(`(${parts.join(' OR ')})`);
  }

  // Elevation filter — conditional null semantics
  if (f.elevMin !== null && f.elevMax !== null) {
    occurrenceClauses.push(`elevation_m IS NOT NULL AND elevation_m BETWEEN ${f.elevMin} AND ${f.elevMax}`);
  } else if (f.elevMin !== null) {
    occurrenceClauses.push(`(elevation_m IS NULL OR elevation_m >= ${f.elevMin})`);
  } else if (f.elevMax !== null) {
    occurrenceClauses.push(`(elevation_m IS NULL OR elevation_m <= ${f.elevMax})`);
  }

  const occurrenceWhere = occurrenceClauses.length > 0 ? occurrenceClauses.join(' AND ') : '1 = 1';
  return { occurrenceWhere };
}

export async function queryVisibleGeoJSON(
  f: FilterState,
  selectionBounds: { west: number; south: number; east: number; north: number } | null = null
): Promise<{
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  ids: Set<string>;
  rowCount: number;
} | null> {
  // A selection bounding box (near-me / shift-drag) filters the MAP too — so the map
  // must run even when no taxon/date/region filter is active, as long as bounds exist.
  if (!isFilterActive(f) && selectionBounds === null) return null;
  const { occurrenceWhere } = buildFilterSQL(f);
  // Same bbox clause the list/table queries use (queryListPage) — keeps the map, list,
  // and table in lockstep on the identical bounds.
  let boundsClause = '';
  if (selectionBounds !== null) {
    const { west, south, east, north } = selectionBounds;
    boundsClause = ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  }
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const features: Feature<Point, OccurrenceProperties>[] = [];
  const ids = new Set<string>();
  let rowCount = 0;
  await sqlite3.exec(db,
    // Phase 137 (PRO-04): fetch checklist_id so checklist points that match the filter are not silently dropped from _visibleIds.
    `SELECT lat, lon, ecdysis_id, observation_id, specimen_observation_id, checklist_id, year, source FROM occurrences o WHERE (${occurrenceWhere})${boundsClause} AND lat IS NOT NULL AND lon IS NOT NULL`,
    (rowValues: unknown[], columnNames: string[]) => {
      rowCount++;
      const row = Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])) as Pick<OccurrenceRow, 'lat' | 'lon' | 'ecdysis_id' | 'observation_id' | 'specimen_observation_id' | 'checklist_id' | 'year' | 'source'>;
      const occId = occIdFromRow({ ecdysis_id: row.ecdysis_id, observation_id: row.observation_id, specimen_observation_id: row.specimen_observation_id, checklist_id: row.checklist_id, is_provisional: false } as OccurrenceRow);
      if (occId == null) return;
      ids.add(occId);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(row.lon), Number(row.lat)] },
        properties: { occId, recencyTier: _recencyTier(Number(row.year)), source: String(row.source ?? '') },
      });
    }
  );
  return { geojson: { type: 'FeatureCollection', features }, ids, rowCount };
}

export interface DataSummary {
  totalSpecimens: number;
  earliestYear: number;
  latestYear: number;
}

export interface TaxonOption {
  label: string;      // display string, e.g. "Bombus (genus)" or "Apis mellifera" (D-03 label scheme)
  taxonId: number;    // integer taxon_id from the taxa table (filter key)
  rank: 'family' | 'subfamily' | 'tribe' | 'subtribe' | 'genus' | 'subgenus' | 'complex' | 'species';
}

// Custom event payload
export interface FilterChangedEvent {
  taxonId: number | null;
  taxonDisplayName: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
  selectedPlace: string | null;
}

export async function queryListPage(
  f: FilterState,
  page: number,
  sortBy: SpecimenSortBy = 'date',
  selectedEcdysisIds: number[] = [],
  selectedInatIds: number[] = [],
  selectedInatObsIds: number[] = [],
  selectedChecklistIds: number[] = [],
  selectionBounds: { west: number; south: number; east: number; north: number } | null = null
): Promise<{ rows: OccurrenceRow[]; total: number }> {
  const { occurrenceWhere } = buildFilterSQL(f);

  // Selection constraint: IDs (from cluster click) OR bounds (from rectangle draw)
  const selParts: string[] = [];
  if (selectedEcdysisIds.length > 0)
    selParts.push(`ecdysis_id IN (${selectedEcdysisIds.join(',')})`);
  if (selectedInatIds.length > 0)
    selParts.push(`observation_id IN (${selectedInatIds.join(',')})`);
  if (selectedInatObsIds.length > 0)
    selParts.push(`specimen_observation_id IN (${selectedInatObsIds.join(',')})`);
  if (selectedChecklistIds.length > 0)
    selParts.push(`checklist_id IN (${selectedChecklistIds.join(',')})`);

  // Bounds selection is always a WHERE addition, not an ORDER priority
  let boundsClause = '';
  if (selectionBounds !== null) {
    const { west, south, east, north } = selectionBounds;
    boundsClause =
      ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  }

  // When IDs are present, restrict to only those rows (intersection with filter)
  const selFilter = selParts.length > 0 ? ` AND (${selParts.join(' OR ')})` : '';

  const fullWhere = `(${occurrenceWhere})${selFilter}${boundsClause}`;
  const orderBy = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER;
  const offset = (page - 1) * PAGE_SIZE;
  const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name, t.rank AS display_rank';

  await tablesReady;
  const { sqlite3, db } = await getDB();

  let total = 0;
  await sqlite3.exec(db,
    `SELECT COUNT(*) as n FROM occurrences o WHERE ${fullWhere}`,
    (rowValues: unknown[], columnNames: string[]) => {
      total = Number(rowValues[columnNames.indexOf('n')] ?? 0);
    }
  );

  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE ${fullWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    (rowValues: unknown[], columnNames: string[]) => {
      const obj: Record<string, unknown> = {};
      columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
      rows.push(obj);
    }
  );
  return { rows: rows as unknown as OccurrenceRow[], total };
}

export async function queryOccurrencesByBounds(
  f: FilterState,
  bounds: { west: number; south: number; east: number; north: number }
): Promise<OccurrenceRow[]> {
  const { west, south, east, north } = bounds;
  const { occurrenceWhere } = buildFilterSQL(f);
  const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name, t.rank AS display_rank';
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: OccurrenceRow[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE (${occurrenceWhere}) AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east} ORDER BY date DESC, recordedBy ASC`,
    (rowValues: unknown[], columnNames: string[]) => {
      rows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])) as unknown as OccurrenceRow);
    }
  );
  return rows;
}

export async function getOccurrences(occIds: string[]): Promise<OccurrenceRow[]> {
  if (occIds.length === 0) return [];
  const ecdysisIds = occIds.filter(id => id.startsWith('ecdysis:')).map(id => id.slice(8));
  const inatIds = occIds.filter(id => id.startsWith('inat:')).map(id => id.slice(5));
  const inatObsIds = occIds.filter(id => id.startsWith('inat_obs:')).map(id => id.slice(9));
  // Phase 137 (PRO-04): dispatch checklist:N IDs so a checklist-dot click doesn't yield an empty WHERE.
  const checklistIds = occIds.filter(id => id.startsWith('checklist:')).map(id => id.slice('checklist:'.length));
  const clauses: string[] = [];
  if (ecdysisIds.length > 0) clauses.push(`ecdysis_id IN (${ecdysisIds.join(',')})`);
  if (inatIds.length > 0) clauses.push(`observation_id IN (${inatIds.join(',')})`);
  if (inatObsIds.length > 0) clauses.push(`specimen_observation_id IN (${inatObsIds.join(',')})`);
  if (checklistIds.length > 0) clauses.push(`checklist_id IN (${checklistIds.join(',')})`);
  // No recognized id prefixes → an empty WHERE would be a SQL syntax error. Return early.
  if (clauses.length === 0) return [];
  const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name, t.rank AS display_rank';
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: OccurrenceRow[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE ${clauses.join(' OR ')}`,
    (rowValues: unknown[], columnNames: string[]) => {
      rows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])) as unknown as OccurrenceRow);
    }
  );
  return rows;
}
