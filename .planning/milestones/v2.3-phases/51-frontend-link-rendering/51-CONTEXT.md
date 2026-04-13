---
phase: 51
title: "Frontend Link Rendering"
created: "2026-04-13"
status: ready
---

# Phase 51 Context: Frontend Link Rendering

## Domain

Surface `specimen_observation_id` from `ecdysis.parquet` as a clickable iNaturalist link (📷 camera emoji) in the specimen detail sidebar. Specimens without a `specimen_observation_id` show nothing new — no placeholder.

## Decisions

### Link placement
- **Same line as host plant link**, appended after it with `·` separator
- Row pattern: `[species name link] · [host iNat link] · [📷 specimen photo link]`
- When host link is absent (no `hostObservationId`): `[species name link] · iNat: — · [📷 link]`
- When both absent: row unchanged from today

### Link text
- **📷 camera emoji only** — no text, just the emoji as the link content
- `<a href="https://www.inaturalist.org/observations/${s.specimenObservationId}" target="_blank" rel="noopener">📷</a>`

### No-link behavior
- When `specimenObservationId` is null/undefined: **render nothing** — no placeholder, no "WABA: —"
- The existing `iNat: —` placeholder for absent `hostObservationId` is **unchanged**

## Implementation Touch Points

All four of these need updating — none can be skipped:

1. **`frontend/src/bee-sidebar.ts` — `Specimen` interface**
   - Add `specimenObservationId?: number | null`

2. **`frontend/src/bee-map.ts` — `computeSamples()` function**
   - Reads OL feature properties → constructs `Specimen` objects
   - Add `specimenObservationId: f.get('specimen_observation_id') as number | null ?? null`

3. **`frontend/src/bee-atlas.ts` — URL restore DuckDB query (~line 768)**
   - `SELECT` must include `specimen_observation_id`
   - Mapping must include `specimenObservationId: obj.specimen_observation_id != null ? Number(obj.specimen_observation_id) : null`

4. **`frontend/src/bee-specimen-detail.ts` — render method**
   - After the `hostObservationId` link (or `iNat: —`), conditionally append:
     ```
     ${s.specimenObservationId != null ? html`
       · <a href="https://www.inaturalist.org/observations/${s.specimenObservationId}" target="_blank" rel="noopener">📷</a>
     ` : ''}
     ```

## Canonical Refs

- `frontend/src/bee-sidebar.ts` — `Specimen` interface definition
- `frontend/src/bee-map.ts` — `computeSamples()` where OL features → Specimen objects
- `frontend/src/bee-atlas.ts` — URL-restore DuckDB query (line ~768)
- `frontend/src/bee-specimen-detail.ts` — renders per-species rows

## Constraints

- Static hosting only — no server runtime
- Lit web components pattern throughout — no React, no Vue
- iNat observation URL: `https://www.inaturalist.org/observations/${id}`
- No new dependencies

## Out of Scope

- Thumbnail preview of the photo (new capability)
- WABA branding/attribution beyond the link (new capability)
- Sorting/filtering by WABA link presence (new capability)
