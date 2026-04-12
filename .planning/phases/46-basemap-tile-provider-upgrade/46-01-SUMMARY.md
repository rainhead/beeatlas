---
plan: 46-01
phase: 46
status: complete
completed: 2026-04-11
---

# 46-01 Summary: Replace Esri Ocean Basemap with Stadia Maps Outdoors

## What Was Built

Replaced two stacked Esri Ocean tile layers (`World_Ocean_Base` + `World_Ocean_Reference`) with a single Stadia Maps `outdoors` tile layer in `frontend/src/bee-map.ts`.

## Key Changes

- Removed `import XYZ from "ol/source/XYZ.js"` — no longer needed
- Added `import StadiaMaps from "ol/source/StadiaMaps.js"`
- Replaced two `TileLayer(new XYZ(...))` blocks with one `TileLayer(new StadiaMaps({ layer: 'outdoors', retina: true }))`

## Outcome

- Map now shows terrain contours, roads, hiking trails, and natural features
- Zoom level support extended to 20 (previously capped at ~15 with Esri Ocean)
- Attribution (Stadia Maps / OpenStreetMap) displays automatically via OL source
- No API key or credentials in code — domain-based auth configured via Stadia Maps dashboard before production deploy
- Build passes; pre-existing test failure in `bee-sidebar.test.ts` (unrelated to this change)

## Human Verification

User visually confirmed new basemap renders terrain, roads, and trails correctly.

## Files Modified

- `frontend/src/bee-map.ts` — basemap tile source replaced
