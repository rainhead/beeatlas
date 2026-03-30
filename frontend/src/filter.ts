import type Feature from 'ol/Feature.js';

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

export function matchesFilter(feature: Feature, f: FilterState): boolean {
  // Taxon check
  if (f.taxonName !== null) {
    const ok =
      (f.taxonRank === 'family'  && feature.get('family') === f.taxonName) ||
      (f.taxonRank === 'genus'   && feature.get('genus')  === f.taxonName) ||
      (f.taxonRank === 'species' && feature.get('scientificName') === f.taxonName);
    if (!ok) return false;
  }
  // Year range
  const year = feature.get('year') as number;
  if (f.yearFrom !== null && year < f.yearFrom) return false;
  if (f.yearTo   !== null && year > f.yearTo)   return false;
  // Month (empty Set = no filter)
  if (f.months.size > 0 && !f.months.has(feature.get('month') as number)) return false;
  // County (empty Set = no filter; OR-within-type, AND-across-types)
  if (f.selectedCounties.size > 0) {
    const county = feature.get('county') as string | null | undefined;
    if (!county || !f.selectedCounties.has(county)) return false;
  }
  // Ecoregion (empty Set = no filter; OR-within-type, AND-across-types)
  if (f.selectedEcoregions.size > 0) {
    const ecor = feature.get('ecoregion_l3') as string | null | undefined;
    if (!ecor || !f.selectedEcoregions.has(ecor)) return false;
  }
  return true;
}
