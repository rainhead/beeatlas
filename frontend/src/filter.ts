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

export const filterState: FilterState = {
  taxonName: null,
  taxonRank: null,
  yearFrom: null,
  yearTo: null,
  months: new Set(),
  selectedCounties: new Set(),
  selectedEcoregions: new Set(),
};

export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0;
}

// Visible feature ID sets. null = no filter active (show all).
// Populated by queryVisibleIds(), consumed by style callbacks.
export let visibleEcdysisIds: Set<string> | null = null;
export let visibleSampleIds: Set<string> | null = null;

export function setVisibleIds(
  ecdysis: Set<string> | null,
  samples: Set<string> | null,
): void {
  visibleEcdysisIds = ecdysis;
  visibleSampleIds = samples;
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
