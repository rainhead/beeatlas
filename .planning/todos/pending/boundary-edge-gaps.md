---
title: Fix boundary polygon edge gaps and overlaps
priority: low
source: phase-73-human-verification
created: 2026-04-27
---

Adjacent region boundaries (counties/ecoregions) have small gaps and overlaps where the right edge of one polygon is approximated differently from the left edge of the next. This is a GeoJSON simplification artifact — the shared edges between adjacent polygons need to be topologically consistent.

Likely fix: use TopoJSON-aware simplification in the data pipeline, or pre-process boundaries with `topojson-server` to ensure shared edges are identical.
