# Pitfalls Research

**Domain:** v6.0 "My Work — Progress & Provenance" — source-enum migration, temporal event history on a snapshot pipeline, per-collector static pages, accomplishments, collector identity on a public static site
**Researched:** 2026-06-24
**Confidence:** HIGH for the positional-coupling and contract migration risks (directly observed in the codebase); HIGH for the occ_id-transition-breaks-history risk (the waba_specimen→ecdysis lifecycle is documented and the transition behavior is explicit in domain-model.md); MEDIUM for the collector-identity and gamification pitfalls (inferred from domain knowledge and the existing data model, no analogous prior phase to observe directly)

---

## Critical Pitfalls

### Pitfall 1: Breaking the Three-File Positional Coupling During the `source` Rebuild

**What goes wrong:**
The `occ_id` construction logic is duplicated across three files and must stay byte-identical in priority order: `src/occurrence.ts` (`occIdFromRow`), `src/filter.ts` (`OCC_ID_SQL_CASE`), and `data/dbt/models/marts/occurrence_places.sql`. The `source` rebuild will touch at minimum `filter.ts` (to change `o.source IN (...)` to orthogonal facet clauses) and probably `occurrence.ts` (to add new predicates). A developer who refactors the `source` handling in `filter.ts` without reading the POSITIONALLY COUPLED comment can unconsciously break `OCC_ID_SQL_CASE` — for example, by adding a new column alias, changing the `o.` qualification, or adding a new occ_id prefix arm in a different priority order than `occurrence.ts`. The result is that place-filter hits stop working for the new/changed arm: `EXISTS (SELECT 1 FROM occurrence_places op WHERE op.occ_id = ${OCC_ID_SQL_CASE})` generates IDs that no longer match the bridge table rows.

The dbt contract on `occurrences` (36 columns as of v5.2) enforces column presence and type but does NOT enforce that `OCC_ID_SQL_CASE` in `filter.ts` matches the CASE in `occurrence_places.sql`. Type tests pass; place filters silently return zero results for one source category.

**Why it happens:**
The coupling comment is in the file but is easy to miss during a large refactor. The three sites are in different languages (TypeScript, inline SQL string, dbt SQL). There is no test that runs all three together end-to-end (the unit tests for `filter.ts` use in-memory SQLite with no `occurrence_places` table; the dbt tests run in the pipeline separately). The breakage is silent — it does not throw, it just returns wrong (empty) place-filter results for the broken arm.

**How to avoid:**
- Treat the three-file block as an atomic commit unit. The PR must include changes to all three or a comment explaining why only a subset changed.
- Add a Vitest test that asserts `OCC_ID_SQL_CASE` (the string constant in `filter.ts`) produces the same priority-ordered branch structure as `occIdFromRow` in `occurrence.ts`. This is achievable by parsing both into a canonical form (list of `[column, prefix]` pairs) and comparing.
- If the facets rebuild introduces new derivable facet columns to the dbt model, add them to `schema.yml` contract immediately (same commit) — do not land a partial model where the TypeScript expects a column that the dbt contract does not yet declare.

**Warning signs:**
- Place-filter chips resolve to zero occurrences for one source category but not others.
- The `occurrence_places` bridge has rows but `EXISTS` queries return false for that arm.
- A PR touches `filter.ts` but not `occurrence_places.sql` or `occurrence.ts` (check in code review).

**Phase to address:**
Phase 1 of v6.0 (source → facets rebuild). Must be the explicit verification criterion for that phase: run a place filter with each source arm represented and assert non-zero results.

---

### Pitfall 2: The dbt Contract + S3 Deadlock When Adding Facet Columns

**What goes wrong:**
The project's `occurrences_contract_release_sequence` memory documents a known deadlock pattern: the nightly `test_dbt_diff` integration test diffs the new-build parquet against the last-published S3 artifact. If you add a new column to `schema.yml` and ship the TypeScript that reads it in the same deploy, the nightly test will fail because S3 still has the old-schema artifact — the gate fires before the column is live in production data. Conversely, if you try to ship the new column to S3 first (data-before-code order), but the contract gate prevents `dbt build` from succeeding until `schema.yml` is updated, you are stuck.

The facets rebuild is exactly this shape: it is likely to add new columns to the `occurrences` mart (e.g., a `first_seen_at` timestamp, a `collection_status` enum, or facet-derived boolean flags). Each such addition requires the contract→data→code sequence and a one-time `SKIP_INTEGRATION_GATE=1` nightly run.

**Why it happens:**
The release sequence was documented precisely because it has bitten the project before. It is easy to forget under time pressure, especially when a phase touches both the dbt model and the TypeScript schema simultaneously (which the facets rebuild will).

**How to avoid:**
- Plan the schema change explicitly as its own step in the phase plan, using the established data-before-code order: (1) update `schema.yml` + add the column to the dbt model, (2) run nightly with `SKIP_INTEGRATION_GATE=1`, (3) then ship the TypeScript that reads the new column.
- If the facets rebuild can be staged — e.g., add the columns in one phase without changing the frontend, then cut the frontend over in the next — the release sequence is simpler: the new column lands in S3 before any frontend reads it.
- Do NOT add new `occurrences` columns in the middle of a phase that is also changing the TypeScript filter logic. Separate schema changes from logic changes into distinct commits.

**Warning signs:**
- `test_dbt_diff` fails after a phase that added columns to `schema.yml`.
- The nightly pipeline exits non-zero at the `test-dbt-diff` step before S3 publish.
- A code review finds a `OCCURRENCE_COLUMNS` addition in `filter.ts` that is not yet in `schema.yml`.

**Phase to address:**
Phase 1 (source → facets rebuild) and Phase 2 (temporal lifecycle columns). Both will likely add columns to the mart. The phase plan must include the release sequence as explicit steps.

---

### Pitfall 3: The `waba_specimen → ecdysis` Transition Breaks the Event Stream

**What goes wrong:**
A WABA bee specimen appears in the pipeline as `source='waba_specimen'`, `occ_id='inat_obs:N'` while it awaits cataloguing. When the Ecdysis record is uploaded and the nightly pipeline runs, the row transitions to `source='ecdysis'`, `occ_id='ecdysis:M'`. This is documented in `docs/domain-model.md` as "a change in both source and occ_id."

For the event stream, this transition looks exactly like: (a) `inat_obs:N` was deleted, (b) `ecdysis:M` was created — a delete+create event rather than a status-update event. Any snapshot-diff approach (diffing yesterday's parquet against today's) will surface this as two separate events ("your specimen disappeared" + "a new ecdysis specimen appeared") rather than one ("your specimen was catalogued"). Even a pipeline-side history table keyed on `occ_id` will not link them: the two rows have different `occ_id` values by design.

As of 2026-06-24, there are ~33 `waba_specimen` rows, ~28 from 2024 — the transition will happen repeatedly as the 2024 backlog is catalogued.

**Why it happens:**
The `occ_id` prefix is assigned by the first applicable rule in `occIdFromRow`: `ecdysis_id` wins over `specimen_observation_id`. Before cataloguing, `ecdysis_id` is NULL so the ID comes from `specimen_observation_id`. After cataloguing, `ecdysis_id` is set and the ID changes. There is no stable cross-state identity for this physical bee in the current model.

**How to avoid:**
- Accept the identity gap at MVP: the event stream shows the `waba_specimen` disappearing and the `ecdysis` row appearing as separate events. Surface this as a positive framing: "Your specimen @username/obs/N was catalogued as Ecdysis #M." This requires matching the two events on a shared signal (e.g., `specimen_observation_id` present on the ecdysis row — which it is when the ecdysis arm has a WABA link).
- Implement the matching in the pipeline, not the frontend: add a `transitioned_from_inat_obs` column (or a join key) to the `ecdysis` arm rows that came from `waba_specimen`. This makes the transition visible as a single event type rather than a delete+create.
- Do NOT store event history keyed purely on `occ_id` without first resolving this: a history table built from nightly diffs will permanently lose the link between `inat_obs:N` and `ecdysis:M`.

**Warning signs:**
- The event stream shows a collector's specimen disappearing and reappearing with no explanation.
- The history table has `DELETE inat_obs:N` followed by `INSERT ecdysis:M` with no linkage.
- A diff-based event log shows a spike in "deleted" events whenever a batch of Ecdysis records is uploaded after a gap.

**Phase to address:**
Phase 2 (temporal ID-status lifecycle). The matching logic for `waba_specimen → ecdysis` transitions must be designed before any event-history storage schema is committed. This is the single highest-risk design decision in the milestone.

---

### Pitfall 4: "Everything Is New" First-Run Flood

**What goes wrong:**
If the event stream is built by diffing nightly snapshots, the first time the diff runs against an initial empty history baseline, every occurrence in the current snapshot is emitted as a "new" event — potentially thousands of events. For a collector with 500 records, the personal event stream would show 500 "new" events on first load, which is useless as a "what changed" signal and demotivating as an accomplishment view (there is no sense of progression if everything arrives at once).

The same flood can recur after any history gap: if the pipeline misses a night (Ecdysis auth failure, maderas downtime), the next morning's diff emits all changes since the last good run as a single timestamp bucket.

**Why it happens:**
Snapshot diffing naturally has no concept of "before the beginning." The first baseline is an empty set, so everything in the first snapshot is a creation event. There is no distinction between "existed before we started tracking" and "created today."

**How to avoid:**
- On first run, set the baseline to the current snapshot (no events emitted). Emit events only for changes from that point forward. Surface historical accomplishments (total count, county coverage) separately from the event stream — they come from the snapshot, not the diff.
- For pipeline gaps: if the diff gap is longer than a threshold (e.g., >3 days), emit a "data refresh" summary event rather than individual per-occurrence events, and discard the fine-grained diff.
- If using client-side "last seen" watermark instead of pipeline history: on first visit, set the watermark to "now" and show accomplishments from the full snapshot. The event stream starts accumulating from that visit.

**Warning signs:**
- Event stream shows hundreds of events on first load for an established collector.
- Pipeline history table has a row count equal to the full occurrence count on the first nightly run.
- A collector reports "it shows everything as new every time."

**Phase to address:**
Phase 2 (temporal lifecycle). The "first-run baseline" strategy must be an explicit design decision in the phase plan, not an implementation detail discovered during execution.

---

### Pitfall 5: Collector Identity Mismatch — `recordedBy` vs. `host_inat_login`

**What goes wrong:**
Occurrences attributed to a collector come from two independent identity fields: `recordedBy` (free-text from Ecdysis, e.g. "Peter Abrahamsen") and `host_inat_login` (iNat username from the sample observation, e.g. "rainhead"). These are not reliably the same person across all records. The existing `CollectorEntry` type in `filter.ts` models this duality, but the matching is done with an OR clause: `recordedBy IN (...) OR host_inat_login IN (...)`.

For the per-collector page, the page must be keyed on something stable (a URL slug). If the slug is the iNat handle, collectors who have Ecdysis records but no iNat presence get no page. If the slug is `recordedBy`, free-text names with typos, abbreviations, or multiple formats ("P. Abrahamsen", "Peter Abrahamsen", "abrahamsen") generate multiple pages or silently drop records.

There are also collectors who appear under both identities with no programmatic link: a researcher who posts to iNat as "dragonfly_expert" but whose Ecdysis records say "M. Johnson." Their ecdysis records and iNat observations appear on separate pages (or no page at all) unless manually resolved.

**Why it happens:**
The pipeline has no canonical collector registry. `recordedBy` in Ecdysis is a free-text field entered by the collection manager. `host_inat_login` comes from the iNat observation's user login, which is stable. There is no join key between the two except when a WABA iNat observation (`host_observation_id`) links to an Ecdysis row.

**How to avoid:**
- For MVP: key per-collector pages exclusively on `host_inat_login` (iNat handle). This covers WABA collectors, who are the target audience, and avoids the free-text normalization problem. Ecdysis-only records without an iNat link are excluded from the personal page — document this as a known gap.
- Build a `collector_identity.csv` seed (analogous to `dedup_decisions.csv`) that manually maps `recordedBy` strings to `host_inat_login` for known WABA collectors. Use this to merge their Ecdysis records onto their iNat-keyed page. Keep the file small and curator-managed.
- Do NOT auto-fuzzy-match `recordedBy` to `host_inat_login` (similar to the checklist dedup lesson: false merge is worse than false split).
- Validate the page generation gate: if `collector_identity.csv` maps a name that appears in zero records, fail loud rather than generating an empty page.

**Warning signs:**
- Two pages exist for the same real person (one under their iNat handle, one under their Ecdysis name).
- A collector's personal page is missing their pinned-bee specimens because those rows have a `recordedBy` not in the identity seed.
- A page is generated with zero occurrences (the identity key resolved but matched nothing).

**Phase to address:**
Phase 3 (per-collector page generation). The identity model must be resolved before the Eleventy template is built. The `collector_identity.csv` seed should be seeded with at least the active WABA collectors before launch.

---

### Pitfall 6: Privacy Risk — Personally-Identifiable Activity on Public Static Pages

**What goes wrong:**
A per-collector page at `/collector/rainhead/` (bookmarkable, indexed by search engines, no auth) shows: collection date, collection location (lat/lon → county), bee species found. For most WABA collectors this is expected and desired. However:

1. **iNat obscured coordinates**: iNat observations marked "obscured" by the observer have their coordinates randomized (usually to a ~22 km box) to protect sensitive species or the collector's location. The pipeline currently uses these obscured coordinates. A per-collector page that maps these occurrences will show the collector as having been "in King County" rather than a specific point — which may still reveal more than the collector intended if combined with other signals (date + host plant = "this person was at Camas Prairie on May 3").
2. **Collector opt-out**: some WABA participants may not want a public page. There is currently no consent mechanism in the pipeline. A volunteer who contributed specimens to the project may not expect a public page about their activity.
3. **Name vs. handle exposure**: using `recordedBy` (real name) as the page title is more privacy-sensitive than using an iNat handle. Real names in URLs can be indexed and attributed in ways the collector did not anticipate.

**Why it happens:**
The "no auth needed, just self-identification" insight that makes the work surface feasible also removes the gate that would normally require a collector to opt in. The data is technically public (iNat observations are public, Ecdysis is public), but aggregating it into a named, bookmarkable personal page is a different disclosure level.

**How to avoid:**
- Key pages exclusively on iNat handle (not `recordedBy` / real name). This is the lower-privacy identifier since the collector already chose it as a public identity on iNat.
- Do not generate pages for collectors below a minimum activity threshold (e.g., fewer than 5 occurrences). This avoids generating a page for a one-time participant who may have forgotten about the project.
- Add a `collector_optout.csv` seed (just a list of iNat handles). Any handle in the file gets no page generated. Document this process in the operator guide.
- Never show GPS coordinates on the collector page. Show county/ecoregion only — same granularity as the existing map filter.
- Do not index collector pages in search engines (add `<meta name="robots" content="noindex">` to the per-collector page template) until an explicit decision is made that this is desired.

**Warning signs:**
- A collector contacts the project to ask that their page be removed (zero current mechanism to do so quickly without a deploy).
- iNat obscured observations appear on a collector page with their obscured (still usable for triangulation) coordinates.
- A page is generated for a one-time visitor who posted a single iNat observation and has no Ecdysis records.

**Phase to address:**
Phase 3 (per-collector pages). The opt-out seed, the minimum-threshold gate, and the noindex meta tag are requirements, not polish. They must be in the phase plan's acceptance criteria.

---

### Pitfall 7: Gamification Anti-Patterns — Demotivating Empty States and Vanity Metrics

**What goes wrong:**
Three failure modes are common when adding an accomplishments view to a data-sparse audience:

1. **Empty state for new collectors**: A volunteer who has been collecting for one season opens their page and sees "0 counties covered," "0 species identified," "0 badges." This is accurate but demotivating. The empty state communicates failure rather than potential.

2. **Vanity metrics that plateau quickly**: If the "taxonomic breadth" metric tops out at genus-level (there are only ~50 bee genera in WA), an experienced collector hits 100% within two years and the metric stops being motivating. A metric that maxes out is a dead metric.

3. **Relative comparison without context**: Showing "you have 47 species identified — the project average is 82" turns a personal accomplishment view into an implicit competition. For volunteer science this is actively harmful: it discourages participants who contribute niche data (e.g., only collecting in one specialized habitat) from continuing.

**Why it happens:**
Accomplishment systems are borrowed from game design where the audience opted into competition. Volunteer science audiences are inherently mixed: some are motivated by numbers, others by contribution. The project's stated Core Value is "tighten learning cycles" and "convey liveness," not "rank collectors."

**How to avoid:**
- Design the empty state as a prompt, not a scorecard: "Your first season — here's what we're tracking for you." Show what the metrics will show once data arrives.
- Make all metrics absolute (counties you've covered, species you've recorded) rather than comparative (no project averages, no leaderboards, no "top N").
- Choose metrics that scale with time invested, not just breadth: "years active" and "total collection events" grow monotonically and never plateau.
- Explicitly defer role badges (as already noted in the seed) — these require an identity/role roster that does not exist in the pipeline, and shipping a placeholder badge is worse than shipping none.
- Do not show a "percent of WA species recorded" metric at MVP — with ~800 WA bee species and most collectors recording 30–100, the number is always small and conveys only how much is missing.

**Warning signs:**
- The first draft of the accomplishments view shows a comparison table or a project-wide leaderboard.
- Metrics are described in requirements as "goals to reach" rather than "records of contribution."
- An empty-state mockup shows zeros across the board with no contextual framing.

**Phase to address:**
Phase 4 (accomplishments view). The UX copy for the empty state and the choice of which metrics to surface must be resolved in the discuss/plan step, not during execution.

---

### Pitfall 8: Static-Generation Scale — Per-Collector Page Blowup

**What goes wrong:**
The existing pattern generates one page per taxon (592 species + genus/subfamily pages = ~800 pages) and one page per place (~50 places). Per-collector pages follow the same pattern. However, the scale question is different: how many distinct collectors appear in the occurrence data?

The `recordedBy` field in Ecdysis is free-text with high cardinality (name variants, initials, etc.). If the page generation naively iterates every distinct value of `host_inat_login` or `recordedBy`, it could attempt to generate pages for hundreds of Ecdysis enterers, museum contributors from the checklist (Bartholomew et al. covers historical records with many `recordedBy` values), and one-time iNat observers.

The checklist source alone (19,929 records) has many distinct `recordedBy` values from historical museum collections. These are not WABA volunteers and should not get personal pages.

**Why it happens:**
The taxon and place page patterns are bounded by controlled vocabularies (iNat taxon IDs, curated `places.toml`). Collector identity has no such bound unless it is explicitly scoped to a curated set.

**How to avoid:**
- Gate page generation on the `collector_identity.csv` seed (from Pitfall 5). Only collectors explicitly in the seed get a page. This makes scale a function of the manually maintained list, not the full occurrence cardinality.
- Exclude `source='checklist'` records from collector page attribution entirely — these are historical museum records, not WABA volunteer activity. Checklist records should appear only in the aggregate accomplishments (county coverage) if at all.
- Set a build-time assertion: if the number of generated collector pages exceeds a threshold (e.g., 50), fail with an informative error ("unexpected collector count — review collector_identity.csv"). This prevents accidental blowup from a buggy identity join.
- Measure Eleventy build time with ~20 collector pages (a realistic WABA active-collector count) before committing to the pattern. The per-place and per-taxon pages already make the build non-trivial; 500+ collector pages would be a problem.

**Warning signs:**
- The Eleventy build starts generating pages for every distinct `recordedBy` in the checklist data.
- Build time increases significantly after adding the collector page template.
- The `_pages/` output directory contains pages for historical museum collectors.

**Phase to address:**
Phase 3 (per-collector page generation). The page-generation gate (seed-driven, not occurrence-driven) must be designed before the Eleventy template is written.

---

### Pitfall 9: Late-Arriving / Backfilled Data Corrupts the Event Timeline

**What goes wrong:**
The Ecdysis pipeline is subject to batch uploads from physical curation: a curator pins and identifies 100 specimens from 2024 and uploads them all to Ecdysis in one session in 2026. The nightly pipeline ingests these as 100 new `ecdysis` rows with `date` values from 2024. A snapshot-diff event history would surface this as "100 specimens identified today" — which is accurate from the pipeline's perspective but misleading from the collector's perspective ("these were collected two years ago, not today").

Similarly, the iNat pipeline can backfill expert identifications retroactively when a taxon is revised. A single identification revision on iNat can flip dozens of `canonical_name` values overnight, triggering a false "new species for you!" event.

**Why it happens:**
The pipeline ingests current state on each run; it has no concept of "when did this record first appear in the source system." The `modified` column exists for Ecdysis rows but is not uniformly populated. The `date` column is the collection date, not the ingestion date.

**How to avoid:**
- Store `first_ingested_at` (the nightly pipeline run date on which each `occ_id` first appeared) in the event history table. This is the correct timestamp for "what changed in the pipeline" events, regardless of the collection date or modification date.
- For the event stream display, use `first_ingested_at` as the event date, not `date` (collection date). The feed headline should read "catalogued this week" not "collected in 2024."
- Gate identification events (taxon name change) on a meaningful delta: if the `taxon_id` changes but the `canonical_name` at the genus level stays the same, do not emit a "new species" event — only emit it when the species-level identification is new.
- If using client-side watermark: the watermark is stored as a UTC date, and the event query filters `first_ingested_at > watermark`. This is robust to pipeline gaps because `first_ingested_at` accumulates monotonically.

**Warning signs:**
- A collector's event stream shows a spike of "new" occurrences on a date when they were not collecting.
- "New species for you!" events fire for taxon revisions that change only the subspecies epithet.
- The event stream sorts by collection date (the `date` column) rather than ingestion date, making old backfilled records appear in the middle of the feed.

**Phase to address:**
Phase 2 (temporal lifecycle). The `first_ingested_at` field must be added to the event history model before Phase 3 (collector pages) builds on top of it. It cannot be backfilled after the fact without a full re-run from an empty history table.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Key event history on `occ_id` without resolving the `waba_specimen→ecdysis` transition | Skip the identity design work | Events from the same physical bee are permanently split; the event stream shows a phantom delete+create for every catalogued specimen | Never — design the transition model before committing a history schema |
| Generate collector pages from all distinct `host_inat_login` values | No seed maintenance required | Hundreds of pages for casual iNat observers; scale blowup; no opt-out mechanism | Never — always gate on the identity seed |
| Store first-seen state in `localStorage` (client-side watermark) instead of the pipeline | No pipeline changes needed | Each device/browser has an independent watermark; a collector visiting on a new device sees "everything is new"; no server-side history to reason about | Acceptable for MVP if clearly labeled as "this device's history" and the pipeline option is deferred |
| Expose `recordedBy` (real name) as the page slug | Simpler identity model | Privacy risk; free-text normalization failures; real names in indexed URLs | Never — use iNat handle as the stable, lower-privacy slug |
| Add accomplishment metrics without an empty-state design | Faster to build | Demotivating zero-state for new collectors; visible immediately on first launch | Never — empty state must be part of the feature, not a follow-up |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iNat obscured coordinates | Treating obscured coordinates as precise (the pipeline stores them as received) | Never display coordinates below county granularity on the collector page; compute county from the obscured point (which the pipeline already does via spatial join) and show only county |
| Ecdysis `recordedBy` | Joining collector identity on a raw `recordedBy` string match across pipeline runs | Normalize through the `collector_identity.csv` seed; accept that some Ecdysis records will not match any iNat handle and exclude them from the personal page (not an error) |
| dbt contract + new facet columns | Adding a column to `occurrences.sql` without updating `schema.yml` simultaneously | Update `schema.yml` in the same commit as the column addition; the contract enforcement at `dbt build` time will fail otherwise, blocking the nightly pipeline |
| Eleventy static pages + collector data | Passing the full per-collector occurrence list as Eleventy template data (can be 500+ rows per collector) | Compute the aggregated accomplishment metrics (county set, species set, badge list) in the pipeline and store as a JSON artifact per collector; the Eleventy template reads the pre-aggregated JSON, not raw occurrence rows |
| `src=` URL back-compat | Removing `source` values from `VALID_SOURCES` without adding a URL migration | Old bookmarks with `src=waba_specimen` will silently apply no source filter (unknown tokens are dropped on parse per `url-state.ts` line 246); add a legacy-token-to-facet mapping in `parseParams` if source tokens are renamed |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-collector occurrence query at page-load time (no pre-aggregation) | Collector page takes 2+ seconds to render; wa-sqlite scans 90k+ occurrences on every load | Pre-aggregate per-collector metrics in the pipeline (a `collector_stats.json` artifact); the collector page reads the artifact, not the live DB | At any non-trivial occurrence count; wa-sqlite WASM has higher per-row overhead than native SQLite |
| Diff-based event history recomputed client-side | Client must load two snapshots and diff them; 2× the 23 MB DB weight | Store event history server-side (in the pipeline) as a `collector_events.json` or similar; ship only the events, not two full snapshots | Immediately — two 23 MB loads is not feasible on mobile |
| Eleventy build iterates all occurrences per collector page | Build time grows O(collectors × occurrences) instead of O(collectors) | Pre-join in the pipeline; each collector's page data is a small JSON blob written by the pipeline, not computed at build time by Eleventy | When the collector count × occurrence count exceeds ~10k rows total |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Collector page URL constructed from `recordedBy` free text without sanitization | Path traversal if `recordedBy` contains `../` or null bytes; XSS if the name is reflected in HTML without escaping | Use only `host_inat_login` (a controlled iNat username, alphanumeric) as the slug; apply the existing `slugify()` function if needed; never use free-text fields as URL path components |
| Injecting `host_inat_login` into SQL without escaping | SQL injection in the collector filter query (the existing `buildFilterSQL` already escapes `host_inat_login` via `replace(/'/g, "''")`) | Confirm the existing escaping applies to the new per-collector page query path; do not add a new SQL code path that bypasses the existing escaping |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Event stream sorted by collection date (not ingestion date) | Old backfilled records appear in the feed as if they were recent, confusing the "what's new" framing | Sort the event stream by `first_ingested_at` (pipeline ingestion date); show collection date as a secondary field in each event card |
| "Your specimens" includes checklist records attributed to a historical collector with the same name | A modern collector named "J. Smith" sees records from a 1940s museum collector also named "J. Smith" | Exclude `source='checklist'` from the personal page entirely; checklist records carry no iNat handle and cannot be reliably attributed to a living WABA volunteer |
| Accomplishment map shows county coverage as a percentage | A specialist who collects only in two eastern-WA counties sees "5% coverage" | Show absolute counts ("you've collected in 7 counties"), not percentages of the total |
| Event stream for a collector with 500+ records shows no pagination | The feed is unscrollable; first load is slow | Paginate the event stream; show the 20 most recent events with a "show more" control; the page-level artifact stores only the most recent N events |
| Per-collector page is navigable from the main occurrence detail card | Clicking a `recordedBy` name on any occurrence card navigates to the collector page | Only create collector page links where the identity is confirmed (i.e., the iNat handle is in the identity seed); unresolved `recordedBy` names should not be links |

---

## "Looks Done But Isn't" Checklist

- [ ] **Source rebuild back-compat:** Old `src=waba_specimen` deep links still filter correctly after `VALID_SOURCES` is changed — verify URL round-trip tests cover renamed/removed source keys.
- [ ] **Positional coupling:** After any change to `filter.ts` or `occurrence.ts`, confirm `OCC_ID_SQL_CASE` and `occurrence_places.sql` CASE branch order are identical — run a place-filter integration test against each source category.
- [ ] **waba_specimen transition:** Event stream shows "specimen catalogued" (not "deleted" + "created") when a `waba_specimen` row transitions to `ecdysis` — requires test fixture with a known transitioned pair.
- [ ] **First-run baseline:** A collector's first visit to their page shows zero stream events but non-zero accomplishment counts — the baseline was set to "now" rather than emitting all history.
- [ ] **Opt-out mechanism:** `collector_optout.csv` exists, is checked at build time, and a test verifies that a handle in the file generates no page.
- [ ] **Collector page noindex:** `<meta name="robots" content="noindex">` is present in the collector page template until an explicit decision is made to index.
- [ ] **Checklist exclusion:** Collector pages do not surface `source='checklist'` records — verify the per-collector query filters `source != 'checklist'` or is keyed exclusively on `host_inat_login` (which checklist records never carry).
- [ ] **Empty state framing:** A collector with zero post-baseline events sees explanatory copy, not a row of zeros — verify with a test fixture of a new collector (0 events since watermark, 5 historical occurrences).
- [ ] **dbt contract + schema.yml sync:** Every new column added to `occurrences.sql` appears in `schema.yml` in the same commit — verify by running `dbt build` after the column addition commit before merging.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Positional coupling break (place filters silently empty) | LOW-MEDIUM | Identify the arm with broken IDs; fix all three files in one commit; no data migration needed — the bridge table is regenerated nightly |
| dbt contract + S3 deadlock | LOW (if playbook is followed) | Follow the established sequence: `SKIP_INTEGRATION_GATE=1` nightly run; then re-enable the gate; documented in `project_occurrences_contract_release_sequence.md` |
| History table keyed on `occ_id` without transition linkage | HIGH | Requires redesigning the history schema and re-running from an empty baseline; cannot be patched incrementally — the entire history for transitioned occurrences is lost |
| First-run event flood | LOW | Drop the history table and re-create it with the "baseline = current snapshot" rule; collectors lose their event history but the flood stops |
| Collector page generated for an opted-out person | LOW | Add handle to `collector_optout.csv`; next deploy removes the page; no CDN cache to bust since the page is simply absent |
| Gamification metrics plateau / demotivation | MEDIUM | Metrics can be added/removed without a schema change (they come from the pre-aggregated JSON); but requires a user-facing communications step if the old metrics were shown publicly |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Positional coupling break (Pitfall 1) | Phase 1: source → facets rebuild | Place-filter test covers each source arm; all three files changed in same commit |
| dbt contract + S3 deadlock (Pitfall 2) | Phase 1 and Phase 2 (any phase adding mart columns) | Phase plan includes explicit release-sequence steps; `test_dbt_diff` green before close |
| waba_specimen → ecdysis transition breaks history (Pitfall 3) | Phase 2: temporal ID-status lifecycle design | Test fixture covers the transition case; event stream shows "catalogued" not "deleted+created" |
| First-run event flood (Pitfall 4) | Phase 2: temporal lifecycle | Verified with a new-collector fixture showing zero events but non-zero accomplishments on first load |
| Collector identity mismatch (Pitfall 5) | Phase 3: per-collector pages | `collector_identity.csv` seed exists; build fails on zero-match entries; no pages for unresolved `recordedBy` |
| Privacy on public pages (Pitfall 6) | Phase 3: per-collector pages | noindex tag present; opt-out seed checked; coordinates not shown; minimum-threshold gate enforced |
| Gamification anti-patterns (Pitfall 7) | Phase 4: accomplishments view (discuss/plan step) | No leaderboards, no percentages, no project averages; empty state shows framing copy |
| Static-gen scale blowup (Pitfall 8) | Phase 3: per-collector pages | Build-time assertion on page count; build time benchmarked with realistic collector count |
| Late-arriving / backfilled data (Pitfall 9) | Phase 2: temporal lifecycle | `first_ingested_at` field present; event stream sorts by ingestion date, not collection date |

---

## Sources

- `docs/domain-model.md` — `waba_specimen` lifecycle, occ_id transitions, positional coupling documentation (HIGH confidence: project-authoritative)
- `src/occurrence.ts`, `src/filter.ts`, `data/dbt/models/marts/occurrence_places.sql` — current positional coupling implementation (HIGH confidence: directly observed)
- `src/url-state.ts` — `src=` URL parameter contract, `VALID_SOURCES` set, `parseParams` unknown-token drop behavior (HIGH confidence: directly observed)
- `data/dbt/models/marts/schema.yml` — 36-column enforced contract (HIGH confidence: directly observed)
- `.planning/seeds/me-and-my-progress.md`, `.planning/research/questions.md` — snapshot-vs-history fork, event stream design (HIGH confidence: project-authoritative design notes)
- `.planning/notes/work-vs-learning-two-halves.md` — source-as-wrong-primitive framing (HIGH confidence: project-authoritative)
- `.planning/todos/pending/rebuild-source-into-facets.md` — three source consumers + open questions (HIGH confidence: project-authoritative)
- `MEMORY.md` → `project_occurrences_contract_release_sequence.md` — S3 deadlock recovery playbook (HIGH confidence: documented prior incident)
- `MEMORY.md` → `project_source_domain_rebuild_intent.md` — rebuild intent note (HIGH confidence: project-authoritative)
- iNat coordinate obscuring: https://www.inaturalist.org/pages/geoprivacy (MEDIUM confidence: policy known, exact pipeline behavior requires pipeline-level verification)

---
*Pitfalls research for: v6.0 My Work — Progress & Provenance (source-enum migration, temporal event history, per-collector static pages, accomplishments)*
*Researched: 2026-06-24*
