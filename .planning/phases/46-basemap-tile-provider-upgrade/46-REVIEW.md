---
phase: 46-basemap-tile-provider-upgrade
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - frontend/src/bee-map.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `frontend/src/bee-map.ts` with focus on the Stadia Maps basemap substitution (lines 357-361). The `StadiaMaps` source is configured correctly: `layer: 'outdoors'` is a valid entry in the OL `LayerConfig`, and `retina: true` works as expected — the `outdoors` provider falls through to the default `ProviderConfig` fallback `{ retina: true }`, so `@2x` tile URLs are generated. No credentials are hardcoded. Attribution is handled automatically by the library.

Two warnings were found: a leftover empty `LayerGroup` in the map layer stack, and a stale `package-lock.json` that specifies versions older than the declared `package.json` ranges.

## Warnings

### WR-01: Empty LayerGroup in map layer stack

**File:** `frontend/src/bee-map.ts:363`
**Issue:** `new LayerGroup()` is included in the `layers` array with no source, no child layers, and no subsequent reference. It appears to be a leftover from the two-layer Esri stack that was removed in this phase. It has no visual effect but adds a superfluous entry that will be iterated on every render.
**Fix:** Remove the empty `LayerGroup` entry from the `layers` array:
```ts
this.map = new OpenLayersMap({
  layers: [
    new TileLayer({
      source: new StadiaMaps({ layer: 'outdoors', retina: true }),
    }),
    // remove: new LayerGroup(),
    this.specimenLayer,
    this.sampleLayer,
    regionLayer,
  ],
  ...
});
```

### WR-02: package-lock.json is stale relative to package.json declared ranges

**File:** `frontend/package-lock.json` (lock root)
**Issue:** `package.json` declares `"ol": "^10.7.0"` and `"ol-mapbox-style": "^13.2.0"`, but `package-lock.json` records `ol@10.4.0` and `ol-mapbox-style@12.5.0`. A fresh `npm ci` on a clean machine will either fail (if npm strict-mode rejects the mismatch) or silently install the older versions. This risks shipping code that was tested against a newer API against an older library, which is particularly relevant here since the `StadiaMaps` source and its options evolve between minor OL versions.
**Fix:** Run `npm install` in `frontend/` to regenerate the lock file against the declared ranges, then commit the updated `package-lock.json`.

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
