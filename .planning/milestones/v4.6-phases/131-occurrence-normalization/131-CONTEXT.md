# Phase 131: Occurrence Normalization - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Drop the denormalized rank-string columns from the `occurrences` mart +
`occurrences.db`, rewrite `geo_blob`, rewrite the dbt column contract, and
audit + migrate **every** remaining reader of the dropped columns — now safe
because Phase 130 moved map filtering onto `taxon_id` + hierarchy descendant
queries. Record a measurable DB-size / transfer-weight reduction. Covers
NORM-01, NORM-02, NORM-03.

**Actual mart drops (4 columns, contract 37 → 33):**
`scientificName`, `genus`, `family`, `specimen_inat_taxon_name`.
**Retained:** `canonical_name` (taxon_id resolution gate + the `taxon_id`
`not_null` test's `where` clause depend on it) and `taxon_id`.

**Note on roadmap criterion #1 wording:** it lists `specimen_inat_genus` and
`specimen_inat_family` as mart drops, but those columns **never reach the mart**
— they exist only in the intermediate model `int_specimen_obs_base.sql:12-13`
(aliased from `tl.genus`/`tl.family`) and feed nothing downstream. They are dead
intermediate columns to delete as part of cleanup, not mart-contract drops.

**In scope:**
- Drop the 4 mart columns from `data/dbt/models/marts/occurrences.sql` (SELECT
  at L83-101) and `data/dbt/models/marts/schema.yml` (contract L23-58); delete
  the dead `specimen_inat_genus`/`specimen_inat_family` from
  `int_specimen_obs_base.sql`.
- Rewrite `geo_blob` (`data/sqlite_export.py` `_GEO_COLS`, L457-460) to the
  7-field layout (see D-04).
- Audit + migrate every frontend/test reader of the dropped columns (see
  `<code_context>` for the full consumer list — it extends beyond the roadmap's
  named list).
- Record before/after DB size + transfer weight + `tablesReady` in
  VERIFICATION.md.

**Out of scope (later phases / other artifacts):**
- `checklist.parquet` and the `bee-map.ts` checklist filter — a **separate
  artifact**, not the occurrences mart. Unaffected by the mart drop; keeps its
  `scientificName`/`genus`/`family` columns. The audit conclusion there is "no
  change needed," NOT "migrate." (See deferred re: its lingering name+rank-string
  filter.)
- The `species` mart and static page generation — keep their rank-name strings
  (NORM-03 explicitly excludes them).
- Page rebuilds / subfamily pages (Phase 132); `/species` browse tree (Phase 133).

</domain>

<decisions>
## Implementation Decisions

### Summary counts (species / genus / family) — Area 1
- **D-01 — Drop the dead species/genus/family counts entirely.** These three
  fields are computed (`bee-atlas.ts:351-359`, `SELECT COUNT(DISTINCT
  scientificName/genus/family) … WHERE ecdysis_id IS NOT NULL`) and stored on
  `DataSummary` / `_summary`, but **no component renders them** — verified by
  grep across non-test `src/`. Remove `speciesCount`/`genusCount`/`familyCount`
  from the `DataSummary` interface (`filter.ts:362-366`) and strip them from the
  `_loadSummaryFromSQLite` query, which then needs only `total_specimens` +
  `MIN/MAX(year)` (no dropped columns).
  - **Context:** the user's first instinct was to *align* the counts to the
    Phase-130 multi-source autocomplete rule (D-01) and to count bee-only. That
    was made under the assumption the numbers were displayed. Once shown they are
    never rendered, the decision flipped to deletion. Do not resurrect or "fix"
    these counts in this phase.
- **D-02 — `totalSpecimens` is unaffected.** It is the only summary field that
  renders ("N specimens" on the filter overlay button, `bee-pane.ts:1227,1241`),
  computed as `COUNT(*) WHERE ecdysis_id IS NOT NULL` — no dropped column. Leave
  it intact.

### geo_blob rewrite + the size win — Area 2
- **D-03 — `geo_blob` carries no taxon identity at all** (not the dropped
  strings, not a `taxon_id` swap). Verified: the in-memory `_fullGeoJSON`
  features are matched **only by `occId`** during filter/selection
  (`bee-map.ts:588,627`); filtering re-queries the DB
  (`queryVisibleGeoJSON` → `FROM occurrences WHERE … taxon_id descendant clause`),
  never the in-memory points. Feature properties are only
  `{ occId, recencyTier, source }`.
- **D-04 — New `geo_blob` layout (7 fields):**
  `[lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]`.
  Removing the 3 per-point strings × ~90k rows is the **headline transfer-weight
  / DB-size reduction**. `features.ts` `_buildGeoJSONFromRaw` decode (L28-39) is
  re-indexed to match; the layout comments at `features.ts:14-15` and
  `sqlite_export.py:455-456` are updated.

### Size / perf enforcement — Area 3
- **D-05 — Record-only, no new guards.** Capture a pre-change baseline, then
  record before/after DB byte size, gzipped transfer weight, and in-browser
  `tablesReady` (must not regress from the v4.3 ~250 ms baseline) in
  VERIFICATION.md as a one-time measurement. **No** new automated gate:
  - A `tablesReady` perf gate is impractical — it is a **browser** console
    benchmark (`features.ts`/`sqlite.ts`), and the nightly pipeline is Python/dbt
    with no browser.
  - A permanent **absolute** DB-size ceiling would fight legitimate data growth
    (every nightly adds occurrences) and cause false failures.
  - Column enforcement is already covered by the **dbt contract** (`enforced:
    true` on the `occurrences` mart) — a dropped column cannot silently reappear.
  - Decision deliberately declined a one-line geo_blob-arity assertion too —
    lean entirely on the dbt contract.

### Claude's Discretion (delegated "cleanup scope" area + resolved within Phase-130 guardrails)
- **D-06 — Full cleanup of dead string-column paths.** Delete, don't migrate:
  - the unfiltered `species/genus/family` counts (D-01);
  - `features.ts`'s geo_blob-derived `summary` build **and** the legacy
    `taxaOptions` build (L62-78) — superseded: the autocomplete's `_taxaOptions`
    comes from the hierarchy via `buildTaxonOptions(presentIds, _taxonCache)`
    (`bee-atlas.ts:403`), explicitly **not** the geo_blob `data-loaded` event
    (`bee-atlas.ts:1017` comment);
  - **`queryFilteredCounts` + `FilteredCounts`** (`filter.ts:300-329`) — verified
    **zero consumers**; another dead path reading the dropped columns.
  - Endpoint: `features.ts` returns just `{ geojson }`; `bee-map`'s `data-loaded`
    event drops its `summary`/`taxaOptions` payload (`bee-map.ts:467`);
    `bee-atlas._onDataLoaded` (L1015-1019) stops setting `_summary` from the event
    (it already comes authoritatively from `_loadSummaryFromSQLite`).
- **D-07 — Live display consumers get migrated to taxon_id-resolved names**
  (these are NOT in the roadmap's named audit list but ARE downstream consumers
  per NORM-03):
  - **`bee-table.ts:43`** — the table's **Species** column reads
    `dataField: 'scientificName'` directly; needs a name source after the drop.
  - **`bee-occurrence-detail.ts:236-237`** — `_renderProvisional` shows
    `row.specimen_inat_taxon_name`; resolve from the provisional row's `taxon_id`
    (the iNat community taxon) instead.
  - **OPEN RESEARCH QUESTION (planner/researcher resolves; not a user decision):**
    resolve these display names via a **SQL JOIN to the `taxa` table** inside
    `queryTablePage`/`queryListPage` (in-DB, no cache-timing dependency, adds a
    JOIN per page query) **vs.** the **lazy `taxonCache` lookup** (consistent with
    Phase 130 D-07/D-08, but the table/list must not render names before the lazy
    cache is loaded). Both honor Phase 130 D-07 (names key on `taxon_id`,
    `taxon_id IS NULL` → "No Determination", never blank). Recommend in RESEARCH.md.
- **D-08 — Mechanical drops** of the 4 columns from `OccurrenceRow`
  (`filter.ts:50,53,54,67`) and `OCCURRENCE_COLUMNS` (`filter.ts:81,82,85`) so
  `SELECT`s stop referencing removed columns; update `filter.test.ts` and
  `build-geojson.test.ts` assertions to the new geo_blob layout + slimmer row
  shape.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — NORM-01, NORM-02, NORM-03 (the three this phase
  closes). Note NORM-03 explicitly keeps the `species` mart + page gen on
  rank-name strings.
- `.planning/ROADMAP.md` §"Phase 131: Occurrence Normalization" — goal + 3 success
  criteria. **Caveat:** criterion #1's column list names `specimen_inat_genus` /
  `specimen_inat_family` (intermediate-only, never in the mart) and the audit list
  in criterion #3 is incomplete (misses `bee-table.ts` Species column and
  `bee-occurrence-detail.ts` provisional name) — see `<code_context>`.
- `.planning/PROJECT.md` — v4.6 milestone scope. **Caveat:** its loose phrasing
  "drop … `canonical_name` …" is **overridden** by NORM-01 + roadmap criterion #1:
  `canonical_name` is **retained**.

### Phase 130 (what this phase finishes de-risking)
- `.planning/phases/130-map-filter-cutover/130-CONTEXT.md` — D-07 (detail cards
  resolve names from the taxon cache by `taxon_id`; the string column "treated as
  already-gone to de-risk Phase 131"); D-08 (lazy taxon-cache load, NOT on the
  `tablesReady` boot path). These guardrails bound D-07's name-resolution choice.

### Phase 129 foundation (consumed here)
- `data/sqlite_export.py` §`_build_taxon_hierarchy` (≈L43-76) — the `taxa` table
  shipped inside `occurrences.db` (available for an in-DB JOIN at boot, since the
  `taxa` table is in the same file as `occurrences`); `geo_blob` build at
  L453-470 (the file to rewrite).

### dbt contract + mart
- `data/dbt/models/marts/occurrences.sql` — final SELECT (L83-101) to trim.
- `data/dbt/models/marts/schema.yml` — `occurrences` contract (L4-93); drop the 4
  column entries; the `taxon_id` `not_null` test `where` clause (L93) references
  `canonical_name` (retained) — leave intact.
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — dead
  `specimen_inat_genus`/`specimen_inat_family` (L12-13) to delete.
- `CLAUDE.md` "Known State" — the dbt column contract is enforced at every
  `bash data/dbt/run.sh build`; this is the sole schema gate (no JS validator).

### Codebase maps
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/ARCHITECTURE.md` — module
  layout + the `<bee-atlas>` state-ownership / pure-presenter invariants
  (`bee-map`/`bee-pane` receive state, emit events; relevant to the `data-loaded`
  event-payload trim in D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Full dropped-column consumer audit (non-test `src/`) — hand-off to planner
**Dead (delete):**
- `bee-atlas.ts:351-359` — unfiltered species/genus/family count query (D-01).
- `filter.ts:300-329` — `queryFilteredCounts` + `FilteredCounts`, **zero
  consumers** (D-06).
- `features.ts:22-78` — `species`/`genera`/`families` Sets, the `summary` build,
  the legacy `taxaOptions` build (D-06); geo_blob decode re-indexed (D-04).

**Live (migrate to `taxon_id`-resolved names — D-07):**
- `bee-table.ts:43` — Species column `dataField: 'scientificName'`.
- `bee-occurrence-detail.ts:236-237` — `_renderProvisional` →
  `row.specimen_inat_taxon_name`.

**Mechanical (drop column refs — D-08):**
- `filter.ts:50,53,54,67` — `OccurrenceRow` fields.
- `filter.ts:81,82,85` — `OCCURRENCE_COLUMNS` SELECT list.
- Tests: `filter.test.ts`, `build-geojson.test.ts` (geo_blob layout assertions).

**Audited, unaffected (document, do NOT touch):**
- `bee-map.ts:68,733-743` — checklist arm reads `checklist.parquet` columns, a
  separate artifact. Not the mart. No change.
- `bee-table.ts` other columns, `lib/spa-link.ts`, `taxa.ts`, `url-state.ts`
  comments — `genus`/`family` appear as rank *labels/types/params*, not mart
  column reads.

### Reusable Assets / Patterns
- **dbt contract (`enforced: true`)** is the standing guard that the dropped
  columns cannot reappear — no new validator needed (D-05).
- **`taxa` table lives in `occurrences.db`** alongside `occurrences` — enables an
  in-DB JOIN option for D-07 name resolution without the lazy cache.
- **`_GEO_COLS` + `select_expr` NULL-fallback** (`sqlite_export.py:461-468`)
  already tolerates absent columns gracefully — but the dropped names must be
  removed from `_GEO_COLS` itself, not left to NULL-fallback (D-04).

### Integration Points
- `features.ts` → `bee-map` `data-loaded` event → `bee-atlas._onDataLoaded`:
  the event payload shrinks to a bare signal once the geo_blob summary/taxaOptions
  are deleted (D-06). Respect the state-ownership invariant (CLAUDE.md): `_summary`
  stays owned by `<bee-atlas>` via `_loadSummaryFromSQLite`.

</code_context>

<specifics>
## Specific Ideas

- The headline "measurable size win" (NORM-02) comes specifically from slimming
  `geo_blob` (the largest per-point payload) by 3 strings × ~90k rows — not from
  the parquet/table columns. Frame the VERIFICATION.md measurement around the
  `occurrences.db` byte size + gzipped transfer weight before/after.
- The user reasons from *what actually renders*: an invisible computed value is
  dead code to delete, not behavior to preserve (drove D-01). Apply the same lens
  if more "computed-but-unrendered" values surface during planning.

</specifics>

<deferred>
## Deferred Ideas

- **Migrate the checklist filter off name+rank strings to `taxon_id`** —
  `bee-map.ts` checklist (`checklistTaxon`/`checklistTaxonRank`, reading
  `checklist.parquet` `scientificName`/`genus`/`family`) is still on the
  pre-Phase-130 name-based filter. Out of NORM scope (separate artifact). Candidate
  for a future consistency pass.
- **Drop unused intermediate columns more broadly** — if the
  `specimen_inat_genus`/`specimen_inat_family` cleanup reveals other dead
  intermediate-model columns, note them; only the two confirmed-dead ones are in
  this phase's scope.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 131-Occurrence Normalization*
*Context gathered: 2026-06-02*
</content>
</invoke>
