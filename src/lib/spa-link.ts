// Source: docs at top of src/url-state.ts (added in Phase 81 per LINK-04).
// Verified contract at src/url-state.ts:35-89 (Phase 80 baseline).
//
// Stable interface: the SPA's parseParams requires BOTH `taxon` AND
// `taxonRank` query params (one of 'family', 'genus', 'species').
// If either is missing, parseParams resolves taxonName=null (silent
// drop). Therefore both MUST be emitted by every cross-route deep-link.
//
// This module imports nothing from src/filter.ts, src/bee-map.ts,
// src/bee-atlas.ts, src/sqlite.ts, mapbox-gl, wa-sqlite, or
// ../url-state.ts — enforced by src/tests/arch.test.ts (Pitfall #7
// mitigation; D-05 boundary).

export type TaxonRank = 'family' | 'genus' | 'species';

export function buildSpaTaxonLink(
  scientificName: string,
  rank: TaxonRank = 'species'
): string {
  const params = new URLSearchParams();
  params.set('taxon', scientificName);
  params.set('taxonRank', rank);
  return '/?' + params.toString();
}
