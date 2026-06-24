---
status: passed
phase: 162-add-specific-hikes-as-places
source: [162-VERIFICATION.md]
started: 2026-06-23T23:30:00Z
updated: 2026-06-24T00:00:00Z
---

# Phase 162: Add specific hikes as places — Human UAT

## Current Test

[complete — all scenarios passed]

## Tests

### 1. Hike corridors selectable in Regions/place-filter UI and render on map
expected: After regenerating the local `occurrences.db` (`cd data && uv run python
sqlite_export.py`) and hard-reloading `/app`, the 13 WTA hike corridors appear as
selectable place filters (names end in "… Trail"). Selecting one filters
occurrences to that corridor and draws its buffered MultiPolygon boundary on the
map. Spot-check Umtanum Creek Canyon (overlaps the L.T. Murray WDFW area — an
occurrence should belong to both, post-160 many-to-many).
why_human: Frontend auto-exposes new places.toml entries; visual + interactive
confirmation is the only way to verify the full UI rendering pipeline.
result: passed — user confirmed 2026-06-23 (13 hike corridors render + filter on the map)

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

(Tracked, not a UAT failure) `snoqualmie-pass-to-olallie-meadow-trail` was
deferred during execution — OSM only exposes it as the full ~75 km PCT Section J,
which over-claims ~9× vs the ~8 km day-hike. Re-add in a future pass with a
hand-traced GPX to the Olallie Meadow turnaround. Commented out with instructions
in `data/add_hikes_as_places.py`.
