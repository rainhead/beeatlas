# Phase 41: CSV Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 41-csv-export
**Areas discussed:** Button placement, CSV columns, Filename algorithm

---

## Button Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inside bee-table (table view only) | Button in pagination bar, only visible in table view. Natural context — you see the data, you download it. | ✓ |
| In bee-sidebar (always visible) | Button visible even in map view. User can filter on map and download without switching to table. | |

**User's choice:** Inside bee-table (table view only)
**Notes:** bee-table emits `download-csv` event upward; bee-atlas handles query and file generation.

---

## CSV Columns

| Option | Description | Selected |
|--------|-------------|----------|
| Same as table display columns | Specimens: species, collector, year, month, county, ecoregion, field number. Samples: observer, date, specimen count, county, ecoregion. | |
| All available parquet fields | SELECT * from parquet — includes lat/lon, genus, family, floralHost, occurrenceID, etc. | ✓ |

**User's choice:** All available parquet fields
**Notes:** Use full column list from validate-schema.mjs as source of truth.

---

## Filename Algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Priority order, up to 2 segments | taxon > collector > year > county/ecoregion; cap at 2 segments for readability | ✓ |
| All active filters concatenated | Join all active filter values; can get long | |
| Taxon/type only, or -all | Simple: just taxon if set, otherwise -all | |

**User's choice:** Priority order, up to 2 segments
**Notes:** Examples confirmed: specimens-bombus-2023.csv, specimens-bombus-king.csv, specimens-2023.csv, specimens-all.csv.

---

## Claude's Discretion

- Slugification details (lowercase, spaces → hyphens, segment truncation ~20 chars)
- `queryAllFiltered` function implementation in filter.ts
- Browser download mechanism (Blob URL / data: URI via dynamic `<a>` element)
- Year range formatting (`{from}-{to}`)

## Deferred Ideas

None.
