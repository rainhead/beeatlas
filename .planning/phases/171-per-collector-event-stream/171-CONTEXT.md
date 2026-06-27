# Phase 171: Per-Collector Event Stream - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a **reverse-chronological event feed** to the existing static collector page
(`/collectors/{inat_login}/`, shipped Phase 169). The feed is a flat stream of
two event kinds — **Collected** and **Identified** — pre-computed in the data
pipeline and rendered statically (the collector page is JS-free; Phase 172
criterion 5 forbids browser queries). High-volume collectors are bounded via
**Eleventy-generated paginated sub-pages**.

**Frontend + data-export work only.** Reads the existing mart (`occurrences.parquet`)
**plus a new join to the Ecdysis `identifications` table** for per-determination
timing. **No dbt contract change** — this phase is downstream of the mart.

### Scope reframe (operator decisions — supersede ROADMAP/REQUIREMENTS wording)
Downstream agents follow these decisions over the literal success criteria where
they conflict:

- ROADMAP criterion 1 lists events "collection, **posting**, identification."
  **Posting was dropped in Phase 168 (D-02) and stays dropped.** The feed is
  **Collected + Identified only.**
- STREAM-02 / criterion 2 want a "catalogued in Ecdysis" event. Per 168 D-03
  there is **no trustworthy cataloguing date**, so cataloguing is **not a feed
  event** — it is a provenance change on one continuous row (D-EVENT-01). STREAM-02
  is satisfied **structurally**, not by a literal event.

</domain>

<decisions>
## Implementation Decisions

### Event model (which events exist)
- **D-EVENT-01:** The feed has exactly **two event kinds: Collected and
  Identified.** There is **no separate "cataloguing" event.** The
  `waba_specimen → ecdysis` transition is a provenance/status change on a single
  continuous occurrence row (already guaranteed by the ARM-3 de-dup, 168 D-10) —
  it never reads as delete+create, which satisfies STREAM-02 without inventing a
  fake cataloguing timestamp (honors 168 D-03).
- **D-EVENT-02:** A not-yet-catalogued `waba_specimen` (iNat photo bee, no Ecdysis
  record) reads as **"Collected, awaiting ID"** — criterion 4. Its tentative iNat
  community species (`canonical_name`) may show as **context on the Collected
  event**, but produces **no Identified event**. **Hold the 168 D-08 line: do NOT
  extend the iNat pull** to fetch iNat per-identification `created_at`. (The
  operator confirmed: iNat ID dates exist in the source but stay unpulled this
  phase.)

### Identified-event timestamp & history (the key data decision)
- **D-IDSRC:** The **"Identified" event is timestamped by
  `ecdysis_data.identifications.modified`** — a precise `TIMESTAMP WITH TIME ZONE`
  read as **"when the identification was made available"** (operator's framing).
  This is the sortable, precise signal; the dirty year-only `date_identified` /
  Phase-168 `id_date` is **not** the sort key.
  - **Deliberate, documented reversal of 168 D-03's "don't trust `modified`":**
    168 rejected `modified` as a *determination date* (it bumps on edits). Here it
    is used as an **availability timestamp**, which is exactly what a "when did
    this show up" feed wants. Precedent: `data/feeds.py` already uses `i.modified`
    this way for its Atom determination feeds. **Record this reversal explicitly
    so it is not flagged as drift against 168.**
  - The determiner's **stated** date (`date_identified` / `id_date`, year-only)
    may still **display** as semantic context ("identified 2025") alongside the
    `modified`-derived position — but `modified` drives ordering.
- **D-FEED-02:** **Retain the full re-determination history.** A specimen is
  re-determined often (live data: of identified specimens, ~19.4k have 1 ID,
  ~14.9k have 2, ~11.7k have 3, ~200 have 4–5; `is_current='1'` 45,558 /
  `'0'` 39,350). **Every** determination — current *and* superseded — is its own
  Identified event at its own `modified` time, so a specimen reads as a real
  learning arc (e.g. *Lasioglossum* sp. → *L. albohirtum*). Do **not** collapse to
  the current determination only.

### Feed structure & ordering
- **D-FEED-01:** **One entry per event** (a flat stream), not one card per
  specimen. A collected-then-identified specimen yields **two** entries (and more
  with re-IDs per D-FEED-02).
- **D-SORT:** **Reverse-chronological by best-available timestamp per event** —
  Identified by `identifications.modified` (precise), Collected by its coarse
  `event_date` (the mart `date`, often year/partial). A specimen's Collected event
  naturally falls below its Identified events. Mixed granularity is acceptable and
  honest; the exact within-year tiebreak is **planner discretion**.

### Bounding for high-volume collectors (STREAM-03)
- **D-PAGE-01:** Bound via **Eleventy-generated paginated sub-pages** per
  collector (`/collectors/{login}/`, `/collectors/{login}/page/2/`, …) — fully
  static, **zero new JS** on the collector page, bounded DOM per page, full history
  browsable. This is a **2-D pagination** layered on 169's existing per-collector
  pagination (169 paginates `collectorsArray` size 1). The **per-page chunk size**
  (≈50 events suggested) and the exact Eleventy mechanism (flattened
  `(collector, page-chunk)` descriptors vs. nested pagination) are **planner's
  call.** Note: full re-ID history (D-FEED-02) inflates event count well past
  occurrence count (~100 specimens × ~2.5 IDs ≈ 350 events), so the bound matters.

### Event card content (data the export must produce)
Layout/styling is deferred to a `/gsd-ui-phase` (this phase is `UI hint: yes`).
The export must carry, per event: the date/timestamp, the species name, and the
Collected/Identified label, **plus**:
- **D-CARD-01:** On Identified events, the **determiner name**
  (`identifications.identified_by`; blank → render "identified" without a name).
  Tells the self-ID-vs-expert story (169 D-06) and serves the milestone's
  "togetherness" value.
- **D-CARD-02 (UPDATED 2026-06-27 — post-UAT enhancement):** The species name links
  to its BeeAtlas taxon page for bee determinations; non-bee named determinations link
  to iNaturalist taxon search; undetermined remains plain text. Three mutually exclusive
  cases:
  - **Bee → BeeAtlas:** `species_slug` set, `inat_url` null. Rank-aware slug resolver
    (steps 1–4 in `collectors_events_export.py`). Improvements over original:
    (a) Subgenus parenthetical `Genus (Subgenus)` (e.g. `Lasioglossum (Dialictus)`) →
    explicit Step 2b strips parenthetical, links to genus page `/species/{Genus}/`.
    (b) First-token genus fallback (Step 3): when `identifications.genus` is empty,
    first token of `scientific_name` is tried against genus_map, recovering
    `Hylaeus polifolii`, `Lasioglossum foxii`, etc. → `/species/{Genus}/`.
    (c) `genus_map` now built from `public/data/species.json` + `public/data/higher_taxa.json`
    (same files the frontend uses), covering all 47 known bee genera.
  - **Non-bee named → iNat:** `inat_url` set (`https://www.inaturalist.org/taxa/{urlencoded_name}`
    — the `/taxa/{name}` redirect lands on the canonical taxon page; the `/taxa/search?q=` results UI was poor),
    `species_slug` null. Applies to bycatch: Diptera, Eumeninae, Chrysididae, Philanthus,
    Hymenoptera, Lepidoptera, wasps/flies/bugs (~2,235 rows / ~111 unique names).
    Network-free: URL is constructed at export time with no iNat API call.
  - **Undetermined/blank → plain text:** both null.
- **D-CARD-03 (REVISED 2026-06-27 operator UAT):** Original decision excluded
  direct specimen links. **Operator UAT reversed this for Ecdysis-catalogued
  specimens**: each event now emits `catalog_number` + `ecdysis_id` so the
  template can render the catalog number linked to the Ecdysis occurrence page
  (`https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id}`).
  Un-catalogued `waba_specimen` rows (no `ecdysis_id`) render an empty catalog
  cell — no link, no text. iNat observation links remain out of scope.
  **Place / floral-host context on events remains excluded.**

### Empty-state edge case (record, not a question)
- **D-EMPTY:** The **16 sample-host-only collectors** (gated in by 169 D-01 but
  with no catalogued specimens) have **no feed events** — per 168, samples are not
  in any feed. Render an empty-state ("no specimen events yet") or omit the feed
  section for them. Planner's call on copy.

### Identified/Re-identified label semantics (RESOLVED 2026-06-27 operator UAT)

Original planner's-discretion: "Identified" vs "Re-identified" labeling was based
on `identification_is_current` ('1' = Identified, '0' = Re-identified). **Operator
UAT found this backwards** and the rule was corrected:

- **Label is chronological:** Within each specimen, the determination with the
  earliest `modified` timestamp = **"Identified"** (the original act of naming it);
  every subsequent determination = **"Re-identified"** (the later act of renaming).
- **Color / emphasis is is_current:** `event-type--identified` (green accent) when
  `is_current=True`; `event-type--reidentified` (muted) when `is_current=False`.
  These two dimensions are orthogonal — a currently-accepted determination can
  correctly show the "Re-identified" label if it was not the specimen's first ID.
- **Export field:** `is_reidentification` (boolean, Identified events only; `None`
  for Collected events). Computed in Python two-pass over the query result set.

### Claude's / planner's discretion
- Per-page chunk size and the Eleventy pagination mechanism (D-PAGE-01).
- Within-year sort tiebreak for mixed-granularity events (D-SORT).
- Where the per-collector event data lives: embedded in `collectors.json` vs. a
  separate `collectors_events.json` / per-collector files (build-time read only —
  not shipped to the browser, so weight is a build concern). Planner's call;
  flagged for research below.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & decisions
- `.planning/ROADMAP.md` §"Phase 171" (≈lines 1718–1730) — goal + 4 success
  criteria. **Note:** criterion 1's "posting" event is superseded (168 D-02);
  criterion 2's literal "catalogued in Ecdysis event" is satisfied *structurally*
  (D-EVENT-01), not as a dated event.
- `.planning/REQUIREMENTS.md` — STREAM-01 (line 36), STREAM-02 (37), STREAM-03 (38).
- `.planning/phases/168-temporal-lifecycle-dates/168-CONTEXT.md` — **read first.**
  Defines `id_date` (formal Ecdysis determination, year-only), D-02 (posting
  dropped), D-03 (`modified` rejected as a *determination date* — D-IDSRC reverses
  this for *availability*), D-08 (no iNat ID-date pull — D-EVENT-02 holds it),
  D-10 (waba_specimen→ecdysis is one continuous row).
- `.planning/phases/169-per-collector-static-pages/169-CONTEXT.md` — the collector
  page this feed attaches to: the static export→`_data`→`_pages` pattern, the D-01
  page gate (124 collectors; 16 sample-host-only → D-EMPTY here), D-06/D-07
  (species-rank "identified" definition; `id_date` is *not* the status predicate).

### Data sources (edit / read sites)
- `data/collectors_export.py` — the existing per-collector export (gate D-01,
  stats). The new feed-event data attaches here (or a sibling export step). Reads
  `ASSETS_DIR/occurrences.parquet` + `species.parquet` (Pitfall 5 — NOT the dbt
  sandbox).
- `data/feeds.py` — **direct precedent.** Already joins
  `ecdysis_data.identifications i` to `ecdysis_data.occurrences o` on
  `i.coreid = CAST(o.id AS VARCHAR)`, treats `i.modified` as the determination
  timestamp, and surfaces `identified_by` + `scientific_name`. Mirror its join.
  Per-collector Atom feeds already exist here — consider whether the static feed
  links out to them for full history (Claude's discretion).
- `data/dbt/models/staging/stg_ecdysis__identifications.sql` — **currently a
  narrow projection** (`coreid`, `modified` only). The raw
  `ecdysis_data.identifications` table also has `identified_by`, `date_identified`,
  `scientific_name`, `taxon_rank`, `specific_epithet`, `identification_is_current`,
  `record_id`. The feed needs more than the staging view projects — read the raw
  source (as `feeds.py` does) or widen staging.
- `data/run.py` — STEPS list; register the feed-event export step (after dbt-build
  + species-export, like `collectors_export`).

### Frontend (the page + pattern)
- `_pages/collector-detail.njk` — the page to extend; currently `pagination:
  {data: collectors.collectorsArray, size: 1}`. The event feed + its sub-page
  pagination layers onto this.
- `_pages/place-detail.njk`, `_data/places.js`, `_data/collectors.js` — the
  static export→loader→template pattern to follow.
- `src/lib/quantify.js` — count-noun Eleventy filter, already used in these pages.
- `src/styles/places.css` — reused by `collector-detail.njk` today.

### Domain vocabulary
- `CLAUDE.md` §"Domain Vocabulary" — Specimen vs Sample vs Observation; the five
  `int_combined` source arms (the feed = volunteers' specimens: `ecdysis` +
  `waba_specimen`).
- `docs/domain-model.md` — full occurrence data model.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`data/feeds.py`** is a near-template for the Ecdysis identifications join
  (`i.coreid → o.id`, `i.modified`, `i.identified_by`, `i.scientific_name`). The
  new feed-event export reuses this exact join shape, adding the collector gate +
  full-history (no 90-day window, no blank-exclusion unless desired) + current/
  superseded handling.
- **`collectors_export.py`** is the per-collector export template (DuckDB over
  `ASSETS_DIR` parquet, gate D-01, JSON out, `run.py` STEPS entry).
- **Eleventy pagination** is already used by `collector-detail.njk` (one page per
  collector) — the 2-D extension builds on a known, shipped mechanism.

### Established Patterns
- Static page generation = **export step → `_data` loader → `_pages` template**;
  the loader reads only exported JSON (never columnar files). Phase 172 reinforces:
  **no wa-sqlite / GROUP BY in the browser** — all feed aggregation is pipeline-side.
- The collector page is **JS-free**; D-PAGE-01 (Eleventy sub-pages) preserves that.

### Integration Points
- New/extended committed export artifact under `public/data/` (e.g. event data in
  `collectors.json` or a sibling file), produced by a new `run.py` STEPS entry.
- New join to `ecdysis_data.identifications` — the first time the *static export*
  path reads the identifications table (the dbt mart does not carry per-
  determination rows; `feeds.py` reads it directly from the duckdb).
- **No dbt contract change**, no `OccurrenceRow`/SPA type change.

### Live data shape (data/beeatlas.duckdb, 2026-06-27)
- `ecdysis_data.identifications`: per-determination grain. `identification_is_current`
  = '1' (45,558) / '0' (39,350). Re-determination is the norm (multiplicity table
  in D-FEED-02). `modified` is precise; `date_identified` is the dirty year-only
  dwc field (matches 168's `id_date`).
- Confirmed `modified` ≫ `date_identified` granularity: e.g. `date_identified='2024'`
  with `modified=2026-06-02` — the ID was *stated* as 2024 but *made available* in
  June 2026 (validates D-IDSRC's "availability" semantics).

</code_context>

<specifics>
## Specific Ideas

- The feed's anchor value is the milestone's "tighten learning cycles" + show
  "togetherness": **Collected → Identified (by whom)** is "I caught something →
  here's what it turned out to be, and who told me." Retaining re-IDs (D-FEED-02)
  and the determiner name (D-CARD-01) are what make that arc legible.
- `modified`-as-availability is the operator's explicit call and has a working
  precedent in `data/feeds.py` — not a novel interpretation.
- Re-run the identifications multiplicity / per-collector max-events query against
  the **dbt-build** `occurrences.parquet` (in `EXPORT_DIR`) + the live duckdb at
  plan time to size the page chunk and confirm JSON weight.

</specifics>

<deferred>
## Deferred Ideas

- **iNat per-identification dates** for not-yet-catalogued `waba_specimen` — a
  real source field, deliberately unpulled (D-EVENT-02 / 168 D-08). A future phase
  could pull iNat `identification.created_at` to give pre-catalogue specimens a
  dated Identified event.
- **Sample collection events in the feed** — out of scope (168: "samples aren't in
  any feed"); the 16 sample-host-only collectors get an empty feed (D-EMPTY).
- **Direct specimen links (Ecdysis/iNat) and place/floral-host context on events**
  — excluded this phase (D-CARD-03); easy to add later.
- **Cataloguing as a dated milestone** — no trustworthy source date (168 D-03);
  represented only as provenance (D-EVENT-01).
- **Accomplishment view** (county-coverage SVG map, taxonomic/ecoregion breadth,
  active-seasons badge) — Phase 172.

None of these are in scope for Phase 171.

</deferred>

---

*Phase: 171-per-collector-event-stream*
*Context gathered: 2026-06-27*
