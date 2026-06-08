# Phase 138: Frontend Points & Detail Card - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Phase 137 `source='checklist'` occurrences render as real, visually distinct map points; retire the old checklist county-fill layer; fold the checklist source into the real source-selection set (replacing the separate `_showChecklist` toggle); render a checklist detail card; and fix per-source counts so checklist records are counted once.

Concretely, this phase delivers (UIX-01…04):
1. **Checklist point layer** — checklist occurrences render as unclustered map points in a distinct flat green, cluster with other sources, and respond to the taxon filter.
2. **County-fill removal + source-set integration** — the `checklist-county-fill` layer (and its `_checklistAllRows`/county-aggregation path) is removed; `checklist` becomes a real entry in `VALID_SOURCES` so the "no sources selected" logic and the toggle UI count it correctly; `src=checklist` URL round-trips.
3. **Checklist detail card** — a checklist point's card shows collector, date (precision-aware), locality, "Bartholomew et al. 2024" attribution, and verbatim-vs-accepted name.
4. **Per-source counts** — species/taxon-page checklist counts equal the deduped/promoted checklist record count with no double-counting between the retired county-fill surface and the new point layer.

**Out of scope:** any change to the dedup/promotion data path itself (Phases 136–137, already shipped); new map legend UI; renaming the checklist source label.

**Upstream (shipped, this phase consumes):** Phase 137 put checklist rows in `occurrences` with `checklist_id`, decoding to `checklist:<N>` occIds via `occIdFromRow`/`parseOccId`. Phase 137 deliberately kept the contract minimal (only `checklist_id`; 34 cols) — this phase promotes the additional detail-card columns.

</domain>

<decisions>
## Implementation Decisions

### Point color & recency (UIX-01)
- **D-01:** Unclustered checklist points use a **distinct flat hue, overriding recency** — they do NOT follow the thisYear/lastYear/earlier gray scheme. Rationale: signals "a different kind of data" (published checklist) and avoids the all-gray result from coarse/missing checklist dates.
- **D-02:** The hue is **green**, carrying over the retired county-fill green (~`rgba(44,122,44)`) so existing users keep the green↔checklist association. Use a solid/opaque point fill (not the 0.25 fill-opacity the county layer used).
- **D-03 (derived):** Checklist points **cluster with the other three sources** (success criterion 1); the distinct green therefore appears only at the unclustered/zoomed-in level — clusters remain recency-colored aggregates. This is expected, not a bug.
- **D-04 (derived):** Selected checklist points keep the green fill plus the standard selection treatment (`selectedOccurrencesLayerSpec`); same circle radius/white stroke as other unclustered points.

### Detail card layout (UIX-03)
- **D-05:** Verbatim-vs-accepted name uses an **inline det. annotation**: `{accepted} (det. as {verbatim})` when they differ; show the accepted name alone when they match or when no verbatim exists. (Accepted name = `taxonCache.get(taxon_id)` / `canonical_name`, already populated for checklist rows.) If only a verbatim name exists (no resolved accepted name), show the verbatim alone.
- **D-06:** Attribution renders as a **plain muted citation line** `Bartholomew et al. 2024` at the bottom of the card — no link/DOI to maintain.
- **D-07:** Show **"Represents N collapsed records"** when `collapsed_count > 1`; omit when 1. (Requires promoting `collapsed_count` — see D-10.)
- **D-08:** Dates render **Roman-numeral, precision-aware**, matching the rest of the card: full → `15 VI 2019`, year-only → `2019`. Precision is inferred from the `date` string's length (10 = full `YYYY-MM-DD`, 4 = year `YYYY`); **no `date_quality` column needs plumbing.** Extend `formatRomanDate` to handle length-4 (and length-7 if month-precision dates turn out to exist — see research flag).
- **D-09 (derived):** Add a `_renderChecklist(row)` branch to `bee-occurrence-detail.ts`'s `render()` dispatch (checklist rows are `!isSpecimenBacked`, `!isProvisional`, `source==='checklist'`). Suggested field order: accepted name (det. as verbatim) → collector (`recordedBy`) → date → locality (omit line if null) → "Represents N collapsed records" (if N>1) → muted attribution.

### Detail-field plumbing (supports UIX-03)
- **D-10:** **Promote** `verbatim_name` (VARCHAR), `locality` (VARCHAR), `collapsed_count` (INTEGER) into the `occurrences` contract. ARM 4 selects the real values from `int_checklist_dedup_status` (= `int_checklist_collapsed.*`, which already carries all three); **ARMs 1–3 emit typed `NULL::…` casts** (same NULL-cast pattern Phase 137 used for `checklist_id`). Bump the enforced dbt contract **34 → 37 columns** in `marts/schema.yml`. The card reads these straight off the `occurrences` row — identical to how every other source's detail fields work; no new fetch path. `date_quality` is NOT promoted (precision recoverable from the date string).

### Source-set & toggle (UIX-02)
- **D-11 (derived):** Add `checklist` to `VALID_SOURCES` in `src/url-state.ts` (currently `['ecdysis', 'waba_sample', 'inat_obs']`) so the source set, "no sources selected" logic, and `src=` URL round-trip all include it (success criterion 4: `src=checklist` Vitest round-trip).
- **D-12 (derived):** Keep **"Checklist records"** as the source toggle label in `bee-pane.ts` (the label the county-fill toggle used). Remove the separate `_showChecklist`/`checklistVisible`/`checklistTaxon` plumbing through `bee-atlas` → `bee-pane` → `bee-map`; the checklist source now flows through the same `hiddenSources` path as the other three.

### Claude's Discretion
- Exact green shade/opacity and circle radius — D-02 fixes "green, carried over"; planner picks the precise paint values (review visually).
- Source ordering within the toggle list (planner's call; no strong preference expressed).
- Whether to keep a thin checklist green outline/stroke variant for contrast against gray points.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 138: Frontend Points & Detail Card" — goal + 4 success criteria (lock WHAT)
- `.planning/REQUIREMENTS.md` — UIX-01, UIX-02, UIX-03, UIX-04 (accept criteria)

### Upstream phase this consumes (read first)
- `.planning/phases/137-promotion-into-occurrences/137-CONTEXT.md` — what's in `occurrences` now: `checklist_id`, the minimal 34-col contract (D-05), the `checklist:<N>` occId, ARM-4 column population (D-06), and the deferred items this phase picks up (`collapsed_count`, richer provenance).

### Frontend code this phase modifies
- `src/style.ts` — `checklistCountyFillLayerSpec()` (~line 224, to remove); `unclusteredPointLayerSpec` / `_occurrencePointPaint` / `selectedOccurrencesLayerSpec` (recency-colored point paint — add the checklist green override here, keyed on a `source` feature property).
- `src/bee-map.ts` — `showChecklist`/`checklistTaxon`/`_checklistCounties`/`_checklistAllRows`/`_checklistGeneration` and the `checklist-county-fill` layer add/update/click paths (~lines 41–68, 344–345, 436–438, 706–763, plus the county-fill click interaction); remove and route checklist through the normal source path.
- `src/bee-pane.ts` — `_showChecklist` state (~line 115, 513–514, 620, 1134 toggle) → migrate to the `hiddenSources` source-toggle list.
- `src/bee-atlas.ts` — `_checklistVisible` / `.showChecklist=` wiring (~line 178) and source-state ownership (architecture invariant: `<bee-atlas>` owns reactive state).
- `src/url-state.ts` — `VALID_SOURCES` (line 34) + the `src=` serialize/parse (lines 97, 271–272); add `checklist`.
- `src/bee-occurrence-detail.ts` — `render()` source dispatch (line 287–305) + `formatRomanDate` (line 9); add `_renderChecklist` and year/month precision handling.
- `src/occurrence.ts` — `occIdFromRow`/`parseOccId` already handle `checklist:<N>` (lines 23–98); read for the occId contract, no change expected.
- `src/filter.ts` — `OccurrenceRow` interface (line 40) + `selectCols` lists (queryTablePage/queryListPage ~165/209/419); add the 3 promoted columns so the card receives them.

### Data pipeline (contract bump + counts)
- `data/dbt/models/intermediate/int_combined.sql` — ARM 4 (lines 197–244): add `verbatim_name`/`locality`/`collapsed_count` selects; ARMs 1–3 add the `NULL::…` casts.
- `data/dbt/models/marts/schema.yml` — the enforced `occurrences` contract (34 cols today): add the 3 columns → 37.
- `data/dbt/models/intermediate/int_checklist_collapsed.sql` / `int_checklist_dedup_status.sql` — source of `verbatim_name`, `locality`, `collapsed_count` for ARM 4.
- `data/dbt/models/intermediate/int_species_universe.sql` — `checklist_count_agg` (lines 44–51) currently counts the RAW `checklist` mart (all records, no dedup/suppression); reconcile for UIX-04 (research flag below).
- `data/dbt/models/marts/species.sql` / `data/species_export.py` — `checklist_count` column surfaced to species/taxon pages.
- `data/places_export.py` §`_query_counts` (lines 40–58) — per-source occurrence counts (canonical specimen predicate = `ecdysis_id IS NOT NULL`); check checklist isn't double-counted here.

### Domain vocabulary & invariants
- `CLAUDE.md` §"Domain Vocabulary" (Occurrence record, Specimen), §"ID format" (`checklist:<N>`), §"Architecture Invariants" (state ownership, style cache must bypass when filtered/selected, filter race guard), §"Known State" (the dbt contract is enforced at `bash data/dbt/run.sh build`; the column count is the gate).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`occIdFromRow` / `parseOccId`** (`src/occurrence.ts`): already decode/encode `checklist:<N>` — the occId layer is done.
- **Recency point paint** (`_occurrencePointPaint` in `src/style.ts`): the place to add a `source==='checklist' → green` override via a mapbox `match`/`case` on a `source` feature property (points must carry `source` in their GeoJSON properties — verify `features.ts` emits it).
- **Per-source `NULL::TYPE AS col` cast pattern** in `int_combined.sql` ARMs 1–3 (Phase 137 added `checklist_id` this way): the 3 new columns follow the same shape.
- **`bee-occurrence-detail.ts` source dispatch**: `_renderInatObs` / `_renderProvisional` / `_renderSampleOnly` are the templates to mirror for `_renderChecklist`.

### Established Patterns
- `<bee-atlas>` owns reactive state; `<bee-map>`/`<bee-sidebar>` are pure presenters (architecture invariant). The `_showChecklist` removal must respect this — checklist visibility folds into the existing `hiddenSources` state, not a new ad-hoc property chain.
- Style functions must bypass the cache when filtered/selected (architecture invariant) — the new green source-color expression participates in the same rule.
- The dbt contract column count is the enforcement gate (no separate JS validator); 34 → 37 must be reflected in `schema.yml`.

### Integration Points
- **Map points:** `occurrences` (source='checklist') → `sqlite_export` geo_blob → `features.ts` → point layer (green) → click → `occId` → `listRows` query → `bee-occurrence-detail` card.
- **Source toggle:** `bee-pane` toggle → `hiddenSources` → `bee-atlas` state → `url-state` `src=` param → filter `WHERE source IN (...)`.
- **Counts:** species page reads `species.parquet.checklist_count` (from `int_species_universe`) — must align with the deduped/promoted occurrences, not the raw checklist mart.

</code_context>

<specifics>
## Specific Ideas

- The green should be recognizably the same green as the old county-fill so the visual association survives the layer swap.
- The det. annotation mirrors the herbarium "det." convention deliberately — a domain-familiar shorthand for "this is what it was determined as."

</specifics>

<deferred>
## Deferred Ideas

- **Map legend** explaining source/recency colors — no legend exists today; adding one is a separate capability, not this phase.
- **Renaming the checklist source label** — keep "Checklist records" for now.
- **Linked/DOI attribution** for Bartholomew et al. 2024 — deferred; plain text this phase (D-06).

### Research flags (technical questions for gsd-phase-researcher to resolve, not user decisions)
- **UIX-04 double-count source of truth:** `checklist_count` is aggregated from the raw `checklist` mart (`int_species_universe.checklist_count_agg`, all records, no dedup/suppression), but checklist rows now also live in `occurrences`. Determine whether `checklist_count` should be re-sourced from `occurrences WHERE source='checklist'` (deduped/suppressed) and confirm `occurrence_count` / `_query_counts` semantics don't count a checklist record under both the retired surface and the point layer.
- **Month-precision dates:** ARM 4 builds only `full`→`YYYY-MM-DD` and `year_only`→`YYYY` (else NULL `date`). Confirm the actual `date_quality` value distribution — if month-precision (`YYYY-MM`) records exist they'd currently get a NULL date and silently drop from the card; if so, ARM 4 and `formatRomanDate` both need the month case.

</deferred>

---

*Phase: 138-frontend-points-detail-card*
*Context gathered: 2026-06-08*
