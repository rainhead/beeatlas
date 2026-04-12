# Phase 46: Basemap Tile Provider Upgrade - Research

**Researched:** 2026-04-11
**Domain:** OpenLayers tile provider configuration, raster tile services
**Confidence:** HIGH

## Summary

BeeAtlas currently uses two stacked Esri Ocean tile layers as the basemap: `World_Ocean_Base` and `World_Ocean_Reference`. The Ocean Reference overlay is noted in the code as "unmaintained." Neither layer includes terrain contours, roads, or hiking trails — features that are directly relevant to bee collecting fieldwork. The Ocean basemap caps out at roughly zoom level 15 (Esri confirmed zoom limitations in community reports), making street-level navigation impossible.

The upgrade replaces these two layers with a single tile provider that shows terrain, natural features, roads, and trails at zoom levels up to 20. OpenLayers 10.x (the version in use) has a first-class `StadiaMaps` source built in since v8.0, and the `outdoors` layer style is the strongest match: it shows topographic contours, parks, mountains, hiking paths, and full road network. Implementation is a two-line swap in `bee-map.ts` with no new npm dependencies.

The main planning decision is authentication strategy for Stadia Maps on the live site. Stadia Maps requires either a registered domain allowlist (free, no credit card, no code changes) or an API key. Without any configuration, production deployments hit strict rate limits. The recommended path is to register a free account, allowlist the production domain, and embed no credentials in code.

**Primary recommendation:** Replace both Esri Ocean layers with a single `new TileLayer({ source: new StadiaMaps({ layer: 'outdoors', retina: true }) })` using the built-in OpenLayers source. Register a free Stadia Maps account and allowlist the production domain before deploying.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ol` (OpenLayers) | 10.8.0 (already installed) | Map rendering, tile layer management | Already the project's map framework |
| `ol/source/StadiaMaps` | Built into OL 8+ | Stadia Maps tile source | First-class OL source, no extra npm package needed |

[VERIFIED: npm registry — `ol@10.8.0` confirmed installed via `npm list`]
[VERIFIED: OpenLayers API docs — `StadiaMaps` source documented at openlayers.org/en/latest/apidoc]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stadia Maps `outdoors` | OpenTopoMap | Free, no account, but not actively maintained as of 2024; max zoom 17; CC-BY-SA attribution required |
| Stadia Maps `outdoors` | USGS Topo (`basemap.nationalmap.gov`) | Genuinely free, no account needed, good topo; max LOD 16 per tile cache (may return blank tiles at 17+); US-only |
| Stadia Maps `outdoors` | Esri World Topo Map (legacy) | Legacy service deprecated April 2022, no longer maintained, still accessible but no tile updates |
| Stadia Maps `outdoors` | Stadia `stamen_terrain` | Terrain emphasis with hillshade, slightly less road/trail detail than `outdoors`; same authentication requirement |
| Single layer | Two layers (base + overlay) | Current two-layer approach was needed for Ocean style; single-layer providers like Stadia don't need it |

**Installation:**

No new packages required. `ol` is already installed with `StadiaMaps` source built in.

## Architecture Patterns

### Recommended Change in bee-map.ts

Replace the two `TileLayer` blocks at lines 357–371 with a single layer:

```typescript
// Source: https://openlayers.org/en/latest/examples/stadia-maps.html
import StadiaMaps from "ol/source/StadiaMaps.js";

// In map creation:
new TileLayer({
  source: new StadiaMaps({
    layer: 'outdoors',
    retina: true,
  }),
}),
```

Remove the existing `import XYZ from "ol/source/XYZ.js"` if XYZ is not used elsewhere in the file.

[VERIFIED: openlayers.org/en/latest/apidoc — StadiaMaps class confirmed in OL 10.x]
[CITED: https://docs.stadiamaps.com/tutorials/raster-maps-with-openlayers/ — production authentication via domain allowlist, no code changes needed]

### Attribution

Stadia Maps + OpenStreetMap attributions must be displayed in the map. OpenLayers `StadiaMaps` source sets attribution automatically. No manual attribution string is needed.

[VERIFIED: OpenLayers source — StadiaMaps class extends XYZ and sets attributions internally]

### Anti-Patterns to Avoid

- **Embedding an API key in frontend code:** The Stadia Maps API key would be publicly visible in the browser. Use domain-based authentication (free account + allowlisted domain) instead. [CITED: https://docs.stadiamaps.com/authentication/]
- **Keeping the two-layer Ocean stack:** The `World_Ocean_Reference` overlay is noted as unmaintained in the existing code comment; removing it is intentional cleanup.
- **Using the legacy Esri World Topo Map URL directly:** That service was deprecated in April 2022 and tiles are no longer updated. [CITED: https://www.esri.com/arcgis-blog/products/developers/developers/open-source-developers-time-to-upgrade-to-the-new-arcgis-basemap-layer-service]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terrain/trails tileset | Custom tile rendering or proxy | Stadia Maps `outdoors` | Tile rendering at scale is extremely complex infrastructure |
| Attribution display | Manual attribution overlay | OL StadiaMaps automatic attribution | OL handles attribution display by design |
| Retina tile detection | devicePixelRatio logic | `retina: true` option on StadiaMaps | Already handled inside the source class |

## Common Pitfalls

### Pitfall 1: Rate Limiting Without Account Registration
**What goes wrong:** Unauthenticated production requests hit Stadia Maps rate limits (HTTP 429). The map stops loading tiles.
**Why it happens:** Stadia Maps requires domain allowlist or API key for production; localhost works without auth.
**How to avoid:** Register a free account at stadiamaps.com (no credit card required) and add the production domain to the allowlist before launch.
**Warning signs:** Map tiles load locally but fail in CI preview or on the live site.

### Pitfall 2: Zoom Level Mismatch
**What goes wrong:** The current Esri Ocean layers limit zoom; the view state is serialized in URLs. After switching providers, users who bookmarked zoom levels > 15 should now see tiles fine, but existing URL params are forward-compatible (higher zoom just works with Stadia).
**How to avoid:** No action needed — this is a positive change. Just verify the OL View has no explicit `maxZoom` constraint that would prevent reaching zoom 20.
**Warning signs:** Would only be a problem if someone had previously set an artificial `maxZoom` cap.

### Pitfall 3: Removing XYZ Import Too Aggressively
**What goes wrong:** `XYZ` import is removed but some other code still imports it.
**How to avoid:** Grep for all usages of `XYZ` in `bee-map.ts` before removing the import.
**Warning signs:** TypeScript compile error.

### Pitfall 4: Attribution Compliance
**What goes wrong:** OSM tiles require attribution. Missing attribution can violate terms of service.
**Why it happens:** Developer forgets or removes map attribution.
**How to avoid:** The `StadiaMaps` source sets attributions automatically in OpenLayers. Do not suppress or override `attributions` on the TileLayer or source.

## Code Examples

### Minimal Stadia Maps Integration
```typescript
// Source: https://openlayers.org/en/latest/apidoc/module-ol_source_StadiaMaps-StadiaMaps.html
import StadiaMaps from "ol/source/StadiaMaps.js";
import TileLayer from "ol/layer/Tile.js";

new TileLayer({
  source: new StadiaMaps({
    layer: 'outdoors',
    retina: true,
  }),
})
```

### Domain Allowlist Authentication (no code change needed)
Production authentication is managed entirely in the Stadia Maps dashboard by adding the live site's domain. The `StadiaMaps` source passes no credentials in the tile request URL; Stadia Maps validates the browser `Origin` / `Referer` headers automatically.

[CITED: https://docs.stadiamaps.com/authentication/]

### Available Stadia Layers Relevant to This Phase
| Layer key | Character | Max Zoom |
|-----------|-----------|----------|
| `outdoors` | Terrain, trails, parks, roads, POIs | 20 |
| `stamen_terrain` | Terrain + hillshade, fewer roads | 18 |
| `stamen_terrain_background` | Terrain only (no labels) | 18 |

[VERIFIED: openlayers.org/en/latest/apidoc — StadiaMaps layer options listed]
[CITED: https://docs.stadiamaps.com/map-styles/outdoors/]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stamen tile CDN (stamen.com) | Stadia Maps hosts all Stamen styles | 2023 | Stamen tiles now served at tiles.stadiamaps.com |
| OL XYZ source for Stadia | OL built-in `StadiaMaps` source | OL v8.0.0 (2023) | Simpler import, handles attribution automatically |
| Esri Ocean raster tile services | Deprecated / no longer updated | The `World_Ocean_Reference` overlay was always unmaintained per code comment | |

**Deprecated/outdated in this codebase:**
- `World_Ocean_Base` + `World_Ocean_Reference` double-layer approach: replaced by single unified provider
- `ol/source/XYZ` for basemap (if not used elsewhere after change): no longer needed once StadiaMaps source is used

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stadia Maps free tier (200,000 tiles/month) is sufficient for BeeAtlas traffic | Standard Stack | If traffic exceeds free tier, tiles return 429; minimal risk for a niche scientific tool |
| A2 | No explicit `maxZoom` is set on the OL View that would cap zoom below 20 | Pitfalls | Planner should verify; would need a one-line fix if present |
| A3 | `XYZ` import is only used for the basemap layers (not elsewhere in bee-map.ts) | Code Examples | TypeScript would catch this at build time |

## Open Questions

1. **Does the project need an API key in the codebase or is domain auth sufficient?**
   - What we know: Domain auth requires free account registration + allowlist; no code change.
   - What's unclear: Whether the project owner wants to depend on an external free-tier account.
   - Recommendation: Use domain auth (no credentials in repo). Document registration step as a prerequisite task in the plan.

2. **Which Stadia layer exactly — `outdoors` vs `stamen_terrain`?**
   - What we know: `outdoors` shows roads, trails, terrain, and POIs up to zoom 20. `stamen_terrain` shows hillshade/contours with fewer roads.
   - What's unclear: User preference for visual style.
   - Recommendation: Default to `outdoors` — it is the most complete for fieldwork use (roads AND trails). Note that `stamen_terrain` is the alternative if a more "topo map" aesthetic is preferred.

3. **Should the map show a USGS Topo overlay as an optional layer?**
   - What we know: USGS Topo (`basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}`) is free, no account needed, covers US only, caches to zoom 16.
   - What's unclear: Whether the phase scope includes optional layer controls.
   - Recommendation: Out of scope for this phase; single-layer replacement is sufficient.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ol` npm package | Tile layer source | Yes | 10.8.0 | — |
| Stadia Maps account (free) | Production tile auth | Not yet registered | — | Domain-auth registration required before deploy |
| Internet (tile CDN) | Map display | Yes (runtime) | — | — |

**Missing dependencies with no fallback:**
- Stadia Maps domain allowlist registration — required before production deploy. No code blocker; human task.

**Missing dependencies with fallback:**
- None for development (localhost works without auth).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `frontend/vite.config.ts` (vitest config inline) |
| Quick run command | `cd frontend && npm test` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements → Test Map

There are no phase requirement IDs defined for Phase 46 (requirements TBD). The change is a one-file swap of two tile layer instantiations in `bee-map.ts`. Existing test infrastructure mocks the map layer stack; no new test files are expected.

| Behavior | Test Type | Notes |
|----------|-----------|-------|
| Map renders without error | Smoke (manual) | OpenLayers does not render tiles in happy-dom test env; verify visually in dev server |
| TypeScript compiles cleanly | Build | `npm run build` — catches import errors |
| No regressions in bee-map property handling | Unit (existing) | `bee-atlas.test.ts` mocks region-layer; map layer internals are not unit-tested |

### Wave 0 Gaps
- None — no new test files required. TypeScript build acts as the automated verification gate.

## Security Domain

This phase has no authentication, user data, or server-side logic. The tile provider change is entirely client-side URL substitution. ASVS categories V2–V6 do not apply.

The only security-adjacent concern is the **Stadia Maps API key** — if an API key is used instead of domain auth, it must not be committed to the repository. Domain-based authentication (the recommended approach) avoids this entirely.

## Sources

### Primary (HIGH confidence)
- OpenLayers API docs (`openlayers.org/en/latest/apidoc/module-ol_source_StadiaMaps-StadiaMaps.html`) — StadiaMaps source class, available layers, retina option
- `npm list ol` in project root — confirmed ol@10.8.0 installed
- `bee-map.ts` lines 357–371 — current Esri Ocean tile layer implementation

### Secondary (MEDIUM confidence)
- Stadia Maps docs (`docs.stadiamaps.com/map-styles/outdoors/`) — outdoors style max zoom 20, feature set
- Stadia Maps auth docs (`docs.stadiamaps.com/authentication/`) — domain allowlist, no-credit-card free account
- Stadia Maps pricing (`stadiamaps.com/pricing/`) — 200,000 credits/month free tier
- OSM Raster Tile Providers wiki (`wiki.openstreetmap.org/wiki/Raster_tile_providers`) — OpenTopoMap, USGS options

### Tertiary (LOW confidence)
- Esri community reports — Ocean layer zoom cap around zoom 15 (cited by users, not verified against official LOD metadata)
- WebSearch results — Esri legacy basemap deprecation timeline (April 2022)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — OL StadiaMaps source verified in installed version, Stadia docs confirmed
- Architecture: HIGH — single-file change with verified API
- Pitfalls: MEDIUM — rate limiting behavior inferred from Stadia docs; Esri zoom cap from community reports
- Authentication path: HIGH — Stadia authentication docs are explicit

**Research date:** 2026-04-11
**Valid until:** 2026-07-11 (Stadia Maps tier structure and OL API are stable)
