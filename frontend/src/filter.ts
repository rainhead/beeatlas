import { getDB, tablesReady } from './sqlite.ts';

// A resolved collector entry links a human name to an iNat username (either may be null).
// Stored in FilterState.selectedCollectors and used as CollectorOption in autocomplete.
export interface CollectorEntry {
  displayName: string;          // human name if known, else iNat username
  recordedBy: string | null;    // ecdysis.recordedBy value (null if only known as iNat user)
  host_inat_login: string | null; // iNat username from samples/WABA (null if no iNat link)
}

export interface FilterState {
  taxonName: string | null;      // value of the selected taxon (family name, genus name, or scientificName)
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;           // 1-12; empty Set = no month filter active
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
}

export interface OccurrenceRow {
  lat: number;
  lon: number;
  date: string;
  county: string | null;
  ecoregion_l3: string | null;
  ecdysis_id: number | null;
  catalog_number: string | null;
  scientificName: string | null;
  recordedBy: string | null;
  fieldNumber: string | null;
  genus: string | null;
  family: string | null;
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
  specimen_inat_taxon_name: string | null;
  specimen_inat_quality_grade: string | null;
  specimen_count: number | null;
  sample_id: number | null;
}

export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3',
  'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
  'genus', 'family', 'floralHost', 'host_observation_id', 'inat_host',
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'host_inat_login', 'is_provisional', 'specimen_inat_taxon_name', 'specimen_inat_quality_grade', 'specimen_count', 'sample_id',
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
  // Taxon
  if (f.taxonName !== null && segments.length < 2) {
    segments.push(slugify(f.taxonName));
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
  const selectCols = OCCURRENCE_COLUMNS.join(', ');

  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences WHERE ${occurrenceWhere} ORDER BY ${orderBy}`,
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
  selectedInatIds: number[] = []
): Promise<{ rows: OccurrenceRow[]; total: number }> {
  // Build a selection-priority prefix so selected rows always sort to the top.
  // IDs are pre-validated as integers by the caller.
  const selParts: string[] = [];
  if (selectedEcdysisIds.length > 0) selParts.push(`ecdysis_id IN (${selectedEcdysisIds.join(',')})`);
  if (selectedInatIds.length > 0) selParts.push(`observation_id IN (${selectedInatIds.join(',')})`);
  const priorityExpr = selParts.length > 0
    ? `CASE WHEN (${selParts.join(' OR ')}) THEN 0 ELSE 1 END, `
    : '';

  const baseOrder = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER;
  const orderBy = priorityExpr + baseOrder;
  const offset = (page - 1) * PAGE_SIZE;

  const { occurrenceWhere } = buildFilterSQL(f);
  const selectCols = OCCURRENCE_COLUMNS.join(', ');

  await tablesReady;
  const { sqlite3, db } = await getDB();
  let total = 0;
  await sqlite3.exec(db,
    `SELECT COUNT(*) as n FROM occurrences WHERE ${occurrenceWhere}`,
    (rowValues: unknown[], columnNames: string[]) => {
      total = Number(rowValues[columnNames.indexOf('n')] ?? 0);
    }
  );
  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences WHERE ${occurrenceWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    (rowValues: unknown[], columnNames: string[]) => {
      const obj: Record<string, unknown> = {};
      columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
      rows.push(obj);
    }
  );
  return { rows: rows as unknown as OccurrenceRow[], total };
}

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0
    || f.selectedCollectors.length > 0
    || f.elevMin !== null
    || f.elevMax !== null;
}

export function buildFilterSQL(f: FilterState): { occurrenceWhere: string } {
  const occurrenceClauses: string[] = [];

  // Taxon filter — null semantics naturally exclude sample-only rows (no taxon columns)
  if (f.taxonName !== null && f.taxonRank !== null) {
    const escaped = f.taxonName.replace(/'/g, "''");
    if (f.taxonRank === 'family') {
      occurrenceClauses.push(`family = '${escaped}'`);
    } else if (f.taxonRank === 'genus') {
      occurrenceClauses.push(`genus = '${escaped}'`);
    } else {
      occurrenceClauses.push(`scientificName = '${escaped}'`);
    }
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

export interface FilteredCounts {
  filteredSpecimens: number;
  filteredSpeciesCount: number;
  filteredGenusCount: number;
  filteredFamilyCount: number;
}

export async function queryFilteredCounts(f: FilterState): Promise<FilteredCounts | null> {
  if (!isFilterActive(f)) return null;
  const { occurrenceWhere } = buildFilterSQL(f);
  await tablesReady;
  const { sqlite3, db } = await getDB();
  let result: Record<string, unknown> = {};
  await sqlite3.exec(db,
    `SELECT COUNT(*) as specimens, COUNT(DISTINCT scientificName) as species,
            COUNT(DISTINCT genus) as genera, COUNT(DISTINCT family) as families
     FROM occurrences WHERE ecdysis_id IS NOT NULL AND ${occurrenceWhere}`,
    (rowValues: unknown[], columnNames: string[]) => {
      result = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
    }
  );
  return {
    filteredSpecimens: Number(result.specimens ?? 0),
    filteredSpeciesCount: Number(result.species ?? 0),
    filteredGenusCount: Number(result.genera ?? 0),
    filteredFamilyCount: Number(result.families ?? 0),
  };
}

export async function queryVisibleIds(f: FilterState): Promise<{ ids: Set<string>; rowCount: number } | null> {
  if (!isFilterActive(f)) return null;
  const { occurrenceWhere } = buildFilterSQL(f);
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const ids = new Set<string>();
  let rowCount = 0;
  await sqlite3.exec(db,
    `SELECT ecdysis_id, observation_id FROM occurrences WHERE ${occurrenceWhere}`,
    (rowValues: unknown[]) => {
      rowCount++;
      const ecdysisId = rowValues[0];
      const obsId = rowValues[1];
      if (ecdysisId != null) ids.add(`ecdysis:${Number(ecdysisId)}`);
      if (obsId != null) ids.add(`inat:${Number(obsId)}`);
    }
  );
  return { ids, rowCount };
}
