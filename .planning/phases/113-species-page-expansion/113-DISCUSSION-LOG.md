# Phase 113: Species Page Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 113-species-page-expansion
**Areas discussed:** Genus page — checklist-only species, SVG map design, Attribution & metadata, Seasonality histogram

---

## Genus page — checklist-only species

| Option | Description | Selected |
|--------|-------------|----------|
| Same list, labeled as checklist | Include alongside WABA species, showing 'N checklist records' or a badge | ✓ |
| Same list, 0 records | Include in same list but show '0 records' | |
| Separate section below | Checklist-only species get their own 'Also on checklist' section | |

**User's choice:** Same list, labeled with checklist count

| Option | Description | Selected |
|--------|-------------|----------|
| No — genus map stays occurrence-only | Genus SVG shows WABA occurrence points only | ✓ |
| Yes — add county fills to genus map | Show filled county polygons on the genus SVG | |

**User's choice (free text):** "occurrence only, including occurrences from the checklist csv"
**Notes:** Checklist records have no lat/lon coordinates — they cannot be represented as occurrence dots. Genus SVG stays occurrence-points only. County fills appear only on species detail pages.

---

## SVG map design

| Option | Description | Selected |
|--------|-------------|----------|
| Single augmented SVG | County fills + occurrence dots in one SVG, same image slot | ✓ |
| Two SVGs side by side | Separate occurrence-dot SVG and county-fill SVG | |
| County-fill SVG replaces occurrence SVG | For checklist species, county fills only (no dots) | |

**User's choice:** Single augmented SVG

| Option | Description | Selected |
|--------|-------------|----------|
| Light blue fill | #b0cfe8, fill-opacity:0.5 | ✓ |
| Light green fill | #b0e8b0, fill-opacity:0.5 | |
| You decide | Choose the color that reads best | |

**User's choice:** Light blue fill (#b0cfe8)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same slot, county fills only | If on_checklist and has county data, show county-fill SVG in existing slot | ✓ |
| New dedicated slot below | Separate slot for county-fill map | |

**User's choice:** Same slot

---

## Attribution & metadata

| Option | Description | Selected |
|--------|-------------|----------|
| Separate line after existing metadata | New line: 'N checklist records · Bartholomew et al. 2024' | ✓ |
| Integrated into one metadata line | Merged into existing metadata line | |

**User's choice:** Separate line

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text only | Citation with no hyperlink | |
| Link to paper/checklist source | Wrap in anchor tag | ✓ |

**User's choice:** Link to paper

**URL provided by user:** `https://jhr.pensoft.net/article/129013/`

---

## Seasonality histogram

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — merge checklist months in | Add checklist months to month_histogram; ~15% null months skipped | ✓ |
| No — histogram stays WABA-only | Histogram remains WABA only; suppressed when occurrence_count=0 and not on_checklist | |

**User's choice:** Merge checklist months in

| Option | Description | Selected |
|--------|-------------|----------|
| In dbt — extend int_species_universe | Checklist month histogram CTE, element-wise addition | ✓ |
| In Python export post-step | Post-step reads and merges the parquets | |

**User's choice:** In dbt

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress (all zeros = hidden) | All-zero merged histogram hidden silently | |
| Show empty with note | Show histogram with 'Monthly phenology not recorded' note | ✓ |

**User's choice:** Show empty with note

---

## Species index display (additional item)

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'checklist only' badge | Replace '0 records' with badge | ✓ |
| Show checklist record count | Show 'N checklist records' | |
| Keep '0 records' | No change | |

**User's choice:** 'checklist only' badge

## Atlas link (additional item)

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the link entirely | Don't render atlas link when occurrence_count=0 | ✓ |
| Show it anyway | Keep link even showing 0 occurrences | |

**User's choice:** Hide when occurrence_count=0

---

## Claude's Discretion

- Exact dbt placement for `checklist_count` column
- Color class naming for checklist county fills in `species_maps.py`
- Whether `genusList` checklist count comes from reading `checklist.parquet` at build time or a new field in `species.json`

## Deferred Ideas

None — discussion stayed within phase scope.
