# Phase 120: Species Page Source Counts & Photo List - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 120-species-page-source-counts-photo-list
**Areas discussed:** Tribe page scope (SPE-02), Photo list storage (SPE-03), Atlas link count

---

## Tribe Page Scope (SPE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — genus entries on tribe pages | Update tribe.njk to show "N specimens · N community observations" per genus. Needs specimen_count + inat_obs_count per genus in tribeList. | ✓ |
| No — species lists only | SPE-02 applies to genus.njk and subgenus.njk only. Tribe.njk stays as "N records" per genus. | |
| You decide | Planner picks whichever is cleaner. | |

**User's choice:** Yes — applies to tribe.njk genus entries  
**Notes:** Label format on tribe pages is the same as genus/subgenus species entries ("N specimens · N community observations"), not abbreviated.

---

## Photo List Storage (SPE-03)

### Storage location

| Option | Description | Selected |
|--------|-------------|----------|
| Python post-step in species_export.py | JSON-only, no parquet schema change. Query inat_obs_data.observations in build_species(). | |
| New dbt CTE + nested struct in parquet | Nested LIST column in species.parquet. More complex. | |
| Separate photos.json file | Don't add to species.json — separate file keyed by canonical_name. | ✓ |

**User's choice:** Separate photos.json file  
**Notes:** Avoids bloating species.json; future carousel loads lazily.

### photos.json key format

| Option | Description | Selected |
|--------|-------------|----------|
| Keyed by canonical_name | { "Andrena accepta": [{url, license}, ...] } | ✓ |
| Keyed by slug | { "Andrena/accepta": [{url, license}, ...] } | |
| You decide | Planner picks. | |

**User's choice:** Keyed by canonical_name

### License filtering

| Option | Description | Selected |
|--------|-------------|----------|
| All photos, license field preserved | Store every photo; future carousel filters at display time. | |
| CC-licensed only | Filter rows where license IS NOT NULL and not 'all rights reserved'. | ✓ |
| You decide | Planner applies whatever makes sense. | |

**User's choice:** CC-licensed only

### Publish path

| Option | Description | Selected |
|--------|-------------|----------|
| public/data/photos.json (same as species.json) | Written by species_export.py, uploaded via nightly.sh hashed-upload. | ✓ |
| You decide | Planner picks. | |

**User's choice:** public/data/photos.json, same publish pattern

### Implementation location

| Option | Description | Selected |
|--------|-------------|----------|
| Inside species_export.py | Add photos write call inside build_species(). No new STEPS entry. | ✓ |
| Separate step in run.py | New "photos" step + new photos_export.py module. | |

**User's choice:** Inside species_export.py

---

## Atlas Link Count

| Option | Description | Selected |
|--------|-------------|----------|
| Update to occurrence_count + inat_obs_count | Reflects all atlas records; more accurate since iNat obs now show on map. | ✓ |
| Keep as occurrence_count only | Semantically refers to WABA collector records. | |
| You decide | Planner picks. | |

**User's choice:** Update to occurrence_count + inat_obs_count

### Link text wording

| Option | Description | Selected |
|--------|-------------|----------|
| "View N records on the atlas →" | Replace "occurrences" with "records" since count spans 3 sources. | ✓ |
| Keep "occurrences" wording | No wording change needed. | |
| You decide | Planner picks. | |

**User's choice:** "View N records on the atlas →"

---

## Claude's Discretion

- Nunjucks arithmetic for `occurrence_count + inat_obs_count` (inline vs pre-computed field)
- `tribeList` aggregation approach (inline reduce vs separate pass)
- `photos.json` sort order within species list
- DuckDB query for CC-license filter (exact license string values)
- `nightly.sh` manifest key for `photos.json` (expected: `"photos"`)

## Deferred Ideas

- Photo carousel UI (SPE-F01) — photos.json stored now; display is a future milestone
- Atlas link filter pre-selection — pre-apply source filters on click; separate UX feature
