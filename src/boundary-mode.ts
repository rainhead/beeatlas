/**
 * Which region layer the map draws.
 *
 * ONE spelling, imported everywhere. The union used to be respelled inline in
 * <bee-atlas>, <bee-map> and url-state, so adding a member meant finding every
 * copy — the same hazard as a new FilterState field.
 *
 * It lives in its own module rather than in url-state.ts because <bee-map> needs
 * it and <bee-map> must not import from url-state at all (ARCH-03: the map is a
 * pure presenter and knows nothing about the URL). A type-only import would be
 * runtime-free, but the invariant is worth more than the convenience.
 *
 * `ecoregions` is EPA Level III. `ecoregions_l4` is the Level IV refinement, whose
 * features are also PLACES — clicking one selects a place, exactly as `places`
 * does (beeatlas-8gcw) — which is why two of these five modes draw places and
 * "leaving places" means leaving both.
 */
export type BoundaryMode = 'off' | 'counties' | 'ecoregions' | 'ecoregions_l4' | 'places' | 'wilderness';

/** Every mode except 'off', which is spelled by the ABSENCE of a `bm=` param. */
export const VALID_BOUNDARY_MODES: readonly BoundaryMode[] =
  ['counties', 'ecoregions', 'ecoregions_l4', 'places', 'wilderness'];
