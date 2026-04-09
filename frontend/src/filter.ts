import { getDuckDB, tablesReady } from './duckdb.ts';

export interface FilterState {
  taxonName: string | null;      // value of the selected taxon (family name, genus name, or scientificName)
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;           // 1-12; empty Set = no month filter active
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
}

export interface SpecimenRow {
  scientificName: string;
  recordedBy: string;
  date: string;
  year: number;
  month: number;
  county: string;
  ecoregion_l3: string;
  fieldNumber: string;
}

export interface SampleRow {
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  county: string;
  ecoregion_l3: string;
}

/** UI column key -> SQL column name. Also serves as allowlist for SQL injection prevention. */
export const SPECIMEN_COLUMNS: Record<string, string> = {
  species: 'scientificName',
  collector: 'recordedBy',
  date: 'date',
  year: 'year',
  month: 'month',
  county: 'county',
  ecoregion: 'ecoregion_l3',
  fieldNumber: 'fieldNumber',
};

export const SAMPLE_COLUMNS: Record<string, string> = {
  observer: 'observer',
  date: 'date',
  specimenCount: 'specimen_count',
  sampleId: 'sample_id',
  county: 'county',
  ecoregion: 'ecoregion_l3',
};

const PAGE_SIZE = 100;

export async function queryTablePage(
  f: FilterState,
  layerMode: 'specimens' | 'samples',
  sortCol: string,
  sortDir: 'asc' | 'desc',
  page: number
): Promise<{ rows: SpecimenRow[] | SampleRow[]; total: number }> {
  const columns = layerMode === 'specimens' ? SPECIMEN_COLUMNS : SAMPLE_COLUMNS;
  // Validate sort column against allowlist (SQL injection protection per T-40-01)
  const sqlSortCol = columns[sortCol];
  const safeSortCol = sqlSortCol ?? (layerMode === 'specimens' ? 'date' : 'date');
  // Validate sort direction — only accept literal 'asc' (per T-40-02)
  const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * PAGE_SIZE;

  const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
  const table = layerMode === 'specimens' ? 'ecdysis' : 'samples';
  const where = layerMode === 'specimens' ? ecdysisWhere : samplesWhere;
  const selectCols = layerMode === 'specimens'
    ? Object.values(columns).join(', ')
    : Object.entries(columns).map(([k, col]) =>
        k === 'date' ? `strftime(${col}, '%Y-%m-%d') as ${col}` : col
      ).join(', ');

  await tablesReady;
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const dataResult = await conn.query(
      `SELECT ${selectCols} FROM ${table} WHERE ${where} ORDER BY ${safeSortCol} ${safeDir} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
    );
    const countResult = await conn.query(
      `SELECT COUNT(*) as n FROM ${table} WHERE ${where}`
    );
    const rows = dataResult.toArray().map((r: any) => r.toJSON());
    const total = Number(countResult.toArray()[0]?.toJSON().n ?? 0);
    return { rows, total };
  } finally {
    await conn.close();
  }
}

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0;
}

export function buildFilterSQL(f: FilterState): { ecdysisWhere: string; samplesWhere: string } {
  const ecdysisClauses: string[] = [];
  const samplesClauses: string[] = [];

  // Taxon filter — ecdysis only (samples have no taxon columns)
  if (f.taxonName !== null && f.taxonRank !== null) {
    const escaped = f.taxonName.replace(/'/g, "''");
    if (f.taxonRank === 'family') {
      ecdysisClauses.push(`family = '${escaped}'`);
    } else if (f.taxonRank === 'genus') {
      ecdysisClauses.push(`genus = '${escaped}'`);
    } else {
      ecdysisClauses.push(`scientificName = '${escaped}'`);
    }
    // Taxon filter ghosts all samples — add impossible clause per D-01
    samplesClauses.push('1 = 0');
  }

  // Year range — both tables have year (samples derive year from date)
  if (f.yearFrom !== null) {
    ecdysisClauses.push(`year >= ${f.yearFrom}`);
    samplesClauses.push(`year(date::TIMESTAMP) >= ${f.yearFrom}`);
  }
  if (f.yearTo !== null) {
    ecdysisClauses.push(`year <= ${f.yearTo}`);
    samplesClauses.push(`year(date::TIMESTAMP) <= ${f.yearTo}`);
  }

  // Month filter — both tables (samples derive month from date)
  if (f.months.size > 0) {
    const monthList = [...f.months].join(',');
    ecdysisClauses.push(`month IN (${monthList})`);
    samplesClauses.push(`month(date::TIMESTAMP) IN (${monthList})`);
  }

  // County filter — both tables have county column
  if (f.selectedCounties.size > 0) {
    const counties = [...f.selectedCounties].map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    ecdysisClauses.push(`county IN (${counties})`);
    samplesClauses.push(`county IN (${counties})`);
  }

  // Ecoregion filter — both tables have ecoregion_l3 column
  if (f.selectedEcoregions.size > 0) {
    const ecors = [...f.selectedEcoregions].map(e => `'${e.replace(/'/g, "''")}'`).join(',');
    ecdysisClauses.push(`ecoregion_l3 IN (${ecors})`);
    samplesClauses.push(`ecoregion_l3 IN (${ecors})`);
  }

  const ecdysisWhere = ecdysisClauses.length > 0 ? ecdysisClauses.join(' AND ') : '1 = 1';
  const samplesWhere = samplesClauses.length > 0 ? samplesClauses.join(' AND ') : '1 = 1';
  return { ecdysisWhere, samplesWhere };
}

export interface FilteredCounts {
  filteredSpecimens: number;
  filteredSpeciesCount: number;
  filteredGenusCount: number;
  filteredFamilyCount: number;
}

export async function queryFilteredCounts(f: FilterState): Promise<FilteredCounts | null> {
  if (!isFilterActive(f)) return null;
  const { ecdysisWhere } = buildFilterSQL(f);
  await tablesReady;
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const result = await conn.query(
      `SELECT COUNT(*) as specimens, COUNT(DISTINCT scientificName) as species,
              COUNT(DISTINCT genus) as genera, COUNT(DISTINCT family) as families
       FROM ecdysis WHERE ${ecdysisWhere}`
    );
    const row = result.toArray()[0]?.toJSON();
    return {
      filteredSpecimens: Number(row?.specimens ?? 0),
      filteredSpeciesCount: Number(row?.species ?? 0),
      filteredGenusCount: Number(row?.genera ?? 0),
      filteredFamilyCount: Number(row?.families ?? 0),
    };
  } finally {
    await conn.close();
  }
}

export async function queryVisibleIds(f: FilterState): Promise<{ ecdysis: Set<string> | null; samples: Set<string> | null }> {
  if (!isFilterActive(f)) {
    return { ecdysis: null, samples: null };
  }

  const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
  console.debug('[filter-sql] ecdysis WHERE:', ecdysisWhere);
  console.debug('[filter-sql] samples WHERE:', samplesWhere);

  await tablesReady;
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const ecdysisResult = await conn.query(
      `SELECT ecdysis_id FROM ecdysis WHERE ${ecdysisWhere}`
    );
    const ecdysisIds = new Set<string>();
    for (const row of ecdysisResult.toArray()) {
      ecdysisIds.add(`ecdysis:${Number(row.toJSON().ecdysis_id)}`);
    }

    const samplesResult = await conn.query(
      `SELECT observation_id FROM samples WHERE ${samplesWhere}`
    );
    const sampleIds = new Set<string>();
    for (const row of samplesResult.toArray()) {
      sampleIds.add(`inat:${Number(row.toJSON().observation_id)}`);
    }

    return { ecdysis: ecdysisIds, samples: sampleIds };
  } finally {
    await conn.close();
  }
}
