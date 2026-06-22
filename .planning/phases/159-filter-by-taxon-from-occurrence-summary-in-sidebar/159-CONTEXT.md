# Phase 159: Filter by taxon from occurrence summary in sidebar - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a click target on a taxon shown in the sidebar's per-record occurrence list
(`src/bee-occurrence-detail.ts`) that sets `FilterState.taxonId`, giving users a
one-click path from "I'm looking at this record" to "show me just this taxon on
the map" — saving the filter-panel round-trip.

**This is a new *entry point* into the existing filter, not new filter
machinery.** The taxon click emits the existing `FilterChangedEvent` upward;
`<bee-atlas>` (the state owner) applies it through the same path the filter
panel already uses. No SQL, no new FilterState fields, no map-layer changes.

**In scope:** the click affordance + event wiring in `bee-occurrence-detail`,
across all of its render paths.
**Out of scope:** the table/drawer view (deferred — see below), any new filter
dimension, and any change to how the taxon filter resolves rows.
</domain>

<decisions>
## Implementation Decisions

### Affordance — name filters, icon links out
- **D-01:** Repurpose the **taxon name itself as the filter trigger**. Clicking
  the taxon name in the occurrence list applies the taxon filter (does not open
  the external record).
- **D-02:** The external record link (currently wrapping the taxon name — Ecdysis
  for specimens, iNat for observations) is **demoted to a small icon link**,
  following the existing icon-link pattern in this component (e.g. the `📷`
  specimen-photo link at `bee-occurrence-detail.ts:219`). Every external
  destination the name currently links to must remain reachable via an icon.
- **D-03:** This repurpose applies across **all** render paths in
  `bee-occurrence-detail`: `_renderCollectorGroup` (specimen → Ecdysis),
  `_renderInatObs`, `_renderProvisional`, `_renderChecklist`, `_renderSampleOnly`.
  Each currently wraps the taxon name in an `<a>` to an external page; each needs
  the name→filter / external→icon treatment.
- **D-04:** **"No determination" rows have no taxon** → no filter affordance and
  no taxon-name link. Render them as today (plain "No determination" text). The
  icon link to the external record, where one exists, still applies.

### Rank — filter at the exact taxon clicked
- **D-05:** Filter at the **precise `taxon_id`** of the clicked taxon, including
  below-species (subspecies / infraspecific) identifications. No roll-up to
  species. Genus/family/etc. naturally filter at their own rank via the existing
  hierarchical match (`o.taxon_id = N OR descendants via lineage_path`,
  `filter.ts:260-266`), so a higher-rank click still includes descendants — only
  the *clicked* rank changes, not the resolution logic.
- **D-06:** `taxonDisplayName` (the chip/CSV label) comes from the row's taxon
  display name (`row.display_name` / `taxonCache` entry). The filter key is
  `taxon_id`; the label is display-only (per `filter.ts:14-15`).

### Combine — set taxon, keep the rest (intersect)
- **D-07:** Clicking a taxon **replaces only the taxon dimension** of
  `FilterState` (`taxonId` + `taxonDisplayName`) and **preserves all other
  dimensions** (collector, year, county/ecoregion/place, sources, bounds).
  FilterState already holds these independently, so the emitted
  `FilterChangedEvent` carries the new taxon plus the current values of the
  other dimensions.

### Selection interaction (derived — confirm in planning)
- **D-08:** A taxon-filter click sets `FilterState` **only** and leaves any
  active point-selection untouched. Filter and selection are independent per the
  bounds-vs-selection separation invariant (Phase 156 / 999.8). The planner
  should confirm there is no implicit selection-clear coupled to filter changes;
  if one exists, it must not be triggered by this new entry point beyond whatever
  the filter panel already does.

### Claude's Discretion
- Exact glyph/markup for the demoted external icon link, hover/focus styling of
  the now-clickable taxon name, and where the icon sits relative to the name —
  provided the taxon name reads as actionable and the external destination stays
  reachable. Reuse existing component styles; **do not introduce a brand-new UI
  pattern** without surfacing it (per prior feedback). The `📷` and `View on
  iNaturalist` patterns already in this file are the reference.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Filter mechanism (the entry point feeds into this)
- `src/filter.ts` §`FilterState` (lines 13-15) — `taxonId` is the filter key,
  `taxonDisplayName` is the display-only label.
- `src/filter.ts` lines 257-266 — hierarchical taxon WHERE clause (taxon +
  descendants via `lineage_path`); confirms exact-taxon clicks at any rank work
  unchanged.

### Render target
- `src/bee-occurrence-detail.ts` — the occurrence list component; all five render
  paths (lines ~204-330) wrap the taxon name in an external `<a>` today. This is
  the file the phase modifies.
- `src/bee-pane.ts` `_renderWhat` / `_selectTaxon` / `_emitFilter` (around lines
  920-620) — the existing filter-emit path the new click must mirror (emits
  `FilterChangedEvent` upward; pane never mutates state).

### Architecture invariants
- `CLAUDE.md` → "Architecture Invariants" — `<bee-atlas>` owns reactive state;
  `<bee-pane>` / `<bee-occurrence-detail>` are pure presenters that emit events
  upward (`composed: true`).
- `.planning/memory/project_bounds_are_filter_not_selection.md` (and Phase
  156/999.8 artifacts) — filter vs selection separation, relevant to D-08.

No new external specs/ADRs introduced by this phase.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FilterChangedEvent` + the pane's existing emit path: the new click reuses this
  verbatim — build the next `FilterState` (current state with `taxonId` /
  `taxonDisplayName` swapped) and dispatch upward. No new event type.
- `TaxonCacheEntry` (`src/taxa.ts:27`, `{ rank, name, lineagePath }`) and each
  row's `taxon_id` / `display_name` give both the filter key and the label at the
  click site — no extra lookup needed.
- Existing icon-link markup in `bee-occurrence-detail` (`📷`, `View on
  iNaturalist`) is the template for the demoted external link.

### Established Patterns
- Hierarchical taxon filter (descendants via `lineage_path`) — means the phase
  does NOT special-case genus/family clicks; it only chooses the clicked
  `taxon_id` and the existing clause does the rest.
- Pure-presenter rule — `bee-occurrence-detail` must emit upward; it does not call
  into the filter or touch `<bee-atlas>` state directly. The event likely bubbles
  through `bee-pane` to `bee-atlas`.

### Integration Points
- `bee-occurrence-detail` → `bee-pane` → `bee-atlas`: confirm the event composes
  through the pane (occurrence-detail is nested inside the pane's list content,
  `bee-pane.ts:~1241`). Planner should verify the bubbling/`composed` chain.

### Constraints / gotchas
- The taxon name is **currently a hyperlink** — the core implementation work is
  untangling name-as-external-link into name-as-filter + icon-as-external-link
  across five render branches. This is the bulk of the phase, not the filter wiring.
</code_context>

<specifics>
## Specific Ideas

- Model the demoted external link on the existing `📷` / "View on iNaturalist"
  icon affordances already in `bee-occurrence-detail` — don't invent a new chip.
- Below-species filtering is intentional (D-05): clicking a subspecies filters to
  that subspecies exactly, not its parent species.
</specifics>

<deferred>
## Deferred Ideas

- **Click-to-filter in the table / drawer view** — out of scope this phase
  (D, "Sidebar list only"). The table already uses row-click to *select* a
  record (`bee-table.ts:352`), so a Species-cell filter click needs its own
  row-select-vs-cell-filter interaction design. Revisit as a follow-up once the
  sidebar affordance is validated.
- **Roll-up-to-species option** — rejected for now (D-05 chose exact taxon). If
  below-species filters prove too narrow in practice, a future phase could add a
  species roll-up toggle.

### Reviewed Todos (not folded)
None — `144-code-review-deferred.md` (the one pending todo) is unrelated to this
phase's scope.
</deferred>

---

*Phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar*
*Context gathered: 2026-06-22*
