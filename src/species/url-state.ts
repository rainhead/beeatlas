// Phase 81 D-06 — disjoint URL contract for /species/.
// Pattern mirrors src/url-state.ts:25-65 (build) and :67-130 (parse) but
// shares ZERO code with the SPA's url-state.ts. Param namespace:
//   fam, subf, tribe, gen, subg, county (CSV), ecor (CSV), m0, m1
//
// Known approximation (D-02): combined_vec[m] = max(county_vec[m],
// ecoregion_vec[m]). seasonality.json carries no crossed
// county×ecoregion slices, so max() is a deduplicating proxy for OR
// across overlapping geos. A record in King county that ALSO falls in
// Puget Lowland appears once in `county:King` and once in
// `ecoregion_l3:Strait of Georgia/Puget Lowland`; max() avoids
// double-counting in the common case but can mis-count when both sets
// contribute non-trivially. Exact OR would require crossed slices from a
// Phase 78 pipeline change — explicitly deferred. Do NOT refactor into a
// sum without revisiting CONTEXT.md D-02.

export interface SpeciesPageState {
  taxonPath: {
    family: string | null;
    subfamily: string | null;
    tribe: string | null;
    genus: string | null;
    subgenus: string | null;
  };
  counties: Set<string>;
  ecoregions: Set<string>;
  monthFrom: number;  // 1..12, default 1
  monthTo: number;    // 1..12, default 12
}

export function buildParams(s: SpeciesPageState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.taxonPath.family)    p.set('fam',   s.taxonPath.family);
  if (s.taxonPath.subfamily) p.set('subf',  s.taxonPath.subfamily);
  if (s.taxonPath.tribe)     p.set('tribe', s.taxonPath.tribe);
  if (s.taxonPath.genus)     p.set('gen',   s.taxonPath.genus);
  if (s.taxonPath.subgenus)  p.set('subg',  s.taxonPath.subgenus);
  if (s.counties.size > 0)   p.set('county', [...s.counties].sort().join(','));
  if (s.ecoregions.size > 0) p.set('ecor',   [...s.ecoregions].sort().join(','));
  if (s.monthFrom !== 1)     p.set('m0', String(s.monthFrom));
  if (s.monthTo   !== 12)    p.set('m1', String(s.monthTo));
  return p;
}

export function parseParams(search: string): SpeciesPageState {
  const p = new URLSearchParams(search);
  const csv = (k: string) => {
    const v = p.get(k) ?? '';
    return new Set(v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
  };
  const month = (k: string, fallback: number) => {
    const n = parseInt(p.get(k) ?? '');
    return (Number.isFinite(n) && n >= 1 && n <= 12) ? n : fallback;
  };
  return {
    taxonPath: {
      family:    p.get('fam')   || null,
      subfamily: p.get('subf')  || null,
      tribe:     p.get('tribe') || null,
      genus:     p.get('gen')   || null,
      subgenus:  p.get('subg')  || null,
    },
    counties:   csv('county'),
    ecoregions: csv('ecor'),
    monthFrom:  month('m0', 1),
    monthTo:    month('m1', 12),
  };
}
