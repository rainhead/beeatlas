# Phase 132: Page Rebuild & Subfamily Pages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 132-page-rebuild-subfamily-pages
**Areas discussed:** Where rollups live, Subfamily page content, Collision handling (PAGE-03), Subfamily coverage (PAGE-02)

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Where rollups live | Pipeline artifact vs build-time JS for hierarchy-keyed totals | ✓ |
| Subfamily page content | What a subfamily page lists; metadata | ✓ |
| Subfamily coverage | All 13 vs only-with-data | (discussed later) |
| Collision handling | Fail-build vs suffix; map coloring | (discussed later) |

---

## Where rollups live

### Q1 — Where should rollups be produced?

| Option | Description | Selected |
|--------|-------------|----------|
| New dbt model | taxon_id-keyed dbt mart, reads taxa.csv.gz; aligns with sole-producer invariant; testable | ✓ |
| Python post-process | Compute in Python alongside species_export/species_maps; emit JSON | |
| Keep in species.js | Switch eleventy build-time grouping from rank-strings to taxon_id | |

**User's choice:** New dbt model
**Notes:** dbt can already read taxa.csv.gz (rank + ancestry) via the stg_inat__genus_taxon_ids pattern, so a fully taxon_id-keyed rollup is feasible natively with no dependency on the Python-built occurrences.db.

### Q2 — Counts only or counts + membership edges?

| Option | Description | Selected |
|--------|-------------|----------|
| Counts + membership | Rollup also emits taxon_id parent→child edges; member lists hierarchy-derived; templates pure-presentation | |
| Counts only | dbt emits counts; species.js still assembles member lists | |
| You decide | Claude recommends during planning | ✓ |

**User's choice:** You decide
**Notes:** Claude leans counts + membership so member lists are hierarchy-derived too (fully honors PAGE-01); planner may split into separate models if the combined one gets unwieldy. (CONTEXT D-10.)

### Q3 — Fate of higher_rank_taxon_ids.json?

| Option | Description | Selected |
|--------|-------------|----------|
| Supersede with dbt | New rollup becomes single source of higher-rank taxon_ids; retire JSON + Python builder | ✓ |
| Leave it alone | Keep the JSON for iNat links; two overlapping sources coexist | |
| You decide | Claude recommends during planning | |

**User's choice:** Supersede with dbt
**Notes:** The rollup is already keyed on the same taxon_ids used for the "View on iNaturalist" links.

---

## Subfamily page content

### Q1 — What does a subfamily page list?

| Option | Description | Selected |
|--------|-------------|----------|
| Genera directly | Flat genus list, like tribe page lists genera | |
| Tribes | List tribes (one level down); needs ungrouped bucket for tribe-less genera | |
| Tribes → genera nested | Two-level: tribe headings with genera nested; new layout pattern | ✓ |

**User's choice:** Tribes → genera nested
**Notes:** Richest browse; accepted as a new layout pattern not used elsewhere.

### Q2 — Subfamily SVG map coloring?

| Option | Description | Selected |
|--------|-------------|----------|
| By genus | One color per genus; genus swatches correlate with map dots | ✓ |
| By tribe | One color per tribe; coarsest/cleanest | |
| Single color | No multi-color, no swatches | |

**User's choice:** By genus
**Notes:** Per-species (existing group-map behavior) would be hundreds of colors across a subfamily — illegible. By-genus matches the nested list's genus level.

### Q3 — Tribe-less genera handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list, no heading | Tribe-less genera render directly; no-tribe subfamilies become flat lists | ✓ |
| 'Other genera' bucket | Explicit heading for tribe-less genera | |
| You decide | Claude picks, defaulting to graceful degradation | |

**User's choice:** Flat list, no heading
**Notes:** Data check found 5 single-genus subfamilies (Colletinae, Rophitinae, Hylaeinae, Melittinae, Nomiinae) with a tribe-less genus; all multi-genus subfamilies place every genus in a tribe.

---

## Collision handling (PAGE-03)

### Q1 — Collision check behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail the build | Generation-time assertion stops the build; matches fail-loud gates | ✓ |
| Deterministic suffix | Auto-resolve with stable suffix; URLs silently change | |
| You decide | Claude picks, defaulting to hard-fail | |

**User's choice:** Hard-fail the build
**Notes:** Collisions among taxon names are rare; fail-loud forces deliberate human resolution and avoids silent URL changes.

---

## Subfamily coverage (PAGE-02)

### Q1 — Which subfamilies get pages?

| Option | Description | Selected |
|--------|-------------|----------|
| Bee subfamilies w/ members | is_anthophila=1 with ≥1 member genus — the 12, excluding Eumeninae | ✓ |
| All hierarchy subfamilies | All 13 — but would publish a wasp (Eumeninae) page, violating HIER-05 | |

**User's choice:** Bee subfamilies w/ members
**Notes:** Data check found the 13th hierarchy subfamily is Eumeninae (potter wasps / bycatch), present only via a non-bee occurrence. Excluding it honors HIER-05 and matches existing member-gated page generation.

---

## Claude's Discretion

- Counts-only vs counts+membership split for the dbt rollup (Q2 above) — Claude leans counts+membership (CONTEXT D-10).
- Exact dbt model shape/location (combined `higher_taxa` mart vs per-rank), its schema.yml contract, and eleventy data wiring.
- Subfamily page metadata wording ("N tribes · N genera · N records" etc.).

## Deferred Ideas

- Complex-rank pages (PAGE-05) — dropped in Phase 129; complex nodes deep-link to filtered map views.
- `/species` browse tree (Phase 133) — depends on this phase's rollup + Phase 130.
