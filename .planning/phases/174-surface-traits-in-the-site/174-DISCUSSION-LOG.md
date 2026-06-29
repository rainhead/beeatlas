# Phase 174: Surface Traits in the Site - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 174-surface-traits-in-the-site
**Areas discussed:** Data delivery, Detail layout, Index badges, Provenance, Badge scope, Clepto hosts, Label copy

---

## Data delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Merge into species.json | Join species_traits into the species export; each row carries trait fields; one fetch | ✓ |
| Separate traits.json sidecar | New keyed artifact like photos.json; new manifest key + deploy.yml line | |

**User's choice:** Merge into species.json
**Notes:** Mart is 1:1 with species, so a per-row merge is the natural shape and avoids a new fetch.

---

## Detail layout

| Option | Description | Selected |
|--------|-------------|----------|
| Definition list / labeled rows | "Traits" section with label→value rows; omits absent traits | ✓ |
| Badge/chip row | Compact pill badges in a flex row | |
| You decide | Cleanest fit for existing CSS | |

**User's choice:** Definition list / labeled rows

---

## Index badges

| Option | Description | Selected |
|--------|-------------|----------|
| Sociality + diet specialist only | Two highest-signal markers; nesting/native left to detail page | ✓ |
| All available traits as icons | Sociality, nesting, diet, native as icons; risks crowding | |
| You decide | Balance scannability vs clutter | |

**User's choice:** Sociality + diet specialist only

---

## Provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Native title tooltip | title= attribute giving the source; zero JS | ✓ |
| Visual distinction + tooltip | Genus-backbone rendered with a visual cue plus tooltip | |
| You decide | Satisfy TRAIT-UI-04 without a heavy component | |

**User's choice:** Native title tooltip

---

## Badge scope

| Option | Description | Selected |
|--------|-------------|----------|
| Index tree only | Badges only on /species/ index tree leaf nodes | |
| Index tree + genus/subgenus pages | Also on genus/subgenus/tribe species rows; threads through more builders | ✓ |
| You decide | Based on threading cost | |

**User's choice:** Index tree + genus/subgenus pages

---

## Clepto hosts

| Option | Description | Selected |
|--------|-------------|----------|
| Links to host species/genus pages | Link each host bee to its page where one exists; plain text otherwise | ✓ |
| Plain text list | Comma-joined plain text, no links | |
| You decide | Based on name→page resolution reliability | |

**User's choice:** Links to host species/genus pages

---

## Label copy

| Option | Description | Selected |
|--------|-------------|----------|
| Friendly domain labels | Map raw seed values to readable forms (Parasitic→Cleptoparasitic, etc.) | ✓ |
| Verbatim mart values | Show raw seed values as-is | |
| You decide | Read well while faithful to sources | |

**User's choice:** Friendly domain labels

---

## Claude's Discretion

- Detail-page "Traits" block placement and CSS within the existing layout.
- Visual form of the two index badges (icon vs text vs pill) and any legend.
- Precise label-map wording and source-string copy.
- The merge mechanism (widen dbt `species` mart vs join `species_traits.parquet` in `species_export.py`) — left as an open HOW for research/planning.

## Deferred Ideas

- Trait-based filtering/faceting on the map or index — future phase.
- Per-trait map symbology — future phase.
- Nesting & native badges on the index — deferred to detail-only for now.
