---
created: 2026-04-08T14:31:09.943Z
title: Add collector filter to sidebar
area: ui
files:
  - frontend/src/bee-filter-controls.ts
  - frontend/src/bee-atlas.ts
---

## Problem

Specimens have a `collector` field but there's no way to filter by it in the sidebar. Users who want to find all specimens collected by a specific person have no path to do so.

## Solution

Follow the species picker pattern already in bee-filter-controls.ts — a searchable dropdown/autocomplete populated from distinct collector values in the parquet data. Wire into filterState and queryVisibleIds the same way the genus/species filters work.
