# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v5.2 — Place Coverage Expansion

**Shipped:** 2026-06-24
**Phases:** 3 (160–162) | **Plans:** 8 | **Timeline:** 2026-06-23 → 2026-06-24 | **Requirements:** none (backlog promotions)

### What Was Built
Made the place model overlap-capable (160 — `occurrence_places` many-to-many bridge mart on a synthetic `occ_id`, scalar `place_slug` dropped from the occurrences mart, `ST_Overlaps` guard removed, frontend filter rewritten to `EXISTS` membership), then added two new curated place sources on it: 33 WDFW wildlife areas (161, ArcGIS → DuckDB dissolve) and 13 WTA hike corridors (162, OSM/Overpass line → ~250 m metric-CRS buffer). Both sources ship committed, list-driven curation scripts and stay under the ~1 MB `places.geojson` browser-weight cap.

### What Worked
- **Splitting the model change out of the feature was the right call.** Phase 161's research discovered 16 real WDFW↔existing-place overlaps; rather than clip/triage, the team recognized one-place-per-occurrence was an implementation artifact and split the many-to-many model into its own phase (160). 161 and 162 then "just worked" with overlaps — a hike corridor inside a WDFW area is simply dual membership.
- **A reusable curation pattern paid off immediately.** 161's `add_wdfw_wildlife_areas.py` became the near-verbatim template for 162's `add_hikes_as_places.py` (shared `toml_block()`, idempotent append, `tomllib` round-trip, explicit raises). The only genuinely new code in 162 was the metric-buffer chain. Zero new Python deps across both.
- **The human-action checkpoint earned its keep.** 162's planner correctly marked the OSM-gap resolution `autonomous: false`; at execution the gap turned out to be a data-quality call (full ~75 km PCT Section J vs the ~8 km day-hike) that was genuinely the operator's — deferred cleanly rather than shipping a 9× over-claiming corridor.
- **Operator UAT caught a real defect tests couldn't.** 161's "empty sidebar" repro traced to the gitignored `occurrences.db` going stale (the `generate-sqlite` step never ran because the full `run.py` is blocked by the Ecdysis auth gate in local dev). Not a code bug; documented to project memory with the `sqlite_export.py` fix.
- **`always_xy=true` flagged as the single highest risk and test-guarded.** The planner/research surfaced that omitting the 4th `ST_Transform` arg yields a silent `POINT(inf inf)`; the golden-fixture test asserts finite/valid geometry as a regression guard.

### What Was Inefficient
- **Two code-review `--fix` passes shipped after each phase's UAT**, not before — both curation scripts had latent robustness bugs (TOML injection from remote names in 161; unreachable GPX fallback, OSM id-namespace collision, reversed-way concatenation, Overpass-QL injection in 162). None affected the shipped data, but folding a review pass into execution (before UAT) would have caught them earlier.
- **Stale ROADMAP checkbox at close.** Phase 160 was closed before this session but its ROADMAP checkbox stayed unticked, requiring a manual fix at milestone close — same "flip frontmatter/checkboxes at completion time" friction noted in v5.1.
- **OSM geometry-assembly paths still untested.** 162's WR-02/WR-03 fixes were verified by reasoning about Overpass response shapes, not an executing test (no fixture for relation/way assembly) — carried as known tech debt before the hike set expands.

### Patterns Established
- **Place-source curation script:** fetch authoritative geometry → DuckDB-spatial transform (dissolve for areas, metric-CRS `ST_Buffer` for linear) → `ST_SimplifyPreserveTopology` against the `places.geojson` weight budget → emit `[[places]]` TOML via the shared `toml_block()` writer. Template for the 999.11 wilderness-areas backlog item.
- **Linear features as corridor polygons:** `ST_Within` needs a polygon; buffer trail LineStrings in a metric CRS (UTM 10N, `always_xy=true`), never in degrees.
- **`places.geojson` ~1 MB cap is the binding fidelity constraint** — ratify a simplification tolerance per source and report before/after size.

### Key Lessons
- When research surfaces that a "constraint" is an implementation artifact, split the model fix into its own phase — downstream feature phases collapse in complexity.
- Local UAT of data-layer features can lie when a gitignored derived artifact (`occurrences.db`) is stale; the fix is a one-command regen, but the failure mode is non-obvious — worth the project-memory note.
- A `--chain` run still pauses correctly at a genuine human-action decision; don't try to automate data-quality judgment calls.

### Cost Observations
- Model mix: orchestration on Opus; researcher/pattern-mapper/planner-checker/executor/verifier/reviewer/fixer subagents on Sonnet.
- Sessions: 1 primary `--chain` session covering 161 plan→execute, 162 plan→execute, two `--fix` passes, two backlog captures, and milestone close.
- Notable: 162 made live Overpass API calls during execution (network available in-sandbox); both curation scripts run at maintainer time only — nothing new ships to the static runtime.

## Milestone: v5.1 — Housekeeping

**Shipped:** 2026-06-23
**Phases:** 5 (155–159) | **Plans:** 7 | **Timeline:** 2026-06-21 → 2026-06-23 | **Requirements:** none (housekeeping)

### What Was Built
Five independent backlog promotions: a desktop shift-drag bounds discoverability hint (155); the bounds-FILTER-vs-SELECTION state/URL separation that made `FilterState.bounds`/`bbox=` the honest contract and retired `_selectionBounds` (156); a regions-dropdown stacking fix relocating the control out of `<bee-map>`'s `z-index:0` context into a `<bee-atlas>` toolbar (157); non-WABA specimen-photo capture resolved by reusable WABA-backfill curation tooling rather than pipeline automation (158, 470 fields written); and a one-click sidebar taxon filter via composed `filter-changed` event (159).

### What Worked
- **A "build a match strategy" roadmap item correctly resolved to "curation tooling + operator process," not code.** Phase 158's roadmap framing implied a pipeline feature; the discussion found the real fix was copying description-embedded catalog numbers into the WABA field, and the deliverable became a durable, reusable `data/curation/waba_backfill/` toolset + documented process. Recognizing "this isn't a pipeline change" saved building automation nobody needed.
- **Headless UAT closed a UI phase's `human_needed` gate without a human.** For 159, the verifier flagged 3 browser-only checks; driving the real dev server with Playwright via the `o=<ids>&pane=list` URL (which populates the sidebar from the data layer, no map-canvas interaction) verified all of them, plus a keyboard-a11y check. Recorded as a reusable technique.
- **Code review caught real a11y defects the tests didn't.** The clickable `<span role="button">` taxon trigger shipped without keyboard activation or focus visibility; the review surfaced both and they were fixed inline before close (839 tests green).
- **One-session autonomous chain.** 159 ran discuss→plan→execute→verify→UAT→complete in a single `--chain` session with the operator only confirming gates.

### What Was Inefficient
- **The milestone-close CLI over-counted again** — exactly the v5.0 lesson, unfixed. `milestone.complete` scanned all non-archived phase dirs (v5.0's 147–154 still present) → "17 phases, 31 plans, 39 tasks" for a 5-phase/7-plan milestone, with the same junk one-liners ("New imports", "src/bee-map.ts"). Manually rewrote the MILESTONES.md entry. **Root cause:** phase dirs are never physically archived (the optional archival step is always skipped), so the scanner's denominator is the whole repo. Either archive phase dirs at close or scope the CLI to the milestone's phase range.
- **Phase 158 was never formally checked off** until a separate reconcile step — it was resolved by curation outside the plan/execute path, so STATE/ROADMAP kept routing to it as "next" until manually marked complete.

### Patterns Established
- **Curation-tooling-as-deliverable:** when an occurrence-capture gap is per-collector and judgment-bound, ship an idempotent, rate-limited, auditable curation script + operator doc rather than nightly automation.
- **Headless UI UAT via URL state:** drive the data-layer-backed sidebar through `o=`/`pane=` params + Playwright; assert through shadow DOM and `adoptedStyleSheets`. Saved as project memory.

### Key Lessons
- Flip UAT/VERIFICATION frontmatter to its terminal status *at completion time* — stale `pending`/`human_needed` statuses are the dominant source of false "open items" at milestone close (third milestone running with this friction).
- The milestone-close phase/plan/task counts cannot be trusted while phase dirs accumulate unarchived; verify scope manually before publishing MILESTONES.md.

### Cost Observations
- Model mix: orchestration on Opus; researcher/planner-checker/executor/verifier/reviewer subagents on Sonnet.
- Sessions: 1 primary autonomous chain for 159 + reconcile/close.
- Notable: 158 shipped zero production code in this milestone window (curation tooling landed in `21b11df0` before close); the milestone's code surface was 156's refactor + 157's relocation + 159's affordance.

## Milestone: v5.0 — Offline Field Mode

**Shipped:** 2026-06-21
**Phases:** 8 (147–154) | **Plans:** 22 | **Timeline:** 2026-06-10 → 2026-06-21 (~11 days) | **Requirements:** ROUTE/OFF/CACHE/PWA/LOC/NEAR/TILE

### What Was Built
An installable PWA dogfooded behind unlisted `/app`: scoped pass-through service worker (no SW on `/`), app-shell precache (vite-plugin-pwa injectManifest) + `/data/` `CacheFirst` runtime cache with full offline cold-start and reconnect re-prime, cache-health/freshness UX with prompt-to-reload updates (no `skipWaiting`), manifest + from-scratch icon set + Android/iOS install affordances, offline-safe GeolocateControl with `<bee-atlas>`-owned state, "occurrences near me" as a shareable ~10 km bounds filter, and a ToS-compliant Mapbox basemap `StaleWhileRevalidate` performance cache.

### What Worked
- **Research-before-build caught an unlicensable feature before a line was written.** The biggest win was a *negative* result: a ToS research pass on Phase 154 found offline basemap caching isn't licensed for the web SDK. Because the question was asked at discuss time, the phase was reshaped (offline → compliant perf cache) instead of shipping a TOS violation and discovering it later. The flag-gated "self-test only" framing the roadmap carried for months resolved to "no."
- **PWA offline patterns compounded.** Phases 147–149 built the SW infrastructure that 150–154 reused cheaply; the `data-artifacts` route was a ready template for the 154 basemap route.
- **Honest verification gates.** 152/153/154 returned `human_needed` for genuinely browser-only checks (GPS, CORS/opaque, SW cache hits) rather than rubber-stamping — the automated layer verified everything verifiable and stopped.

### What Was Inefficient
- **The milestone-close CLI over-counted and produced garbage one-liners.** `milestone.complete` scanned all non-archived phase dirs (pulling in v4.10's 145/146 and backlog 999.x → "17 phases, 28 plans") and emitted fragments like "New imports" / "bee-header.test.ts". Required manual correction of MILESTONES.md.
- **Stale terminal statuses accumulated.** 153 HUMAN-UAT stayed `pending` and 145 verification stayed `human_needed` after the work shipped, surfacing as false "open items" at close. Flipping UAT/verification frontmatter at completion time would avoid the cleanup.

### Patterns Established
- **ADR-backed scope decisions.** First `docs/adr/` entry (`0001-mapbox-basemap-cache.md`) records a legal verdict + compliance checklist — a durable home for "why we did NOT do the obvious thing." Paired with a project-memory pointer so it's not re-litigated.
- **Re-scope-on-finding within a phase:** when discuss/research invalidates the roadmap's premise, update ROADMAP success criteria + REQUIREMENTS inline and capture the pivot in CONTEXT.md, rather than forcing the original scope.

### Key Lessons
- Ask the licensing/ToS question at discuss time for any feature that caches or redistributes third-party content. A "self-test only, revisit later" flag is a smell that the legal question was deferred, not answered.
- For features whose only remaining verification is browser-observable, plan a HUMAN-UAT file from the start (UI hint) so the phase doesn't auto-advance past a gate it can't clear automatically.

### Cost Observations
- Model mix: opus (planning/orchestration) + sonnet (research/execute/verify subagents).
- Phase 154 ran the full discuss→plan→execute→verify chain in one `--chain` session; the ToS research pass was the highest-leverage spend.

## Milestone: v4.10 — Housekeeping

**Shipped:** 2026-06-09
**Phases:** 2 (145, 146) | **Plans:** 2 | **Timeline:** single day | **Requirements:** none (backlog-promoted)

### What Was Built
Two independent backlog items. **145 (Dependabot):** `.github/dependabot.yml` extended from github-actions-only to npm (`/` + `/infra`), uv (`/data`), and github-actions — weekly, minor+patch grouped, major ungrouped. **146 (debounce URL):** session-coalesced viewport→history writes in `<bee-atlas>` (`_viewportSessionActive` flag) so a whole pan/zoom exploration is one back-button entry, delimited by filter/selection/UI actions; preserved the v4.9 map-init invariants.

### What Worked
- **The code-review gate caught real defects on both phases.** On 146 it found a sibling test file (`bee-atlas-legacy-taxon.test.ts`) still calling the renamed `_pushUrlStateDebounced()` — a red-suite regression the *scoped* per-plan test run (`bee-atlas.test.ts` only) structurally could not see. On 145 it caught the uncovered `infra/` npm project. Both fixed before close.
- **Discuss-phase as reality check.** Phase 146's goal was already ~half-implemented (a 500 ms debounce existed); scouting the actual code during discuss reframed the phase from "add a debounce" to "stop viewport being the app's only pushState," and confirmed the fix against real call sites before any planning. Cheap correction at the cheapest stage.
- **Scoped verification held.** Per project memory (full suite ≥40 min, partly red, host SIGKILLs long runs), every test run stayed scoped to the affected files — and the code-review gate, not a full-suite run, was what caught the cross-file breakage.

### What Was Inefficient
- **Context-gathering missed a sibling project (145).** Root npm was scoped without noticing `infra/package.json`; only code review surfaced it (→ D-06). Cheap to fix, but a fuller "find all manifests" scout at discuss would have caught it up front.
- **`phase.complete` left the milestone-list checkbox unchecked on both phases** (known tooling gotcha — see STATE/memory); hand-corrected each time.

### Patterns Established
- **Scoped per-plan tests + a code-review gate are complementary, not redundant.** When a change renames/removes a symbol, the per-plan scoped run cannot see sibling test files referencing it — the review (or a full typecheck) is the safety net. Worth a grep for removed symbols across the whole test tree on any rename.

### Key Lessons
- For "add X to a config/registry" phases, enumerate *all* instances of the thing (every `package.json`, every call site) during discuss — partial scoping is the failure mode.
- A reframing discuss-phase can turn an "already done" backlog item into a correctly-scoped real change; don't take backlog goal text at face value — verify against the code first.

### Cost Observations
- Model mix: orchestrator Opus; executors + verifiers + reviewers on Sonnet.
- One executor per phase (single-plan waves, run on the main tree — no worktree isolation needed without concurrency), one code-review + one verifier agent each.
- Notable: both phases' real defects came from the review agent, not the (scoped) test runs — consistent with v4.9.

## Milestone: v4.9 — Map-Init Readiness

**Shipped:** 2026-06-09
**Phases:** 1 (144) | **Plans:** 2 | **Timeline:** single day | **LOC:** ~+399 / −82 (5 `src/` files)

### What Was Built
The recurring map-init race class — legacy-taxon deep links stranding the URL or flashing unfiltered dots while the taxon name resolved async — was retired structurally on the `ready.ts` readiness barriers shipped in quick task 260608-tnc. Legacy-taxon resolution collapsed from a three-site store-and-poll dance into one linear `await taxaReady` path; a single reactive `intendedFilterActive` getter (`isFilterActive || _filterResolving`, backed by a `@state` flag) replaced two separate "are we mid-resolve" signals and now drives both hide-all and URL-write suppression; and the occurrence-layer render decision moved into `<bee-map>` as `f(filteredGeoJSON, intendedFilterActive)` so an unfiltered flash is unreachable by construction rather than timed-around. Verified 5/5; 653/653 tests green.

### What Worked
- **Barriers + single gate over timers.** Naming the async resources (`taxaReady`/`mapReady`) and making consumers `await` them — plus collapsing two pending-resolve signals into one getter — turned a class of timing races into states that are simply unreachable. The earlier scaffolding-first quick task (260608-tnc, additive `ready.ts`) made the behavior-changing phase small and focused.
- **The code-review gate paid for itself.** It caught a genuine critical regression the refactor introduced (`markTaxaReady()` unreachable on empty-DB/error paths → permanent blank map) that all 651 tests passed straight through. Fixing it before close — not deferring — kept the phase's own goal intact.
- **Reactivity made explicit.** Backing `_filterResolving` with `@state` removed an implicit "co-mutate a reactive field at every call site" invariant; the gate now propagates to `<bee-map>` by construction.

### What Was Inefficient
- **`phase.complete` and `milestone.complete` both mis-scoped on this single-phase milestone.** `phase.complete` auto-advanced STATE into a parked 999.x backlog item and scrambled the progress counters; `milestone.complete` counted the still-in-place v4.7/v4.8 phase dirs (134–143) as v4.9 work (reported 8 phases / 13 plans / 23 tasks) and pulled their accomplishments into the MILESTONES entry. Both needed hand-correction at close — a known tooling gotcha, costing extra cleanup.

### Patterns Established
- **Readiness barrier discipline:** a barrier coupled to visibility/state MUST resolve on every code path — fire `mark*()` in `finally`, never only on the happy path. Idempotent resolve makes this safe.
- **Render = f(intent):** push render decisions into the presenter as pure functions of inputs; don't encode them as imperatively-timed state pushes from the coordinator.

### Key Lessons
- A test suite green in isolation (per-worktree self-check + 651 passing) can still hide a critical integration regression; the adversarial code-review pass is where it surfaced. Keep that gate non-optional even for "behavior-preserving" refactors.
- On single-phase milestones, distrust the close-automation's phase/plan counts — sibling unarchived phase dirs leak into the scope.

### Cost Observations
- Model mix: orchestrator Opus; executors + verifier + reviewer on Sonnet.
- Two executor worktrees (one per wave), one code-review agent, one verifier agent.
- Notable: the critical fix was found by the review agent, not the test suite — cheap insurance relative to a shipped blank-map regression.

## Milestone: v4.8 — Fast, Honest Test Suite

**Shipped:** 2026-06-08
**Phases:** 5 (139–143) | **Plans:** 11 | **Timeline:** ~3 days | **LOC:** ~+1,672 / −408 (32 `data/`+`.github/` files)

### What Was Built
The `data/` pytest suite was converted from a >40 min, partly-red, silently-skipping liability into a green < 5 min fast tier. A registered `integration` marker + `addopts` default-deselect splits a fast default (`uv run pytest`) from an opt-in slow tier; `BASELINE.md` anchors the before/after and an honest ~19-failure red inventory. The dominant cost (per-test reparse of the 50,646-row `checklist_records_full.csv`) was removed via distilled committed checklist/taxonomy fixtures + a module-scoped DuckDB build; built-asset-dependent tests now run on a clean checkout instead of `skipif`-skipping; additive DDL stubs greened all 19 `test_resolve_taxon_ids.py` tests; pytest-randomly proved the suite stable (197 passed/9 skipped/18.8s, three order-dependence bugs fixed); the `@integration` hard gate runs in `nightly.sh` and an independent `python-tests.yml` CI job enforces the budget on push/PR. 17/17 requirements.

### What Worked
- **Baseline-before-refactor (Phase 139 first).** Capturing the real wall-clock profile up front replaced the unverified ">40 min" folklore with measured per-file costs, and correctly fingered *committed-data reparse* — not un-checked-in-asset brittleness — as the dominant cost, which is what the rest of the milestone was actually built around.
- **"Green ≠ covered" framed as the north star.** Treating a silent `skipif` as a bug (not a pass) drove the loud-deselect / `@integration`-tag discipline; the suite now tells the truth about what it didn't run.
- **pytest-randomly as an honesty probe.** Randomized order surfaced three latent order-dependence bugs that collection-order green had hidden — cheap insurance against a suite that's only green by accident.

### What Was Inefficient
- **Phase 142 HUMAN-UAT ended blocked-on-prerequisite** (both items), accepted rather than resolved — the clean-room/nightly-rig prerequisite wasn't available at verify time, so the gate closed on operator acceptance instead of a green run.
- **The milestone-close CLI over-scoped** — `milestone.complete` scooped the paused v4.7 phase summaries (134–135) into v4.8's accomplishments and counts (reported 9 phases/18 plans), requiring manual correction of MILESTONES.md. Lesson: when a prior milestone is *paused with live phase dirs on disk*, the close tooling can't infer milestone boundaries from `.planning/phases/` alone.

### Patterns Established
- **Two-tier pytest** (`integration` marker + `addopts = -m "not integration"`): a single suite serves both the fast dev inner loop and the nightly full-data truth-check, with the heavy tier opt-in and CI-gated.
- **Distill committed fixtures with documented provenance** (`data/tests/fixtures/`, noting which real rows each sample came from and what branches it covers) over reparsing large committed source files per test.
- **Build expensive DuckDB once** via module/session-scoped fixtures rather than per-test.

### Key Lessons
- A fast suite and an honest suite are the *same* project: the refactor that makes tests fast (fixtures over full-file parsing) is the same one that makes them runnable on a clean checkout instead of silently skipping.
- Order-randomization and loud-skip-reporting are cheap, high-leverage honesty guards — adopt them before chasing the last seconds of runtime.
- Paused milestones leave live phase dirs that confuse boundary-inferring close tooling — verify scope/counts by hand when closing a milestone that ran *alongside* a paused one.

### Cost Observations
- Model mix: orchestration on Opus; executors/verifier on Sonnet.
- Notable: a tight, well-scoped milestone (11 plans, ~3 days) with no gap-closure cycles — the bulk of the late effort was verification rigor (clean-checkout script, randomized-order proof, nightly rig) rather than rework.

## Milestone: v4.7 — Checklist Records as Point Data

**Shipped:** 2026-06-08
**Phases:** 5 (134–138) | **Plans:** 17 | **Timeline:** 2026-06-04 → 2026-06-08 (paused mid-flight for v4.8) | **LOC:** ~+5,067 / −643 (49 non-planning files, 46 impl commits)

### What Was Built
The original 50,646-row Bartholomew et al. 2024 checklist CSV — coordinates, full dates, collector, locality all discarded by Phases 76/112 — was committed as a git-LFS source and promoted into `occurrences.parquet` as a `source='checklist'` point peer, reversing the Phase 111 lock. Ingest validates coordinates and normalizes mixed dates (`date_quality` enum). A tiered resolver (exact canonical → committed synonym seed → one-time build-time GBIF) keys each record to an iNat `taxon_id` with slash-compound LCA, a `rapidfuzz` human-review gate, a homonym guard, and zero nightly network calls. Dedup collapses 5,184 internal-duplicate groups and conservatively flags cross-source Ecdysis pairs into a curator-gated audit CSV. 19,929 deduped coord-bearing records entered `int_combined` ARM 4 (contract 33→34→37); the frontend renders distinct green points with a full detail card and `src=checklist` URL round-trip; the county-fill layer was retired. 21/21 requirements; audit passed.

### What Worked
- **Audit-CSV + curator gate for the two credibility-critical failure modes.** Taxonomic over-matching and dedup false-merge were each forced through a committed audit CSV and explicit human sign-off, with false-split preferred over false-merge — the right risk posture for a scientific atlas, and it kept zero silent merges in the shipped data.
- **Build-time-only external authority.** GBIF resolution runs once and bakes into committed seeds, so the static-hosting / no-runtime-lookup constraint held while still reconciling names to current taxonomy.
- **Atomic positional-contract commit (Phase 137).** Shipping `_GEO_COLS` and `features.ts` index changes in one commit avoided the silent per-row corruption a split would have caused — the decision was called out up front and honored.

### What Was Inefficient
- **The milestone-close CLI over-scoped again.** `milestone.complete` swept the still-on-disk v4.8 phase dirs (139–143) into v4.7's counts (reported 12 phases/28 plans) and accomplishments (polluted with malformed one-liners), requiring a full manual rewrite of the MILESTONES.md entry — the *same* failure v4.8's retro flagged. Lesson reconfirmed: when sibling milestones share `.planning/phases/`, the close tooling cannot infer boundaries; correct counts and accomplishments by hand.
- **Pre-close audit drowned in tooling false-positives.** 24 completed quick-tasks showed as "open" purely because the deployed `gsd-sdk` `audit-open.ts` reads only a bare `SUMMARY.md`, not the documented `${id}-SUMMARY.md` convention. Real triage (all complete) was quick; making the scanner agree took 24 file normalizations.
- **A real production bug surfaced only by user report at close.** `species.njk` linked to bare directories (`/species/{slug}/`) that 403 under S3-REST+OAC — undetected by tests because no test asserted link targets resolve.

### Patterns Established
- **Curator-gated audit CSV** for any build-time decision with a credibility-critical false-positive cost (name resolution, cross-source dedup): emit candidates, require an explicit confirmed-decision seed, suppress/apply nothing unreviewed.
- **`date_quality` enum** (full/year_only/none) driving downstream filter eligibility, rather than silently dropping unparseable dates to NULL.
- **Internal links target `.../index.html`, never bare directories** — production serves from the S3 REST endpoint via OAC, which has no directory-index resolution.

### Key Lessons
- Reversing a *locked* decision (Phase 111) is cheap when the original rationale was factually wrong — verify the premise before treating a lock as permanent.
- Closing a milestone that ran alongside a paused/parallel one needs manual count/accomplishment verification every time — the CLI cannot be trusted to scope `.planning/phases/`.
- "Green suite" still misses link-resolution and serving-layer bugs; a thin build-output link-check would have caught the `species.njk` 403s.

### Cost Observations
- Model mix: orchestration on Opus; executors/verifier on Sonnet.
- Notable: shipped out of order (paused mid-Phase-135 for v4.8, then resumed) with no gap-closure cycles; the heaviest late effort was the human-review gates and the close-time audit/cleanup, not rework.

## Milestone: v4.6 — Taxonomy Hierarchy & Normalization

**Shipped:** 2026-06-04
**Phases:** 5 (129–133) | **Plans:** 18 | **Timeline:** ~3 days | **LOC:** ~+4,306 / −2,468 (59 non-planning files)

### What Was Built
A `taxon_id`-keyed materialized-path taxon hierarchy in `occurrences.db` (two-pass bee + bycatch, zero-orphan assertion, 2.0 ms descendant query); map filtering cut over to descendant-by-any-rank with 8-rank autocomplete and integer `?taxon=` URLs; the occurrences mart normalized (37→33 cols, 7-field `geo_blob`, −14.2% DB, `display_name` JOIN); subfamily/tribe/subgenus pages added off the `higher_taxa` rollup; and the flat `/species` index replaced by an expandable bee-only `<details>` browse tree (toggle + localStorage, type-to-filter with ancestor auto-expand, count splits, page/map links). 20/20 requirements; audit passed.

### What Worked
- **Additive-then-subtractive sequencing** (Phase 130 filter cutover before Phase 131 column drop) meant the hierarchy read-path was exercised in production before the risky normalization — no broken intermediate state, and the geo_blob positional-coupling risk was de-risked.
- **The benchmark-gates-structure discipline** in Phase 129 (decide materialized-path vs nested-set by a 50 ms latency test before finalizing schema) avoided premature commitment; the simplest structure won on measured evidence.
- **Code review caught what verification missed.** The Phase 133 human-verify approved a feature that was actually broken; the code-review gate (run against the built HTML) found the `display:none` default-view bug and the source-grep tests that masked it.

### What Was Inefficient
- **Phase 133 needed a full gap-closure cycle + three operator re-verify rounds** after the checkpoint was prematurely approved — the rework (broken default view, missing disclosure affordance, toggle reflow, a `[hidden]`-vs-`display:flex` specificity bug, species outdent) all surfaced post-"done".
- **Tests that don't execute the behavior are worse than no tests** — they create false confidence. The original `species-index.test.ts` asserted source strings (including the exact `.open = true` line that failed) and stayed green while the page was broken.

### Patterns Established
- **happy-dom executable tests for plain-DOM client logic** — extract behavior into a pure module (`src/species-tree.ts`, no CSS/custom-element imports) and test toggle/filter/reset against a constructed DOM; reserve human-verify for what has no layout engine (CSS rendering).
- **`display:contents` for "skip a wrapper rank but keep its descendants"** — the correct primitive for collapsing an intermediate `<details>` without burying its subtree.
- **Canonical integer `?taxon=<id>` deep-links from static pages**, with legacy name+rank parsed as fallback.

### Key Lessons
- Treat a UI human-verify checkpoint as **inconclusive until the code review and an executable test agree** — a quick visual pass (especially with a toggle left in a non-default state) can miss a broken default.
- When a test guards a security/behavior invariant, assert the **sink/effect**, not a substring that can appear in a comment (the `innerHTML`/`.open` false-positive pattern bit twice this milestone).

### Cost Observations
- Model mix: orchestration + gap closure on Opus; executors/verifier/reviewer on Sonnet.
- Notable: the Phase 133 gap closure (4 fix commits + 3 re-verify rounds) cost more than the original phase execution — front-loading an executable test in Wave 0 would have caught all three blockers before the checkpoint.

## Milestone: v4.5 — iNat Taxonomy & Species Completeness

**Shipped:** 2026-06-01
**Phases:** 5 (124–128) | **Plans:** 8 | **Timeline:** ~3 days | **LOC:** ~+1,400 / −60

### What Was Built
Non-null `taxon_id INTEGER` surfaced through the dbt marts behind a pre-build resolution gate; 65 off-checklist species made visible; "View on iNaturalist →" links on all taxon pages; a dormant inactive-taxon auto-remap safety net; and a genus-rank occurrence taxon_id backfill (kingdom=Animalia) that drove occurrences NULL taxon_id 34,354 → 21,680. 13/13 requirements complete.

### What Worked
- **Verification caught a real requirements gap before archiving.** The milestone-close pre-flight flagged Phase 126 unverified; verifying it surfaced that TID-02 ("every occurrence row") was literally unsatisfiable — exactly the kind of thing that should block a close. Re-scoping + an inserted Phase 128 closed it cleanly rather than shipping a false "done."
- **Research paid for itself.** The Phase 128 researcher caught that the existing `higher_rank_taxon_ids.json` picks the *wrong* Stelis (plant over bee, via dict-overwrite) — an assumption the plan had baked in. Cheap research prevented a silent data-correctness bug.
- **The plan-checker executed the plan's SQL against live data** and reconciled the numbers before any code was written, raising confidence the rebuild would land correctly.

### What Was Inefficient
- **Two avoidable miscounts on stale data.** The initial NULL-row analysis used the stale `public/data/occurrences.parquet`; the executor then mis-scoped a checkpoint by counting *all* single-token names instead of the currently-NULL ones (the `taxon_id IS NULL` guard makes most irrelevant). Both were caught, but each cost a round-trip. Lesson: for backfill scoping, always query the fresh build AND apply the actual write-guard predicate up front.
- **The `milestone.complete` CLI mis-extracted accomplishments** — it scraped one-liners from every on-disk phase (101–128) and miscounted stats (10 phases vs the real 5). The MILESTONES entry had to be hand-rewritten. The phase directories from prior milestones were never archived off `.planning/phases/`, which is what confused the scanner.

### Patterns Established
- **Reading a raw CSV directly inside a dbt model** (`read_csv('../raw/taxa.csv.gz', …)`) when the full dump isn't loaded into DuckDB — viable because the dbt-duckdb build CWD is `data/dbt`. First of its kind in the repo.
- **Disambiguate cross-kingdom taxon-name homonyms by ancestry membership** (`list_contains(string_split(ancestry,'/'), '<kingdom_id>')`), backed by a dbt `unique` test as a fail-loud safety net for future homonyms.
- **Finest-rank COALESCE behind a `taxon_id IS NULL` + single-token guard** so a backfill never overwrites a finer existing identification.

### Key Lessons
- A requirement's *wording* can be impossible even when its *intent* is achievable — verify against real data early, and treat re-scoping as a first-class, human-owned decision rather than a silent deviation.
- When scoping a data backfill, the only number that matters is "rows the write-guard will actually touch on the fresh build" — not "rows that match the name."
- Archive phase directories at milestone close (or the open-artifact scanner and accomplishment extractor drift over time).

### Cost Observations
- Heavy use of subagents (researcher, planner, plan-checker ×2, executor, verifier) on Opus for a data-correctness-critical phase; the adversarial plan-check + live SQL reconciliation was worth the spend given it touched production parquet.

## Milestone: v4.3 — Loading Performance

**Shipped:** 2026-05-28
**Phases:** 2 (121–122) | **Plans:** 5 | **Timeline:** 3 days | **LOC:** +5,261 / −969

### What Was Built

- Phase 121: `data/sqlite_export.py` exports `occurrences.parquet` → `occurrences.db` via DuckDB sqlite extension (schema-derived DDL); `nightly.sh` content-hashes and adds `occurrences_db` manifest key; worker rewritten to 3-step fetch→MemoryVFS seed→query
- Phase 122: `json_group_array` approach tried and rejected (1286 ms = 2× worse); root cause (WASM→JS callback overhead ~6.4 μs × 92K rows) correctly identified; `geo_blob` pre-serialized table (Python `json.dumps`) reduces to 1 row, 1 callback; 80 ms SQL geo query; tablesReady 250 ms; loading screen 875 ms

### What Worked

- Spike-driven planning: the 260527-spike-prebuilt-sqlite-vfs spike produced FINDINGS.md that made Phase 121 execution nearly zero-surprise; spending time on a spike before committing to the milestone was clearly the right call
- TDD RED/GREEN discipline caught 4 TypeScript bugs during Phase 122 Plan 01 that would have caused silent runtime failures (implicit `any`, non-null assertions)
- Benchmark-first approach: capturing Firefox numbers before Phase 121 approved revealed the real bottleneck (SQL geo query) vs what the spike had measured (INSERT loop); this redirected Phase 122 correctly

### What Was Inefficient

- `json_group_array` implementation was built out fully (12 unit tests, full wire-up) before being benchmarked — benchmarking earlier in Plan 01 would have saved ~30% of that plan's work
- Phase 121 targets (tablesReady ≤ 600 ms) required Phase 122 to be met; targets set on spike data (Chromium) didn't transfer to Firefox WASM JIT; future performance targets should specify browser and test environment

### Patterns Established

- `geo_blob` pre-serialization pattern: when WASM→JS callback overhead dominates, move serialization to the Python export step and store as a single-row TEXT blob
- Benchmark checkpoint at Plan 03 (with human-verify) is the right gate for performance phases — catches JIT/browser discrepancies that unit tests cannot surface
- `MemoryVFS.mapNameToFile({flags: 0x2, size, data})` before `open_v2` is the correct wa-sqlite seeding pattern for prebuilt DBs

### Key Lessons

- WASM→JS callback cost (~6.4 μs each) is a hidden performance cliff — any query returning >10K rows via per-row callbacks will dominate total time regardless of SQL efficiency
- Firefox WASM JIT is ~2× slower than Chromium V8 for this workload; always target the slower browser in performance success criteria

---

## Milestone: v4.1 — Validation & Code Quality

**Shipped:** 2026-05-25
**Phases:** 3 (114–116) | **Plans:** 12 | **Timeline:** 1 day | **LOC:** +5,367 / −131

### What Was Built

- Phase 114: Retroactively restored Phase 89 VALIDATION.md from git history; corrected Phase 90 VALIDATION.md (nyquist_compliant false→true + Historical Note); authored Phase 91 VALIDATION.md from scratch using 91-VERIFICATION.md as source-of-truth; added `requirements-completed` frontmatter to phases 89–91 SUMMARY files; updated v3.5-MILESTONE-AUDIT.md to `status: passed`
- Phase 115: Created Phase 97 and 100 VALIDATION.md files from their VERIFICATION.md sources; updated Phase 98 VALIDATION.md (false→true) and created 98-VERIFICATION.md (summary-and-code-inspection, 9/9 pytest pass); created Phase 112-VERIFICATION.md documenting browser UAT (6/6 PASS) as verification gate; Phase 112 VALIDATION.md updated to nyquist_compliant:true
- Phase 116-01: `places_validation.py` now raises descriptive `ValueError` for permit records missing `issuing_authority` or `type`; fail-fast before spatial work; 4 new pytest cases (10/10 pass)
- Phase 116-02: `run.py` module docstring synced to list all 19 pipeline steps in execution order
- Phase 116-03: Resolved 3 pre-existing `test_dbt_diff.py` failures by regenerating `species.parquet`/`species.json`/`seasonality.json` from current dbt sandbox; all 150 data tests pass

### What Worked

- The "retroactive from git history" pattern (Phase 114) for recovering archived docs was efficient: `git show <commit>:<path>` pulled the exact pre-archival state, requiring only targeted frontmatter mutations rather than full reconstruction
- Phase 115's "6 deliverables in one cross-plan verification gate" (115-05) was a good checkpoint pattern — it caught a false-positive grep issue in 112-VALIDATION.md and confirmed all six files had correct frontmatter before closing the phase
- The sandbox regeneration approach for CODE-03 was clean once the root cause was identified: both sandbox and public/data needed updating in sync, and the 4-step sequence (export → sandbox-json → dbt-rebuild → verify) was deterministic
- Permit validation (CODE-01) was a fast 3-minute plan: targeted function, fail-fast semantics, 4 tests, no side effects on valid data

### What Was Inefficient

- Phase 116-03 root cause required a multi-step investigation: the plan said "regenerate the three public artifacts" but the byte-comparison tests compare sandbox/ against public/data/ — both sides needed updating. The plan was written without full knowledge of the test harness structure. Pre-plan investigation of the test expectations would have surfaced this.
- Phase 114's Historical Note text required rephrasing to avoid matching the verification grep pattern (`! grep -q 'nyquist_compliant: false'`). The plan prompt was advisory text that conflicted with its own verification commands. Better: write verification commands before writing plan prose to ensure they're compatible.

### Patterns Established

- **Retroactive VALIDATION.md from git history**: `git show <archival-commit>^:<path>` recovers the pre-archival file state reliably; targeted frontmatter mutations (nyquist_compliant, status, approved date, sign-off checkboxes) + Historical Note appended at end is the complete recipe.
- **Historical Note for nyquist_compliant retroactive approval**: document (1) what the planning-time state was, (2) what happened during execution, (3) citation of RED commits or UAT evidence, (4) any architectural changes post-phase that don't retroactively invalidate the phase.
- **Sandbox + public/data must be regenerated in sync for byte-comparison tests**: run `species_export.py` with `EXPORT_DIR=sandbox` before verifying `test_species_json_matches` — the test compares both sides, not just the public artifact.

### Key Lessons

- **Write verification commands before plan prose**: if the verification check is `! grep -q 'X'`, the plan's text cannot contain `X`. Writing the verify-gate first prevents plan text from invalidating its own checks.
- **Pre-plan test-harness investigation for artifact refresh tasks**: before planning a "regenerate X so tests pass" task, read the failing test assertions to understand what both sides of the comparison are. One-sided regeneration that ignores the comparison source is a predictable deviation.
- **Nyquist gaps accumulate fast; close retroactively each milestone**: three milestones of deferred VALIDATION.md work compounded into a dedicated cleanup milestone. Closing validation gaps within the same milestone cycle (even retroactively) keeps the audit surface manageable.

---

## Milestone: v3.9 — Sidebar & Table Unification

**Shipped:** 2026-05-20
**Phases:** 5 (105–109) | **Plans:** 12 | **Timeline:** 2 days | **LOC:** +10,639 / −1,326

### What Was Built

- Phase 105: `UiState.paneState: 'collapsed' | 'list' | 'table'` replaces `viewMode: 'map' | 'table'` in url-state.ts; `?pane=list`/`?pane=table` URL round-trip; legacy `?view=table` alias via Option A precedence; 6 new tests
- Phase 106: `@state() private _paneState: 'collapsed' | 'list' | 'table'` replaces three-flag view state (`_viewMode + _sidebarOpen + _tableFilterOpen`) in bee-atlas.ts; SM-01 test block (7 tests) via TDD RED→GREEN
- Phase 107: `bee-pane.ts` (1004 lines) — unified three-state presenter merging filter UI rows (What/Who/Where/When) from bee-filter-panel.ts + occurrence detail from bee-sidebar.ts; persistent toggle button, expand/shrink navigation events; PANE-01..06, TABLE-01
- Phase 108: bee-atlas render cutover to single `bee-pane` overlay; PANE-01 wiring block (12 tests); MAP-01 satisfied via overlay architecture (bee-pane is `position:absolute`; ResizeObserver in bee-map.ts handles viewport changes); UAT approved after 5 regression fixes
- Phase 109: `queryListPage` WHERE intersection (filter AND selection) in filter.ts; floating `.filter-btn` collapsed button (magnifying-glass + count); split-screen table (40% map / 60% table); `bee-filter-panel.ts` + `bee-sidebar.ts` deleted; TABLE-02; 2 gap closure waves (scroll containment, list refresh on filter change)

### What Worked

- The four-phase refactor sequence (URL → state machine → new component → cutover → redesign) had clean dependency edges — no phase blocked waiting for a sibling
- MAP-01 via overlay architecture was the right call: no explicit `map.resize()` needed, the existing ResizeObserver handles viewport-only resizes, and the PANE-01 source-scan test locks the invariant going forward
- TDD RED→GREEN for Phase 106 state machine (14 initially failing assertions → all green) gave high confidence in the refactor without requiring browser verification
- Verbatim-copy pattern for merging bee-filter-panel.ts + bee-sidebar.ts handler/render methods into bee-pane.ts (plan 107-02) was accurate: plan → implementation with no deviations
- Gap closure plans (109-05, 109-06) were fast to write and execute: specific, targeted, verifiable in isolation

### What Was Inefficient

- Phase 108 UAT surfaced 5 regressions after cutover (Mapbox attribution z-index, sidebar button order, table close button, row-pan auto-shrink, map header icon) — all were CSS/event handler gaps that could have been caught with a more thorough pre-UAT source review of the old bee-atlas CSS rules being deleted
- Phase 109 gap closure needed 2 waves (5 and 6) instead of 1 — the scroll containment gap (09-05) and filter-change refresh gap (09-06) were both foreseeable at Phase 109 planning time given the unified pane design; a more thorough success-criteria review would have surfaced them
- REQUIREMENTS.md URL-01/URL-02/MAP-01 checkboxes were never updated during Phase 105 and 108 execution; required correction at milestone close. The Phase 105 progress table in ROADMAP.md also had an incorrect "0/1 Not started" entry. Three bookkeeping errors from the same root cause: requirement status not updated at phase completion time.

### Patterns Established

- **Overlay architecture for side panels**: `position:absolute` panels leave the map element dimensions unchanged across open/close; avoids `map.resize()` calls and prevents canvas resize artifacts. PANE-01 source-scan test locks the `bee-pane { position:absolute }` invariant.
- **Verbatim-copy merge for component consolidation**: when merging two components into one, copy methods verbatim (not rewrite) in the first phase; behavioral changes come in a subsequent redesign phase. Avoids double-regression risk.
- **WHERE intersection for unified query**: when selection and filter both narrow the result set, `WHERE filterWhere AND selectionWhere` is the correct model (not priority sort or two-view). Users expect "show me these 3 selected results within my filter."
- **Gap closure as a named wave**: writing 109-05 and 109-06 as explicit gap-closure plans (rather than amending earlier plans) keeps the wave structure clean and the git history interpretable.

### Key Lessons

- **Close bookkeeping at phase completion time**: requirement checkbox updates and ROADMAP progress table corrections should happen within the same commit that marks a plan as complete, not at milestone close. Three stale entries at this milestone close were from this pattern.
- **Pre-UAT CSS audit for deletion**: when a cutover phase deletes a component's CSS rules, enumerate each deleted rule and verify the same visual property is handled elsewhere before UAT. This would have caught 3 of the 5 Phase 108 regressions.
- **Write success criteria that include scroll containment and filter-change refresh**: for list/pagination components, "shows occurrences" is not sufficient — also verify "list scrolls independently", "list refreshes when filter changes while open", and "page resets on query change". These are standard requirements for any paginated list component.

---

## Milestone: v3.7 — Places

**Shipped:** 2026-05-18
**Phases:** 5 (97–100.1, including INSERTED 100.1) | **Plans:** 11 | **Timeline:** 2 days

### What Was Built

- Phase 97: `content/places.toml` TOML schema; `places_validation.py` with slug/WGS84/overlap validation; pytest tests
- Phase 98: `places_load.py` pipeline step; dbt 31-column contract with `place_slug`; `places_export.py` producing `places.geojson` + `places.json`; `places_maps.py` per-place SVG occurrence maps; git-committed artifacts
- Phase 99: TDD RED tests; `_data/places.js`, `_pages/places.njk`, `_pages/place-detail.njk`, `src/styles/places.css`; permit references removed (D-01)
- Phase 100: `FilterState.selectedPlace`; `place=` URL round-trip; bee-map Places mode (amber polygons, `promoteId:'slug'`); bee-filter-panel place chip; bee-atlas `_onPlaceSelected` wiring; 6 Vitest integration tests
- Phase 100.1: nightly.sh place-maps S3 upload + CloudFront invalidation; `_onBoundaryModeChanged` clears `selectedPlace` when leaving places mode

### What Worked

- gsd-audit-milestone before close caught B-01 (place-maps S3 upload missing) — same pattern as BLOCKER-01 in v3.6 — Phase 100.1 fixed it cleanly in ~10 minutes
- Two-artifact export split (places.geojson slim / places.json rich) kept concerns well-separated between Mapbox and Eleventy
- `promoteId: 'slug'` decision made early eliminated downstream slug-lookup code in click handlers
- TDD RED tests in Phase 99 gave clean implementation targets for _data/places.js and build output

### What Was Inefficient

- Phase 98 VERIFICATION.md never created — third milestone running where a phase's procedural verification artifacts are missing despite implementation being correct
- Nyquist Wave 0 RED tests bypassed for phases 97, 98, 100 — same pattern as v3.6; becoming a recurring gap
- `requirements-completed` frontmatter missing from Phase 97 and 100 SUMMARY files — same recurring documentation gap

### Patterns Established

- `places_load.py` zero-arg STEPS wrapper pattern (mirrors places_validation.py) — reusable for any future TOML-to-DuckDB pipeline step
- `leavingPlaces` conditional in boundary-mode change handler — reusable pattern for mode switches where one mode implies a filter state
- `placeImplied` bm= derivation in `parseParams` — reusable for any future URL param that implies a companion UI mode

### Key Lessons

- Commit to writing VERIFICATION.md at phase execution time, not retroactively — three milestones with this gap now
- Pre-flight audit catches S3 upload gaps reliably; the audit workflow is earning its keep
- Nyquist Wave 0 tests should be written as an explicit plan step, not a "should do" note — when plans are dense, they get skipped

---

## Milestone: v3.6 — Simpler Species Index

**Shipped:** 2026-05-16
**Phases:** 5 (92–96) | **Plans:** 13 | **Timeline:** 2 days

### What Was Built

- Phase 92: Hierarchical `Genus/specificEpithet` slug migration in `species_export.py` and `species_maps.py`; tomlkit-based audit removed 106 non-bee orphan entries from `species-photos.toml`
- Phase 93: `_group_colors` D-01 HSL helper and `_generate_group_maps` in `species_maps.py`; 44 genus + 103 subgenus + 19 tribe multi-color SVG occurrence maps
- Phase 94: `speciesList`, `genusList`, `hslToHex` in `_data/species.js`; `species-detail.njk` and `genus.njk` Eleventy pagination templates; lean `taxon-page.ts` Vite entry; 527 species pages + 42 genus pages
- Phase 95: `subgenusList` and `tribeList` in `_data/species.js`; `subgenus.njk` and `tribe.njk` templates; 103 subgenus pages + 19 tribe pages
- Phase 96: `species.njk` rewritten as family→genus index; `species-index.ts` thin filter entry; 8 monolith production files + 6 test files deleted; arch.test.ts allowlist updated

### What Worked

- Wave 0 TDD scaffolding (RED-before-GREEN) caught the slug old-format detection false positive (`LIKE '%-%'` vs `NOT LIKE '%/%'`) in Phase 92 before it shipped
- D-01/D-02 alphabetical canonical_name sort as the binding contract between Python SVG hue assignment and JS swatch rendering — one invariant, two test surfaces
- `gsd-audit-milestone` ran before close and correctly caught BLOCKER-01 (species-maps/ never uploaded to S3); the fix was a one-liner that closed 4 requirements
- Phase 96 cleanup left the repo cleaner than it started: net −17,737 lines across 154 files

### What Was Inefficient

- Phase 94 human checkpoint auto-approved — 4 browser verifications (photo CSS hero, seasonality render, mobile layout, swatch-to-SVG D-02 cross-check) never happened; will need manual verification or a gap-closure plan
- `requirements-completed` frontmatter missing from Phase 95 SUMMARY files for the second milestone running (same gap as v3.5 SEL-01–SEL-05) — post-execution docs remain a weak point
- BLOCKER-01 should have been caught earlier (during Phase 94 execution) when SVG URLs were first embedded in templates; it took the audit to surface it

### Patterns Established

- `tomlkit` for round-trip TOML mutation (audit-then-apply with JSON disposition report) — reusable for any future content migration requiring auditable change trail
- `hasattr` skip-guard pattern for forward-looking test scaffolding (Phase 93 Plan 01) — tests activate automatically when the implementation lands
- Lean Vite MPA entry pattern: `taxon-page.ts` with 4 imports keeps taxon-page chunk separate from the heavier SPA entry; reuse for any future standalone page type
- `data-search` dataset attribute walk for server-rendered filter UX — idiomatic for Eleventy + minimal JS without pulling in framework overhead

### Key Lessons

- Populate `requirements-completed` in every SUMMARY.md plan at time of execution, not retroactively — two milestones in a row this was a documentation gap at audit time
- Browser-verifiable behaviors (CSS layout, chart renders, mobile breakpoints) need human checkpoints that aren't auto-approved — mark `auto_advance: false` for plans with meaningful UI output
- Pre-flight audit should check for S3 upload completeness whenever the pipeline emits new file trees; a new output type without an S3 upload line is a structural gap

---

## Milestone: v3.5 — Selection Rectangle

**Shipped:** 2026-05-15
**Phases:** 3 | **Plans:** 4 | **Commits:** ~61

### What Was Built

- Shift-drag rectangle gesture in bee-map.ts — BoxZoom disabled, capture-phase mousedown, real-time `.selection-box` overlay, `selection-drawn` CustomEvent
- `queryOccurrencesByBounds(f, bounds)` in filter.ts — active filter + lat/lon BETWEEN clause intersection
- Sidebar open/closed contract — synchronous pre-clear, stale-filter snapshot guard, empty-result early return
- `sel=west,south,east,north` URL round-trip — 4-decimal encoding, full validation, `_restoreBoundsSelection` on page load and popstate
- 5 post-execution code-review fixes — including critical `_selectionBounds` stale-state corruption in `_onPopState` ids/cluster branches (CR-01) and sidebar never closing on empty restore (CR-02)

### What Worked

- Phase decomposition was clean: gesture → query → URL state in strict order with clear dependencies
- TDD for url-state.ts (Phase 91 Plan 1) — test-first caught the `parseInt(0) || null` elevation bug before code review found it independently
- Code review as a mandatory final gate caught 2 critical bugs and 3 warnings that static grep tests and type checking didn't surface

### What Was Inefficient

- The `_restoreBoundsSelection` sidebarOpen-first pattern was planned as a feature (91-02-SUMMARY key decisions) but the code reviewer correctly flagged it as a bug (CR-02) — planning and review contradicted each other; the reviewer was right
- SUMMARY.md `requirements-completed` frontmatter not populated for Phases 89/90/91-01 — degraded 3-source cross-reference to "partial" for SEL-01–SEL-05 despite those requirements being satisfied

### Patterns Established

- `_clickConsumed` flag for suppressing ghost map-click events after gesture sub-threshold release — reusable for any future gesture handler
- Generation counter reuse (`_selectionDrawnGeneration`) for a second async path's race guard — avoids separate counters when semantics align

### Key Lessons

- When a SUMMARY.md decision contradicts a code review finding, trust the reviewer over the plan doc — planning documents encode intent; review documents encode reality
- Populate `requirements-completed` in every SUMMARY.md plan, even for "obvious" completions — the 3-source cross-reference at audit time depends on it

---

## Milestone: v3.4 — dbt Full Rewrite

**Shipped:** 2026-05-14
**Phases:** 4 (85–88) | **Plans:** 14 | **Tasks:** 27 | **Timeline:** ~2 days (2026-05-13 18:08 → 2026-05-14 09:43)

### What Was Built

- **Phase 85 Pre-Cutover Groundwork**: resolved the v3.3 awkward-fit tests — `WHERE id IS NOT NULL` filter in `stg_inat__observations` (TEST-01); replaced `int_ecdysis_base.ecdysis_id` cross-type `relationships` test with a custom singular test (TEST-02). CLEAN-01 FORMAT CSV macro retained with documented override D-03 (FORMAT GDAL adds incompatible `name` key; FORMAT JSON breaks bare-scalar structure; FORMAT CSV is the only DuckDB COPY path emitting raw VARCHAR verbatim). 33→30 column drop landed atomically across `marts/schema.yml`, `marts/occurrences.sql`, `src/sqlite.ts`, and `test_dbt_diff.py` (CLEAN-02).
- **Phase 86 Port Remaining Transforms**: `species_export.py` rewritten as a thin dbt-mart consumer (reads 18-col `sandbox/species.parquet`, appends slug via `feeds._slugify`, emits 19-col public parquet + byte-comparable `species.json` + `seasonality.json`). Occurrence-links join + projection moved to dbt (`int_ecdysis_base` LEFT JOINs `stg_ecdysis__occurrence_links` source; `int_waba_link` computes `specimen_observation_id`). LIN-05 lineage coverage enforced via `test_lin05_lineage_coverage.sql` singular test (≥0.95 ratio; 100% in prod). PORT-04 ingestion-boundary doc codifies that HTTP API + procedural policy + rate-limited side-effect work stays Python; pure SQL transforms move to dbt.
- **Phase 87 Incremental Materialization Experiment**: 4 timed `dbt build` runs converted `int_combined` from `materialized='table'` → `materialized='incremental'` with ARM 1 watermark + ARM 2 `AND FALSE` skip (the dedup trap). Measured int_combined node 0.236s → 0.132s (~44% local) but wall-clock ~3% on `time` total / ~17% on dbt `Finished` — both below the 30% decision threshold. Recommendation locked in `087-FINDINGS.md`: **keep full rebuilds.** dbt-duckdb 1.10.1 does not support incremental + external materializations (upstream issue #74 open since 2022); the marts (the largest items per build) can't benefit at all.
- **Phase 88 Production Cutover**: `data/run.py` STEPS rewired — `_run_dbt_build` (`subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)` + `shutil.copy2` of `occurrences.parquet`/`counties.geojson`/`ecoregions.geojson` from `target/sandbox/` to `EXPORT_DIR`) replaces the `export.py` callsite. `species_export.py` kept as a non-transform post-step. `_apply_migrations` deleted (both schema-rename invariants from Phases 47/48 now live in dbt `sources.yml` contracts — compile-time `Binder Error` on regression). `scripts/validate-schema.mjs` retired end-to-end (file + `package.json` + `.github/workflows/deploy.yml`). `data/nightly.sh` confirmed correct (no functional changes needed). Manual frontend smoke approved 2026-05-14 against dbt-produced parquet (map/filters/table/species page all green; zero console errors).

### What Worked

- **The pre-experiment-SHA rollback marker pattern composed cleanly across phases** — Phase 87 invented `pre-experiment-sha.txt` as a single-file rollback target; Phase 88 reused the same shape as `pre-cutover-sha.txt` (44a967c) for the entire milestone. Both phases' verification asserts `git diff $PRE_SHA -- <file>` empty as the strongest possible rollback gate. Promote to standard for any phase that mutates production-relevant files.
- **Phase 87 as a deliberately small spike paid off** — single SQL file edit + 4 timed builds + 1-section recommendation doc; 2 plans / 2 waves. The recommendation was readable as one section by Phase 88's planner without re-running anything. The temptation to add `int_species_universe` as a secondary subject was deliberately resisted (research called it zero-signal, planner agreed) and that discipline kept the phase to 17 minutes of measurement work.
- **Audit-before-archive caught a real bookkeeping drift** — `/gsd-audit-milestone 3.4` surfaced that Phase 85 and 86 checkboxes in ROADMAP.md's v3.4 `<details>` block were still unchecked despite both phases being on-disk-complete with passing VERIFICATIONs. The on-disk state was correct; the ROADMAP display was wrong. The audit also confirmed all 15 REQ-IDs satisfied via 3-source cross-reference and walked end-to-end integration (nightly.sh → run.py → dlt → dbt → species_export → feeds → S3 → frontend) with zero blockers found.
- **The human-verify checkpoint pattern was correctly used in Phase 88 Wave 3** — Plan 088-03 declared Task 2 as `checkpoint:human-verify` with a clear 4-surface protocol (map renders / filters work / table populates / species page works). The executor properly stopped at `## CHECKPOINT REACHED` and waited for sign-off. The frontend smoke genuinely can't be automated (it requires human eyes on a real map render); making it an explicit gate rather than hand-waving past it was load-bearing.
- **dbt source contracts replaced runtime migration checks with stronger compile-time gates** — `_apply_migrations()` ran at runtime, detecting drift after the fact. `sources.yml` + staging models give `Binder Error` at `dbt build` time, before any data is written. Strictly stronger gate; this pattern carries forward to any future schema rename.

### What Was Inefficient

- **The Phase 88 plan-checker didn't include CI as a verification surface** — local invariants passed but two real defects landed in main and broke the first deploy: (a) `_data/species.js` reads `public/data/species.json` at Eleventy build time, but `public/data/` is gitignored and `data/nightly.sh` was only uploading 3 artifacts to S3 (not `species.json` / `seasonality.json`), so CI had nothing to fetch; (b) two stale tests (`src/tests/seed-species-photos.test.ts:280`, `src/tests/validate-species.test.ts:159`) still asserted the pre-CUTOVER-03 build chain. Hotfix (`4bb79c7`) was small but the cost was a failed CI run + ~15 min of diagnostic. A planner pre-check that runs `npm run build` against a clean checkout would have caught both.
- **SKIP-guarded tests masked a long-standing assertion bug** — `test_species_parquet_schema_matches` (added Phase 086-01) asserted `sandbox == public` schema equality for `species.parquet`, ignoring that `species_export.py` deliberately appends the `slug` column post-dbt (sandbox=18 cols, public=19 cols). SKIP guard kept it green because the sandbox/public split didn't always have both files. When Phase 88 Wave 2 made both files coexist, the SKIP cleared and the executor surfaced a Rule-1 fix mid-execution rather than a clean run. Recoverable but worth flagging — a SKIP-guarded test is silent failure waiting to happen.
- **`state.complete-phase` SDK call mangled STATE.md twice** — once after Phase 87 (set `milestone_name: milestone`, dropped the phase-name suffix from Current Position), once during milestone-close. Both needed hand-reverts. The SDK call reports `updated: [Status, Last Activity]` but also rewrites frontmatter fields not in that list. Worth filing upstream.
- **Big push gap aggregated three milestones at once** — 385 commits between `origin/main` (Phase 75 / v3.1 / 2026-04-30) and HEAD. v3.2 (Species Tab) and v3.3 (dbt Spike) had never been deployed. The first deploy of v3.4 was thus the first integration test of v3.2's `_data/species.js` build-time data dependency in CI. The CI gap had been latent for three milestones; pushing v3.2 alone would have caught it when the fix was small and isolated.
- **Browser HTTP cache collided with the 33→30 column schema migration** — at deploy time, users with cached pre-migration parquet ran the new frontend (CREATE TABLE has 30 cols) against the cached old parquet (33 cols including `specimen_inat_login`), producing `INSERT INTO occurrences (..., specimen_inat_login, ...) → "table has no column named specimen_inat_login"`. Shift-reload + disable-cache fixed it; the durable fix is hash-versioned URLs (tracked at `.planning/todos/pending/hash-versioned-parquet-urls.md`). This will recur at every milestone schema migration until that todo lands.

### Patterns Established

- **Pre-cutover SHA rollback marker** — `git rev-parse HEAD > .planning/phases/<N>/pre-<X>-sha.txt` in the first task of a risky phase; verification asserts byte-identical restore against that SHA. Single-commit rollback target. Reused Phase 87 → Phase 88.
- **Worktree-off for phases touching untracked binary state** — `workflow.use_worktrees=false` for phases that read/write `data/beeatlas.duckdb` (untracked, 117 MB, lives in workspace but not in git). Phase 87 and 88 both used this. Should become a per-phase planner flag, not a session-level config mutation (the manual revert at end of session is fragile).
- **Standalone findings/cutover doc as the durable deliverable** — `087-FINDINGS.md` and `088-CUTOVER-LOG.md` are artifacts the next phase's planner reads directly. Separate from `VERIFICATION.md` (about the phase meeting its own goal) and `SUMMARY.md` (per-plan execution recap). For phases whose output is a decision or a mapping, this is the right shape.
- **dbt source contracts as schema-rename gates** — runtime `_apply_migrations()` → compile-time `Binder Error` via `sources.yml`. Stricter, earlier, automatic.

### Key Lessons

- **CI is a verification surface that plan-checkers should consider** — a `npm run build` dry-run on a clean checkout would have caught both v3.4 deploy defects. Worth promoting to a checker dimension, especially for phases that touch package.json, .github/workflows/, or Eleventy `_data/`.
- **Browser HTTP cache + schema migrations don't mix without explicit URL versioning** — every milestone schema migration will require users to shift-reload until hash-versioned URLs ship. The current heuristic-cache behavior is correct for offline use; the fix is to version the schema-bound URLs, not to tighten cache headers.
- **Don't let executor config mutations leak across phase boundaries** — `workflow.use_worktrees=false` was manually restored after each of Phase 87 and 88. An executor crash between disable and restore would corrupt the next phase's run. Better shape: per-run flag (`--no-worktrees`) that lives in spawn context, or executor-cleanup hook that restores on exit.
- **Push at every milestone close, not only the *important* ones** — v3.2 alone, even with no live user-visible change, would have surfaced the `_data/species.js` ⇄ CI ⇄ S3 dependency two milestones ago when the fix was isolated to that milestone's diff. Three-milestone push aggregation is brittle.
- **Audit-before-complete is cheap insurance** — 5 minutes of `/gsd-audit-milestone` at close prevents 30 minutes of "wait, was Phase 86 finished?" Default to running it.
- **SKIP-guarded transitional tests are latent bugs** — if a test SKIPs because preconditions aren't met, it's not asserting; the moment preconditions are met you discover whatever assertion bug was already there. Acceptable for short-lived transitional tests, but the lifetime should be bounded.

### Cost Observations

- ~25 subagent dispatches across the milestone (researcher × 4, pattern-mapper × 4, planner × 5 incl. revisions, plan-checker × 6 incl. revisions, executor × 10 incl. resumption, verifier × 4, integration-checker × 1).
- Model mix: planner on Opus 4.7 (per init config); researcher / pattern-mapper / plan-checker / executor / verifier on Sonnet 4.6; orchestrator on Opus 4.7. Zero Haiku usage.
- Notable inefficiency: failed first deploy + hotfix loop cost ~15 min triage + a second CI build run. Would have been avoided by a CI-aware plan-checker.
- Notable efficiency: Phase 87's 2-plan scope held against the temptation to bundle a second optimization. Single-subject spikes converge fast.
- Operational footnote: nightly.sh local re-run took 17 min, with **838s (14 min) spent in `resolve-taxon-ids`** — the iNat taxon-resolution step is the unambiguous bottleneck on cold or stale-cursor runs. Matches the rate-limit pattern v3.2 documented for the photo-seed script. No action item; just data.

### Carry-forward Notes for v3.5+

- The v3.4 close-out generated 4 new pending todos (`stale-public-data-cleanup`, `retire-stub-handler`, `dlt-pipeline-state-housekeeping`, `hash-versioned-parquet-urls`) plus inherits the pre-existing 2 (`nightly-run-failure-notification`, `cluster-selection-visual-feedback`, `boundary-edge-gaps`). All low/medium priority. The hash-versioned-URLs todo has the most user-visible payoff (eliminates the milestone-deploy hard-refresh requirement); the others are pure housekeeping.
- v3.3 retrospective is missing from this file — recorded directly in `.planning/milestones/v3.3-ROADMAP.md` instead but never made it here. Worth backfilling at some point.

---

## Milestone: v3.2 — Species Tab

**Shipped:** 2026-05-05
**Phases:** 7 (Phases 76–82, with INSERTED Phase 77) | **Plans:** 34 | **Timeline:** 4 days (2026-05-02 → 2026-05-05)

### What Was Built

- **Phase 76 Data Foundation**: `canonicalize()` 5-step pure helper as universal join key; checklist ingestion with reconcile-and-warn synonym pattern; full iNat ancestor walk → `taxon_lineage_extended`
- **Phase 77 Lineage Coverage Expansion (INSERTED)**: iNat taxon resolver with D-02 filter ladder + D-03 rank fallback; bridge table as durable cache; `--refresh-lineage` flag; LIN-05 ≥95% threshold pinned by deterministic fixture
- **Phase 78 Pipeline Outputs**: `species.parquet` / `species.json` / `seasonality.json` (single source of truth for downstream Eleventy); 556 byte-stable SVGs (sha256 idempotent); slug-byte-equal across SVG / parquet / URL
- **Phase 79 Photo Manifest**: TOML manifest with license whitelist; build-time validator; one-shot seed script with bare-entry repurge recovery loop after 429 burst
- **Phase 80 Page Scaffolding**: `/species/` page in own Vite chunk (1.34 KB / 100 KB gate); ARCH-04 source-analysis test enforces species/SPA boundary
- **Phase 81 Filter UX & Nav**: SSR `<details>`/`<ul>` taxon tree (no-JS navigable) decorated by light-DOM Lit; mute-not-hide filtering; inline-SVG seasonality viz with no chart library; SPA deep-link via shared `buildSpaTaxonLink()` helper with stable `taxon`+`taxonRank` contract
- **Phase 82 Hardening**: bundle-size CI gate; Lighthouse runner (LCP 1312 ms); srcset; a11y; weekly photo-availability cron; UAT both seed use cases PASS

### What Worked

- **Inserting Phase 77 mid-milestone** when Phase 78 research surfaced ~70% NULL family coverage was the right call — fixing the data quality issue first prevented downstream NULL pollution; downstream phase-number bumps (78→ pipeline outputs etc.) cleanly handled by `/gsd-phase --insert`
- **Bridge table as durable cache** (Phase 77) rather than re-fetching every run — `--refresh-lineage` provides escape hatch; rerun produces zero new API calls (verified by test)
- **Shared `_slugify`** between feeds.py and species_export.py — byte-equal slugs across SVG filename, parquet column, and URL eliminated an entire class of routing bugs
- **`canonicalize()` as a pure function with module-level pre-compiled regexes** (mirrors `data/feeds.py::_slugify`) — TDD RED → GREEN with 16 unit tests covering per-step behavior, idempotence, and TAX-04 disagreement fixture
- **ARCH-04 source-analysis test** before any species-page code shipped — caught the species/SPA boundary regression risk at the test layer rather than at bundle inspection (PITFALLS #7 mitigation: one accidental import balloons chunk from ~50 KB to ~2 MB)
- **SSR-first taxon tree** (`<details>`/`<ul>`) decorated by light-DOM Lit — preserves no-JS navigability, prototype-identity test confirmed Lit upgrade preserves SSR markup; pnwmoths pattern verbatim
- **Bare-entry repurge-and-rerun recovery loop** when iNat enforced tighter rate limits than documented (231 HTTP 429s at 1000ms; cleared at 1500ms) — programmatic fix-only-the-broken-rows pattern is reusable for any future incremental data-fetch repair
- **Light-DOM Lit + `createRenderRoot() → this`** preserves SSR-rendered markup across upgrade — a real-world pattern enabled by v3.1's Eleventy + Vite scaffolding
- **Mute-not-hide (opacity 0.35) for filtered cards/branches** — UAT validated this preserves volunteer orientation vs `display: none`; principle worth carrying forward

### What Was Inefficient

- **The `:host` selector mismatch on filtered card muting** (commit 195232d) wasn't caught until UAT — descendant selector targets card hosts, NOT the page's `:host`; the original CSS was applied at the wrong shadow boundary, a pattern that the v1.9 ARCH tests don't cover
- **Photo seed at 1000ms pacing hit a 231-HTTP-429 burst** (against documented iNat 1 req/sec limit) — discovery during live seed run; required the `--rate-ms` CLI flag and recovery loop. A pre-emptive rate-test against a small species set would have caught it
- **Species cards stacking via grid-area collision** (commit 032a29c) was a CSS regression introduced by the layout CSS in 082-02; would have been caught earlier with a Percy-style visual test
- **UAT surfaced three issues** (T3 cross-route anchors, T5 number-input months, T7 ambiguous month suffix) requiring three follow-up patches — earlier playthroughs against the seed use cases during Phase 81 execution would have surfaced these before "execute" closed; the `gsd-discuss` round caught taxonomy-quality risks but not UX-flow risks
- **`data/manifest_drift_report.json` is absent at milestone close** because the cron runs weekly — PERF-04 SC explicitly accepts this as informational, but the artifact's first appearance is post-ship

### Patterns Established

- **Inserting a coverage/quality phase between research and implementation** when a downstream research surfaces a data-quality showstopper — the bridge-cache pattern (Phase 77) generalizes to any future `--refresh-X` cache that benefits from zero-API-call reruns
- **Pure-function pipeline helpers with TDD-first** (canonicalize, _slugify) — the join key is the contract; making it a single pure function with shared regexes prevents drift between consumers
- **SSR-then-decorate** for accessibility-critical UI — server-render the navigable structure, then upgrade with Lit; `createRenderRoot() → this` for shadow-DOM-free decoration; aria attributes synced via `details` toggle event
- **Source-analysis tests for bundle isolation invariants** (ARCH-04 extends ARCH-03 from v1.9) — `readFileSync` + import grep is fast, deterministic, and catches the regression at the test layer
- **TOML manifest authored, not fetched** — for any data that depends on iNat or another rate-limited source, the manifest pattern (validator + seed script + license whitelist) decouples the build from third-party uptime; `validate-X` build-chain step gates the manifest

### Key Lessons

- **Pre-emptive rate testing pays off**: when integrating with a documented-rate-limited API, run a small probe before a full sweep — the documented rate may not be the enforced rate
- **Architectural invariants belong at the test layer**: ARCH-04 protects v3.2's chunk-isolation contract against future drift the same way ARCH-03 protects v1.9's coordinator/presenter boundary; both are cheap, deterministic, and impossible to "forget" at review time
- **UAT against the seed use cases should run during phase execution**, not just at milestone close — the seed use cases ARE the success criteria; running them earlier would have surfaced T3/T5/T7 with one fewer roundtrip
- **`gsd-tools summary-extract` remains unreliable** (sixth consecutive milestone with this issue) — write MILESTONES.md and RETROSPECTIVE.md accomplishments directly from reading SUMMARY.md frontmatter; CLI extraction is not the path

### Cost Observations

- 218 commits across 4 days at very high cadence (Phase 80–82 in single day each)
- Tooling enabled the cadence: `/gsd-phase --insert`, ARCH-04 source-analysis pattern reused from v1.9, light-DOM Lit pattern reused from v3.1 bee-header
- Reuse of v2.1 `_slugify`, v3.1 layout chain, and v1.9 ARCH test pattern represents the largest efficiency win — none of these patterns required re-design

---

## Milestone: v2.7 — Unified Occurrence Model

**Shipped:** 2026-04-17
**Phases:** 4 (Phases 62–65) | **Plans:** 8 | **Timeline:** 1 day (2026-04-17)

### What Was Built
- Phase 62: `export.py` full outer join producing `occurrences.parquet` (25 columns); `validate-schema.mjs` updated; 6 TDD tests written first; ecdysis.parquet + samples.parquet removed
- Phase 63: `sqlite.ts` loads single `occurrences` table; `loadAllTables` renamed to `loadOccurrencesTable`; `buildFilterSQL` rewritten to return single `{ occurrenceWhere }` clause; all 167 tests pass
- Phase 64: `OccurrenceSource` replaces `EcdysisSource` + `SampleSource`; `SelectionState` discriminated union added to bee-atlas; spatial cluster restore unified; test mocks updated
- Phase 65: `bee-occurrence-detail` new component with null-omit rendering; `layerMode` eliminated from `url-state.ts`, `filter.ts`, all UI components; `bee-specimen-detail` + `bee-sample-detail` deleted; `bee-table` unified column set

### What Worked
- TDD-first approach in Phase 62 (6 failing tests before implementation) caught schema issues early and made verification straightforward
- The four-phase structure cleanly separated pipeline (62), data layer (63), map layer (64), and UI (65) — each phase had a clear input/output contract that made planning straightforward
- Discriminated union `SelectionState` in Phase 64 was the right design: eliminates if/else on `layerMode` throughout the coordinator

### What Was Inefficient
- `gsd-tools summary-extract` again returned file paths instead of one-liner descriptions from SUMMARY.md frontmatter — MILESTONES.md accomplishments required manual correction (fifth consecutive milestone with this issue)
- Phase 63 included a `layerMode` discriminator clause in `buildFilterSQL` that Phase 65 then removed from the coordinator — a sign that the boundary between phases 63 and 65 wasn't perfectly clean; minor rework

### Patterns Established
- Full outer join with column-nullability is the right pattern for unified occurrence models when sources have disjoint schemas; don't try to coerce both schemas into a single nullable table at the query layer
- `null-omit` rendering in Lit: render each field as a conditional template literal or `nothing` — cleaner than conditional CSS or empty string checks
- When removing a concept (`layerMode`) that crosses many files, tackle it top-down: data layer → map layer → UI coordinator → presenters; each layer can be verified independently

### Key Lessons
- `gsd-tools summary-extract` is unreliable for one-liners; write MILESTONES.md accomplishments directly from reading SUMMARY.md files
- The unified model made Phase 65 simpler than expected — deleting `bee-specimen-detail` and `bee-sample-detail` was net negative lines, not an addition

---

## Milestone: v2.6 — SQLite WASM Migration

**Shipped:** 2026-04-17
**Phases:** 3 (Phases 59–61) | **Plans:** 5 | **Timeline:** 2 days (2026-04-16 → 2026-04-17)

### What Was Built
- Phase 59: Inline `performance.now()` + `performance.memory` instrumentation in `duckdb.ts`; `BENCHMARK.md` created with two-column comparison table; baseline recorded: 539ms instantiate, 1941ms tablesReady, 613ms first-query, 18.7MB heap peak
- Phase 60: `sqlite.ts` module (wa-sqlite MemoryVFS + hyparquet); `wa-sqlite.d.ts` hand-written; all 6 test files updated; features.ts, filter.ts, bee-atlas.ts migrated from DuckDB Arrow API to wa-sqlite exec callbacks; 5 SQL dialect rewrites; 3 browser bugs found and fixed during E2E verification
- Phase 61: `@duckdb/duckdb-wasm` + `apache-arrow` removed; `duckdb.ts` deleted; `@types/node` made explicit in tsconfig; BENCHMARK.md filled; 165 tests passing

### What Worked
- Phase 60's browser E2E verification checkpoint (plan 60-03) caught all three runtime bugs before shipping — Vite pre-bundling, Asyncify reentrance, and hyparquet Date binding; all three required production fixes that unit tests couldn't catch
- The three-phase structure (benchmark → migrate → cleanup) kept each phase cleanly scoped; phase 61 was entirely mechanical once phase 60 was verified

### What Was Inefficient
- `gsd-tools milestone complete` CLI failed to extract accomplishments from SUMMARY.md files for the fourth time — returned wrong field content rather than meaningful one-liners; MILESTONES.md required manual rewrite again
- Phase 61 discovery that duckdb.ts was already orphaned (not imported) meant the expected bundle size reduction didn't happen — plan claimed "measurably smaller bundle" but Vite never included DuckDB WASM files; a quick import search before planning would have caught this

### Patterns Established
- wa-sqlite with Vite: always add `optimizeDeps.exclude: ['wa-sqlite']` — Vite pre-bundling breaks WASM URL resolution for packages that load WASM files at runtime
- Serialize all `sqlite3.exec` calls through a microtask queue when using Asyncify build; concurrent exec calls cause Asyncify reentrance (SQLITE_OK returned prematurely from interrupted step)
- hyparquet returns JS `Date` objects for DATE parquet columns; wa-sqlite cannot bind these — convert to ISO strings before INSERT

### Key Lessons
- The `gsd-tools summary-extract` extraction is consistently unreliable for MILESTONES.md; write one-liners manually from SUMMARY.md content at milestone close rather than relying on CLI extraction
- Before writing migration plans, verify that the module being replaced is actually imported in the bundle — an orphaned module inflates perceived impact

## Milestone: v2.3 — Specimen iNat Observation Links

**Shipped:** 2026-04-13
**Phases:** 4 (Phases 48–51) | **Plans:** 4 | **Timeline:** 2 days (2026-04-12 → 2026-04-13)

### What Was Built
- Phase 48: Atomically renamed `inat_observation_id` → `host_observation_id` across 12 source files (Python, TypeScript, schema gate, test fixtures) via DuckDB `ALTER TABLE` + SQL `SELECT AS` for local parquet
- Phase 49: `data/waba_pipeline.py` — dlt pipeline with `field:WABA=` filter, `inaturalist_waba_data` isolated schema, incremental `updated_at` cursor; 1,374 observations fetched on first run
- Phase 50: `waba_link` CTE added to `export.py` — joins WABA OFV catalog numbers to ecdysis `catalog_number` numeric suffix via `regexp_extract`; 1,347 specimens matched in production; `MIN(waba.id)` dedup; schema gate updated
- Phase 51: `specimenObservationId` threaded through full frontend data flow (OL feature, DuckDB SELECT, Specimen interface); camera emoji link (📷) rendered conditionally in sidebar; 3 Vitest render tests

### What Worked
- Following the existing `hostObservationId` pattern exactly for `specimenObservationId` — no design decisions needed, just mechanical extension; phase 51 completed in 7 minutes
- `regexp_extract(catalog_number, '[0-9]+$')` for the join key was a clean discovery — WABA OFV stores bare integer suffix, not the full `WSDA_` prefix
- Isolating the WABA pipeline with `pipeline_name="waba"` / `dataset_name="inaturalist_waba_data"` from day one prevented any cursor state pollution with the existing iNat pipeline

### What Was Inefficient
- `gsd-tools milestone complete` CLI failed again to extract accomplishments from SUMMARY.md frontmatter (returned "Task 1 — Source file renames:" from wrong position in phase 48 summary) — MILESTONES.md required manual correction for the third milestone in a row
- REQUIREMENTS.md checkboxes were never updated during execution — all 9 requirements showed "Pending" at close despite being complete; the traceability table is not being maintained during phase execution

### Patterns Established
- `MIN(waba.id) GROUP BY catalog_suffix` is the canonical dedup pattern when multiple records can match a single specimen via an observation field value
- WABA OFV field_id=18116 stores the numeric suffix of the Ecdysis catalog number — document in pipeline config comments, not just plan notes

### Key Lessons
- Requirement checkbox hygiene: update REQUIREMENTS.md traceability status during or immediately after each phase execution, not just at milestone close
- The `gsd-tools summary-extract` one-liner extraction is fragile for summaries that don't have a clean frontmatter `one_liner` field — ensure SUMMARY.md files include a `one_liner` in frontmatter for correct CLI extraction

## Milestone: v2.2 — Feed Discoverability & Pipeline

**Shipped:** 2026-04-12
**Phases:** 3 (Phases 45–47) | **Plans:** 5 | **Timeline:** 2 days (2026-04-11 → 2026-04-12)

### What Was Built
- Phase 45: Sidebar surfaces available feeds from `index.json`; collectors can discover and open personal determination feeds from the map
- Phase 46: Replaced stacked Esri Ocean tile layers with Stadia Maps `outdoors` — zoom 20, terrain, roads, trails
- Phase 47: Rewrote geographies pipeline with DuckDB `ST_Read`/`ST_Transform`; eliminated geopandas OOM; native `geom GEOMETRY` columns throughout

### What Worked
- Wave 1 executor for phase 47 applied the geometry_wkt→geom migration atomically across all consumer files — recognized that partial execution would cause runtime failures and handled it proactively
- Code review caught 3 real bugs (NULL propagation in GREATEST(), missing INSTALL spatial, sys.path double-import) that would have caused silent failures

### What Was Inefficient
- WR-03 fix (extract WKT constants to fixtures.py) introduced a bare `from fixtures import` that broke in a package context — required a follow-up fix for relative imports
- REQUIREMENTS.md for v2.0 was never archived when v2.0 completed; carried stale unchecked requirements into v2.2 close

### Patterns Established
- DuckDB `ST_Read('/vsizip/<path>/<stem>.shp')` + `ST_Transform(geom, prj_wkt, 'EPSG:4326', true)` is the canonical pattern for shapefile ingestion going forward
- Tests in a package with `__init__.py` must use relative imports (`from .fixtures import`) not bare module names

### Key Lessons
- When atomically applying related changes across wave boundaries, the executor made the right call — avoiding partial failure is more important than strict wave isolation
- Always check import style (relative vs absolute) when extracting shared test fixtures in a Python package

## Milestone: v2.1 — Determination Feeds

**Shipped:** 2026-04-11
**Phases:** 3 (Phases 42–44) | **Plans:** 3 | **Timeline:** 2 days (2026-04-10 → 2026-04-11)

### What Was Built
- `data/feeds.py`: Atom feed generator for recent determinations — DuckDB read-only query, 90-day window, blank-field exclusion, `ET.tostring+write_text` (avoids BOM)
- Four variant feed families (collector, genus, county, ecoregion) via `write_variant_feed` + `write_all_variants`; `_slugify` for path-traversal-safe filenames; always writes even empty feeds; `write_index_json` produces `feeds/index.json`
- `nightly.sh` refactored to delegate to `run.py` (replaces inline Python heredoc); `aws s3 sync` uploads entire `feeds/` directory to S3
- `<link rel="alternate" type="application/atom+xml">` autodiscovery tag in `frontend/index.html`
- Pre-existing `test_export.py` fixture failures fixed: missing iNat observation columns + stale `occurrenceID` expectation removed

### What Worked
- Single shared module pattern (phases 42 and 43 both extend `data/feeds.py`) eliminated import gaps — no separate modules to wire together
- The 90-day filter + blank-field exclusion design made the main feed immediately useful without requiring a full data fetch; 14 tests covered all behaviors cleanly
- Spatial joins for county/ecoregion variant enumeration reused existing `geographies` tables — no new data needed
- `nightly.sh` heredoc → `run.py` refactor was clean and added missing pipeline steps (geographies, anti-entropy) for free

### What Was Inefficient
- `gsd-tools milestone complete` CLI failed again to extract accomplishments from SUMMARY.md frontmatter (returned "One-liner:" placeholders) — MILESTONES.md required manual correction for the second milestone in a row

### Patterns Established
- **`ET.tostring(encoding='unicode') + write_text`**: avoids BOM that `ET.write(..., encoding='utf-8')` emits; use this pattern for all Atom/XML generation
- **Always-write variant feeds**: even feeds with 0 entries should be written as valid empty Atom (not skipped); feed readers handle empty feeds; missing files are confusing
- **Enumerate from geographies tables, not 90-day window**: county/ecoregion variant enumeration uses the full geographies table, not what appeared in recent data — ensures consistent file set across pipeline runs

### Key Lessons
1. **`milestone complete` accomplishment extraction is broken** — two milestones in a row the CLI returned "One-liner:" placeholders. Always manually write MILESTONES.md accomplishments after running the CLI.
2. **Refactoring shell heredocs to `run.py` delegation is always worth it** — `nightly.sh` had drifted from `run.py`; consolidating added missing steps and made the pipeline single-source-of-truth.
3. **Test fixture columns must track production schema** — the `inaturalist_data.observations` fixture was missing 3 columns that `export.py` LEFT JOINs; schema drift in fixtures is silent until the join is exercised.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 2 days
- Notable: Smallest milestone by LOC (+2,682/−157); clean sequencing (core → variants → wiring) with no rework

---

## Milestone: v2.0 — Tabular Data View

**Shipped:** 2026-04-08
**Phases:** 3 (Phases 39–41) | **Plans:** 6 | **Timeline:** 3 days (2026-04-06 → 2026-04-08)

### What Was Built
- `UiState.viewMode` ('map'|'table') in `url-state.ts` with default-omit URL pattern; `bee-sidebar` view toggle row; `bee-atlas` conditional render switching between `<bee-map>` and `<bee-table>`
- `<bee-table>` LitElement: DuckDB-backed pagination via `queryTablePage` (100 rows/page), layer-mode column sets (`SPECIMEN_COLUMN_DEFS` / `SAMPLE_COLUMN_DEFS`), row count indicator, filter integration, sticky header
- `queryTablePage` and `queryAllFiltered` in `filter.ts` — shared `buildFilterSQL` clause builder; allowlist-based SQL injection protection for column names
- CSV export: `buildCsvFilename` (priority-based slugified naming: taxon > collector > year > county/ecoregion), `Download CSV` button in pagination bar, browser blob download in `bee-atlas._onDownloadCsv`
- Post-audit fix: `_runTableQuery` added to DuckDB-ready `firstUpdated` callback so direct-URL `?view=table` populates the table without requiring a round-trip through map view
- SQL injection fix for ecdysis ID validation (Phase 39 code review): `.filter(id => /^\d+$/.test(id))` applied before URL-controlled IDs are interpolated into SQL
- 111 tests total (up from 63); 48 new tests across url-state, filter, and bee-table

### What Worked
- Audit-before-complete workflow caught two real issues: the direct-URL table bug and the undocumented TABLE-05 removal. Both fixed before tagging.
- Phase 41 was genuinely small (1 plan, ~15 min) — CSV export composed cleanly on top of the Phase 40 data layer; no rework needed
- `buildCsvFilename` priority logic (taxon > collector > year > county/ecoregion) was well-specified in context doc; implemented correctly on first attempt with 13 tests

### What Was Inefficient
- Sort-by-column (TABLE-05) was implemented in Phase 40 data layer then silently removed in a subsequent UI refactor — the SUMMARY.md claimed it was shipped but the code didn't have it. The discrepancy was caught by the integration checker during audit, not during the phase. Feature removal should update the phase summary and requirements immediately.
- The gsd-tools `milestone complete` CLI failed to extract accomplishments from SUMMARY.md files (returned "One-liner:" placeholders for 5 of 6 entries) — required manual correction of MILESTONES.md.

### Patterns Established
- **Post-milestone audit catches integration gaps**: the `gsd-audit-milestone` → integration checker pipeline found the direct-URL startup bug that phase verification missed (each phase passed its own verification; the gap was cross-phase)
- **`_runTableQuery` in DuckDB-ready path**: any component that starts hidden (not rendered on page load) cannot rely on `data-loaded` from other components; must trigger its own query in the DuckDB init path

### Key Lessons
1. **Feature removals must update SUMMARY.md and REQUIREMENTS.md at removal time** — not at audit time. A SUMMARY that claims a feature was shipped when it was subsequently removed creates false confidence.
2. **The integration checker is worth running even on small milestones** — the direct-URL table bug was a one-line fix but would have been a confusing user-visible defect for anyone bookmarking a table URL.
3. **Plan the "what if viewMode=table on first load" case explicitly** — components that start hidden in one app mode need an explicit initialization trigger; the `data-loaded` event pattern only works for the default mode.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 3 days
- Notable: 3-phase milestone with clean phase sequencing (URL state → component → export); each phase built directly on the previous with no rework

---

## Milestone: v1.9 — Component Architecture & Test Suite

**Shipped:** 2026-04-04
**Phases:** 6 (Phases 33–38) | **Plans:** 13 | **Timeline:** 4 days (2026-03-31 → 2026-04-04)

### What Was Built
- `frontend/src/url-state.ts`: pure module extracting URL serialization from `bee-map.ts`; typed `buildParams`/`parseParams` with zero component or DOM imports
- `frontend/src/bee-atlas.ts`: `<bee-atlas>` coordinator LitElement owning all app state (filter, selection, URL, layer mode, boundary mode); `bee-map` and `bee-sidebar` receive state via properties and emit events up
- `bee-map.ts` refactored to pure presenter: 9 `@property` inputs, 11 `CustomEvent` outputs; no shared state reads; `updated()` as OL synchronization boundary
- `bee-sidebar.ts` decomposed into 4 Lit sub-components: `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail`, `bee-sidebar` (thin layout shell)
- Monotonic generation counter in `_runFilterQuery` discards stale DuckDB async results — fixes chip-removal filter flash race condition
- Vitest test suite: 63 tests across 4 files — `url-state.test.ts` (20), `filter.test.ts` (13), `bee-sidebar.test.ts` (28 including Lit render tests), `bee-atlas.test.ts` (2 source analysis tests for ARCH-03)
- `readFileSync` source analysis tests enforce ARCH-03 import graph invariant: `bee-atlas.ts` does not import OpenLayers; siblings have no cross-references

### What Worked
- Coordinator pattern (bee-atlas owns state → presenters receive props → emit events up) was the right architectural move — each component is now independently testable
- `readFileSync` source analysis in Vitest for architectural invariants: avoids DuckDB WASM/OL/happy-dom incompatibility while reliably enforcing import graph contracts; tests run fast and are not flaky
- Phase sequencing (33: test infra → 34: state elimination → 35: URL module → 36: coordinator → 37: decomposition → 38: unit tests) matched the dependency graph exactly — no phase was blocked waiting for another
- Gap closure plan (37-03) was the right vehicle for the generation counter race fix — kept the main decomposition plans clean and added complexity only when the race was confirmed
- Nyquist validation retroactively applied after milestone completion — phases 35, 36, 37, 38 all now compliant

### What Was Inefficient
- Phase 33 and 34 directories were cleaned up before archiving — no VERIFICATION.md available for audit; downstream integration checks had to substitute. Phase directory cleanup should happen after milestone archiving, not before.
- The chip-removal flicker fix (generation counter) required a gap closure plan because the async race wasn't anticipated in the Phase 37 plan — the pattern (`lastFilterGeneration` counter) is a standard async-task-cancellation technique that could have been preemptively included.
- MILESTONES.md reported "4 phases, 7 plans, 13 tasks" but v1.9 was actually 6 phases and 13 plans — the milestone complete tool counted only phases with surviving directories, not the full 33-38 range.

### Patterns Established
- **Coordinator + pure presenter pattern**: one coordinator LitElement owns all app state; sibling presenters have zero cross-imports; enforced via `readFileSync` import-graph test
- **`updated(changedProperties)` as OL sync boundary**: fire targeted OL operations only when relevant properties changed; replaces ad-hoc watchers and avoids over-triggering
- **Monotonic generation counter for async-results races**: increment counter before async call; check on return; discard if counter has advanced — standard pattern for any async query that can be superseded
- **`readFileSync` source analysis tests in Vitest**: check architectural invariants without needing DOM or DuckDB; runs in <1ms; survives refactors that rename symbols

### Key Lessons
1. **Archive phase directories after milestone completion, not before** — VERIFICATION.md files are the audit evidence. Cleaning up directories before the milestone audit creates documentary gaps that require extra inference work.
2. **Async task cancellation is a standard pattern, not an edge case** — any component that fires async queries on user input (filter changes, chip removal) will race. Plan for a generation counter or AbortController from the start.
3. **Source analysis tests are the right tool for import graph contracts** — AST-based or string-search tests on the actual files are more reliable than "trust the developer" documentation for architectural invariants like sibling isolation.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 4 days
- Notable: 6-phase milestone with 63 tests delivered in 4 days; coordinator pattern established a clean foundation for future component additions

---

## Milestone: v1.8 — DuckDB WASM Frontend

**Shipped:** 2026-04-01
**Phases:** 3 (Phases 30–32) | **Plans:** 5 | **Timeline:** 1 day (2026-03-31 → 2026-04-01)

### What Was Built
- `frontend/src/duckdb.ts`: DuckDB WASM EH-bundle singleton with `getDuckDB()` / `loadAllTables()`; ecdysis + samples via HTTP parquet scan; counties + ecoregions via fetch+registerFileBuffer+read_json; `tablesReady` promise gates feature creation
- `EcdysisSource` + `SampleSource` VectorSource subclasses: query DuckDB `SELECT` on load; replace hyparquet `ParquetSource`/`SampleParquetSource`; `hyparquet` removed from package.json
- `frontend/src/filter.ts`: `buildFilterSQL()` composes SQL WHERE clause from FilterState; `queryVisibleIds()` returns `{ecdysis: Set<string>|null, samples: Set<string>|null}`; `setVisibleIds()` updates module-level singletons
- `frontend/src/style.ts`: OL style callbacks switched from `matchesFilter(f)` to `visibleEcdysisIds?.has(id) ?? true`; `matchesFilter()` removed
- `frontend/src/bee-map.ts`: all filter call sites rewired to await `queryVisibleIds`; URL restore, polygon click, boundary mode, and clear-filters all call `_runFilterQuery()`; loading overlay held until filter applied
- Gap fixes (32-03): `countySource.loadFeatures()` + `ecoregionSource.loadFeatures()` at module scope in `region-layer.ts` for eager fetch; `_setBoundaryMode(mode, skipFilterReset=false)` to preserve county/ecoregion selections when called from `_applyFilter`

### What Worked
- Phase sequencing (30: init, 31: feature creation, 32: filter layer) was clean — each phase produced working, verifiable output before the next started
- DuckDB WASM EH bundle choice (vs threads) avoided CloudFront header changes — correct architectural choice made in research before writing a line of code
- Pre-joined county/ecoregion_l3 columns in parquet meant no spatial SQL needed — the v1.5 pipeline investment paid off here
- 3-phase milestone in 1 day — the DuckDB WASM direction was well-researched and the data model was already right

### What Was Inefficient
- Two UAT failures required a gap closure plan (32-03): county/ecoregion dropdowns empty on load and sidebar counts not updating. Both root causes were OL VectorSource lazy-loading and `_setBoundaryMode` clearing filterState — both were foreseeable at planning time if the OL VectorSource lazy-fetch behavior had been checked.
- The checkpoint plan 32-02 (human browser test) ran a full UAT that found 2 major issues. Earlier automated testing of the dropdown population path might have caught gap 1 before UAT.

### Patterns Established
- **OL VectorSource with `url` option is lazy** — `loadFeatures()` must be called explicitly if the source is attached to an invisible layer and needed for UI population before the layer becomes visible
- **DuckDB WASM spatial extension cannot read registered URL files** — load GeoJSON via `fetch()` → `registerFileBuffer()` → `read_json()` instead
- **`buildFilterSQL()` returns plain SQL string** — DuckDB WASM `query()` does not support parameterized queries; string interpolation with input validation is the correct approach for client-side trusted filter state
- **tablesReady Promise as initialization contract** — any module that queries DuckDB must await `tablesReady` before issuing queries; this is the clean boundary between init and use

### Key Lessons
1. **Check OL source lifecycle before wiring `once('change')` handlers** — if the source's layer starts invisible, the source never fetches and the handler never fires. Either call `loadFeatures()` eagerly or check layer visibility in the handler.
2. **Trace filter state mutation before writing `_applyFilter`** — any method called inside `_applyFilter` that also mutates filterState will produce silent wrong results. Map the full mutation chain before planning.
3. **DuckDB WASM bundle choice is architectural, not a detail** — EH vs threads vs MVP bundles have different constraint profiles (COOP/COEP, SharedArrayBuffer, size). Decide in research, not mid-implementation.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 1 day
- Notable: Fastest DuckDB integration possible — research from memory (DuckDB direction already in project memory) meant no external research phase needed

---

## Milestone: v1.7 — Production Pipeline Infrastructure

**Shipped:** 2026-03-30
**Phases:** 5 (Phases 25–29) | **Plans:** 5 | **Timeline:** 10 days (2026-03-20 → 2026-03-30)

### What Was Built
- CDK Lambda stub: `DockerImageFunction` (Python 3.14), `EventBridgeScheduler` (nightly iNat + weekly full), Lambda Function URL; S3 round-trip verified live
- Production Lambda handler + Dockerfile: uv multi-stage build, env-var pipeline dispatch, DuckDB /tmp round-trip, S3 export, CloudFront invalidation
- `data/nightly.sh` cron on maderas: full pipeline → export → S3 upload → DuckDB backup → CloudFront invalidation (~2.5 min); Lambda execution path abandoned
- pytest suite: 13 tests, programmatic DuckDB fixture (embedded WKT constants), export.py integration tests, `_transform()` and `_extract_inat_id()` pure function unit tests
- Frontend runtime fetch: CloudFront `/data/*` cache behavior (CORS, Origin in cache key, Range headers); bundled Parquet/GeoJSON removed; loading/error overlay
- CI simplified: `fetch-data.yml` deleted; `deploy.yml` is checkout → install → validate-schema (CloudFront Range) → build; no AWS credentials in build job

### What Worked
- Lambda CDK deployment went smoothly — stub approach (verify S3 round-trip before real handler) de-risked infra before touching pipeline code
- Using embedded WKT string constants (not a committed binary `.duckdb`) for test fixtures was clean — avoids binary-in-git, programmatic fixture is self-documenting
- Pivot decision was fast: Lambda blockers (OOM, timeout, read-only fs) were concrete and immediate; maderas cron was a drop-in replacement; no sunk cost paralysis
- Phase sequencing (25: infra, 26: handler, 27: tests, 28: frontend, 29: CI) was the right order — each phase built on verified prior work

### What Was Inefficient
- Lambda was attempted and abandoned (Phases 25–26): geographies OOM, 15-min timeout, read-only filesystem, missing home directory, iNat auth all blocked Lambda. Two phases of work produced CDK infrastructure that isn't the execution path. These phases validated the infra design but the execution pivot was costly.
- asyncBufferFromUrl `{ url }` vs bare string bug in Phase 29 was a hyparquet API detail that should have been caught in research — cost one debug cycle

### Patterns Established
- **Lambda stub before real handler**: deploy a no-op stub that validates infra assumptions (S3 round-trip, env vars, timeout) before writing real handler code
- **monkeypatch.setattr over env var for module-level globals**: if a module reads a global at import time, env var override is unreliable — monkeypatch the attribute directly in pytest
- **hyparquet asyncBufferFromUrl**: requires `{ url }` object form, not bare string — document at call site
- **CloudFront CORS + Range**: CachePolicy must include Origin in allowList (not CACHING_OPTIMIZED) AND S3 CORS must expose Content-Range/ETag headers — both required together

### Key Lessons
1. **Validate Lambda constraints before committing to the execution path** — OOM, filesystem, timeout, and network auth all need confirming with real workloads before architecture lock-in. A "Lambda viability check" plan at the start would have caught these faster.
2. **Embedded WKT string constants are better than committed DuckDB binaries** — programmatic fixtures using string literals are self-documenting, diffable, and don't grow the repo with binary data.
3. **CloudFront CORS + Range is a two-part configuration** — CachePolicy and S3 CORS must both be configured together or Range requests will fail silently for cross-origin fetches.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 10 days
- Notable: Lambda pivot mid-milestone was the right call despite the sunk cost; maderas cron runs 6x faster than Lambda would have

---

## Milestone: v1.5 — Geographic Regions

**Shipped:** 2026-03-27
**Phases:** 4 (Phases 16–19) | **Plans:** 20 | **Timeline:** 4 days (2026-03-14 → 2026-03-18)

### What Was Built
- `data/spatial.py`: `add_region_columns()` — two-step geopandas sjoin (within + sjoin_nearest fallback); handles three coordinate column conventions; EPSG:32610 for deduplication; applied to both ecdysis and iNat pipelines
- `data/scripts/build_geojson.py`: GeoJSON boundary generator with download-if-missing, WA filter, 0.006° simplification; produces `wa_counties.geojson` (56 KB) and `epa_l3_ecoregions_wa.geojson` (357 KB)
- `scripts/validate-schema.mjs`: county and ecoregion_l3 added to CI schema contract for both parquets
- `frontend/src/region-layer.ts`: OL VectorLayer backed by GeoJSON county and ecoregion sources; transparent fill for interior hit detection
- `frontend/src/filter.ts`: FilterState extended with `selectedCounties` and `selectedEcoregions` Sets; AND-across-types / OR-within-type semantics in `matchesFilter()`
- `frontend/src/bee-map.ts`: `boundaryMode` @state with 3-state toggle; polygon singleclick with specimen/sample click priority; bm=/counties=/ecor= URL round-trip; single-select (replace) and shift-click multi-select with blue highlight; sample dot ghosting outside selected regions
- `frontend/src/bee-sidebar.ts`: boundary toggle (Off/Counties/Ecoregions); county and ecoregion datalist autocomplete with removable chips; Clear filters extended to reset region Sets

### What Worked
- TDD-first approach for spatial join (Phase 16-01 test scaffold before implementation) gave concrete contracts — add_region_columns(), build_county_geojson(), build_ecoregion_geojson() all had test-defined signatures before being written
- Committing GeoJSON boundary files to git (not generating at CI time) was the right call — eliminated workflow complexity and S3 download risk in CI
- CRS validation in research phase caught the EPA shapefile non-EPSG CRS issue before it could produce silently wrong results — the `.to_crs('EPSG:4326')` fix was pre-emptive
- Gap closure plans (18-03: regenerate parquets with region columns; 18-04: polygon highlight) kept the core plans clean and added complexity only when confirmed needed
- Module-level county/ecoregion options with Set deduplication (Phase 19) was a clean sidebar implementation — 80 ecoregion features → 11 unique names computed once

### What Was Inefficient
- Phase 18 required two gap closure plans: parquet regeneration (18-03) was necessary because the live S3 parquets predated the spatial join, and polygon highlight (18-04) was easier to scope after seeing the base filter working. Both were predictable at planning time — the "gap closure" framing worked but earlier scoping would have been cleaner.
- The ROADMAP.md showed Phase 18 as "🚧 in progress" past completion — state tracking between plans lagged the actual execution state.

### Patterns Established
- **EPA L3 ecoregion CRS**: always call `.to_crs('EPSG:4326')` before sjoin; non-EPSG spherical Lambert AEA is silent wrong-results risk
- **Nearest-polygon fallback**: ~0.9% of WA specimens fall outside ecoregion boundaries; sjoin_nearest on EPSG:32610 is the fix; apply after 'within' sjoin
- **OL polygon hit detection**: transparent `Fill(rgba 0,0,0,0)` required for interior clicks; OL only hit-detects rendered pixels
- **Polygon click priority**: check specimen/sample hits BEFORE polygon click handler; polygon-first swallows specimen clicks when boundary overlay is active
- **vite.config.ts geojson plugin**: `readFileSync + export default; map: null` — pattern reusable for any static JSON asset type

### Key Lessons
1. **CRS validation before any spatial join** — any shapefile from an external source should have its CRS inspected and converted to EPSG:4326 before joining. Silent wrong results from Lambert AEA coordinates treated as lat/lon are hard to diagnose.
2. **Commit boundary files to git, not to CI** — for static geographic reference data that changes infrequently, committing to git is simpler than S3 download steps in CI. The 413 KB total is well within git budget.
3. **Transparent fill is not optional for polygon click** — OL hit detection is pixel-based. A polygon with no fill is invisible to clicks in its interior; must use rgba(0,0,0,0) fill.

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 4 days
- Notable: 7-plan Phase 16 was the most complex single phase in the project; TDD scaffold in plan 1 kept the subsequent implementation plans well-targeted

---

## Milestone: v1.3 — Specimen-Sample Linkage

**Shipped:** 2026-03-12
**Phases:** 2 (Phases 11–12) | **Plans:** 4 | **Timeline:** Single day

### What Was Built
- `data/ecdysis/occurrences.py`: `occurrenceID` added to `ecdysis.parquet` column selection (pd.StringDtype)
- `data/links/fetch.py`: full links pipeline — `fetch_page`, `extract_observation_id`, `run_pipeline`; two-level skip (links.parquet then disk HTML); ≤20 req/sec rate limit; BeautifulSoup CSS selector `#association-div a[target="_blank"]`; 11 unit tests
- `scripts/cache_restore_links.sh` + `scripts/cache_upload_links.sh`: S3 persistence mirroring the v1.2 iNat cache script pattern
- `package.json` scripts: `cache-restore-links`, `cache-upload-links` (fetch-links was added by Phase 11); `build-data.sh` extended with cache restore → fetch → cache upload block

### What Worked
- TDD stub approach (Phase 11 creates failing tests, Phase 12 makes them pass) gave a clear implementation target and caught the `last_fetch_time` initialization bug before any real HTTP requests
- Reusing the existing `cache_restore.sh` / `cache_upload.sh` pattern made Phase 12 trivial — same structure, same S3 path conventions, same `|| echo` / `set -euo pipefail` asymmetry
- The research phase correctly identified the prototype bug (UUID `occurrenceID` used as `occid` URL param instead of integer `ecdysis_id`) before any code was written — saved a silent wrong-data bug
- Two waves across two plans kept concerns cleanly separated: foundation + tests (11-01) vs. implementation (11-02)
- `cd "$REPO_ROOT"` before npm commands in build-data.sh was anticipated in the plan (integration checker flagged it as a noteworthy pre-emptive fix)

### What Was Inefficient
- No VERIFICATION.md produced (verifier disabled in config) — integration checker filled the gap but this required manual audit work at milestone completion
- Phase 11 VALIDATION.md scaffolded but `nyquist_compliant` never updated to true — Nyquist validation was left in draft state throughout
- Phase 12 had no research phase (planned without it) and no VALIDATION.md — acceptable for a purely mechanical wiring phase, but consistency would be cleaner

### Patterns Established
- Use integer DB id (`ecdysis_id`) not UUID string (`occurrenceID`) for Ecdysis individual record page URLs — UUID is the DarwinCore identifier, integer is the database key used in URLs
- TDD: create failing test stubs in one plan, implement in the next — even for short milestones this gives a clean pass/fail test gate
- `last_fetch_time = time.monotonic()` (not `0.0`) to enforce rate limit on the first HTTP request, not just subsequent ones

### Key Lessons
1. **Prototype bugs are silent until tested** — the existing `fetch_inat_links.py` prototype was structurally correct but used the wrong ID type as the URL parameter. Research that reads and validates existing code prevents inheriting bugs.
2. **Reusing established patterns is fast** — the S3 cache scripts for v1.3 took ~3 minutes because the v1.2 pattern was well-established. Pattern documentation in PROJECT.md pays forward.
3. **TDD stubs in Phase N, implementation in Phase N+1** — clear contract definition before implementation reduces ambiguity and makes the executor's job mechanical.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 1 day (2026-03-12 — plan + execute + complete)
- Notable: Fastest milestone yet — TDD stubs + established patterns kept implementation predictable

---

## Milestone: v1.2 — iNat Pipeline

**Shipped:** 2026-03-11
**Phases:** 3 (Phases 8–10) | **Plans:** 5 | **Timeline:** 2 days

### What Was Built
- `data/inat/observations.py`: field ID constants (SPECIMEN_COUNT_FIELD_ID=8338) confirmed from live API; `extract_specimen_count()` with nullable return
- `data/inat/download.py`: full pyinaturalist pipeline — incremental fetch with `merge_delta`, fallback to full on error, progress logging, 15 unit tests
- `scripts/cache_restore.sh` and `scripts/cache_upload.sh`: S3 cache round-trip with graceful miss handling and hard-fail on upload error
- CI `deploy.yml` updated: `S3_BUCKET_NAME` env at job level, cache-restore/build/cache-upload steps in both build and deploy jobs; credential ordering bug fixed

### What Worked
- Discovery phase (Phase 8) paid off: confirming field_id vs name matching before writing download.py prevented a ~40% data loss bug that would have been subtle to diagnose
- Phase 8's "live API inspection" approach gave concrete constants rather than guesses; OFVS_IN_DEFAULT_RESPONSE confirmed to be True without trial-and-error in Phase 9
- Existing IAM role already covered the S3 cache prefix — no new CDK changes needed (Phase 8 investigation saved wasted Phase 9 work)
- Unit tests for `obs_to_row`, `build_dataframe`, `merge_delta`, and export completeness caught the raw-dict-vs-model-object issue early

### What Was Inefficient
- The pyinaturalist model attribute access approach in the initial download.py plan failed at runtime (raw API dicts needed instead) — a PITFALLS.md entry existed for this but wasn't acted on in initial plan
- Three iNat-related `fix()` commits after Phase 9 completion: `location` is a list not string, raw dicts not model objects, `order_by` conflicts with paginator — these should have been discovered in Phase 8 API inspection
- `observations.ndjson` full-JSON cache was added as a post-milestone quick task — if it had been scoped into v1.2 it could have been done in one plan instead of a retroactive patch

### Patterns Established
- Match iNat observation fields by `field_id` (integer), not `name` string — names can be renamed by project admins; field IDs are stable
- Parse raw API response dicts when pyinaturalist model access is unreliable — `obs['ofvs']` not `obs.ofvs` for observation field values
- S3 cache scripts: use `|| echo "cache miss"` pattern with `set -euo pipefail` to allow graceful miss without aborting the build
- `samples.parquet` stub (zero rows, correct schema) must be committed and force-tracked before any feature branch that references it — prevents CI failure on cold start

### Key Lessons
1. **Discovery phase for external APIs is essential** — field IDs, response shapes, and API version behaviors cannot be reliably inferred from docs alone. A dedicated "confirm from live API" phase step pays for itself immediately.
2. **PITFALLS.md entries need to be in the plan, not just the research doc** — the raw-dict vs model-object pitfall was documented but not surfaced in the Phase 9 plan; it caused post-execution fix commits.
3. **Incremental fetch fallback should catch all exceptions, not just specific ones** — any corrupt cache state or network hiccup should trigger full re-fetch; defensive fallback makes the pipeline robust to unknown failure modes.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 2 days (2026-03-10 planning + execution, 2026-03-11 CI verification + quick task)
- Notable: Phase 8 discovery paid for itself — zero blocked phases, no IAM changes needed, field ID confirmed upfront

---

## Milestone: v1.1 — URL Sharing

**Shipped:** 2026-03-10
**Phases:** 1 (Phase 7) | **Plans:** 5 | **Sessions:** 2

### What Was Built
- URL state synchronization for map view (center/zoom) and all active filters (taxon, year range, months) encoded as query string params
- Shareable URLs: copying the browser URL and opening in a new tab restores the exact same map position and filter state
- Browser back/forward navigation between settled map views (500ms debounce before pushState)
- Multi-occurrence cluster URL encoding: `o=ecdysis:id1,ecdysis:id2` preserves full cluster selection across tabs

### What Worked
- Gap closure workflow caught all real issues: the initial implementation had 2 gaps (back button, o= param) that human verification found; 3 targeted fix plans resolved them cleanly
- Two-phase approach (implement → human verify → gap close → re-verify) gives high confidence without over-engineering upfront
- Plan checker identified the `_isRestoringFromHistory` async timing subtlety before execution, which helped the executor pick the right `map.once('moveend')` approach first try

### What Was Inefficient
- The `_isRestoringFromHistory` bug required gap closure despite the root cause being identified in research — the initial plan didn't fully internalize the async OL moveend timing and produced synchronous reset code
- Three separate o= bugs (strip on load, single-ID encoding, no re-push after restore) could have been caught by a more thorough initial review of `firstUpdated` and the singleclick handler
- PROJECT.md had stale content (NAV-01 listed as Out of Scope for v1.2, Current Milestone still pointing to iNat) — required manual cleanup at milestone completion

### Patterns Established
- `map.once('moveend', ...)` for deferred flag reset after programmatic OL view changes — synchronous reset is wrong, OL fires moveend asynchronously after DOM repaint
- Lit `updated()` pattern for URL-pushed restore props: BeeMap pushes 6 `@property` restore fields; BeeSidebar mirrors to `@state` via `updated()` — clean separation, no prop drilling through OL event callbacks
- Comma-separated IDs in a single URL param (`o=`) for multi-item selection — simpler than multiple params, easy to split/join

### Key Lessons
1. **OL async event timing is subtle** — `moveend`, `singleclick`, and `change` all fire asynchronously. Any guard flag reset or state push that depends on "after OL does X" must use `map.once(event, cb)`, not synchronous code after the OL method call.
2. **Human verification is a first-class plan** — having a dedicated checkpoint plan (07-02, 07-05) with explicit scenarios made gap tracking clean and gave a clear pass/fail record.
3. **URL param stripping on initial load is an easy-to-miss bug** — when implementing URL restore, verify that the first `replaceState` call preserves all incoming params, not just the ones your code "knows about" at that point in initialization.

### Cost Observations
- Model mix: 100% sonnet (executor, planner, checker, verifier all sonnet)
- Sessions: 2 working days (2026-02-25 planning start, 2026-03-09 execution)
- Notable: Single-phase milestone kept orchestrator context very lean; parallel wave 1 (07-03 + 07-04) saved ~3 min vs sequential

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~4 | 6 | Established baseline GSD workflow for this project |
| v1.1 | 2 | 1 | First use of gap closure cycle (human verify → plan gaps → re-verify) |
| v1.2 | 2 | 3 | First external API pipeline; discovery phase proved essential for external data sources |
| v1.3 | 1 | 2 | First scraping pipeline; TDD stub pattern + reuse of established S3 cache scripts made it the fastest milestone |
| v1.5 | 4 | 4 | First geospatial feature; 7-plan pipeline phase + 3-phase frontend stack; gap closure scoped correctly after core confirmed working |
| v1.6 | 1 | 5 | dlt migration; fastest milestone — established patterns made each phase mechanical |
| v1.7 | 10 | 5 | First infra pivot mid-milestone; Lambda abandoned for maderas cron; frontend fully decoupled from build-time data |
| v1.8 | 1 | 3 | DuckDB WASM replaces hyparquet; SQL filter layer; hyparquet removed; all in 1 day on pre-laid foundation |
| v1.9 | 4 | 6 | Coordinator pattern + pure presenters; sidebar decomposed into 4 sub-components; 63-test Vitest suite; generation counter race fix |

### Top Lessons (Verified Across Milestones)

1. Human verification at a checkpoint plan is more reliable than automated checks for browser-interactive features
2. Gap closure plans are cheaper to write and execute than getting everything right the first time — ship, verify, fix
3. Discovery/research phases for external APIs and infrastructure are worth the upfront cost — they prevent blocked implementation phases and post-execution fix commits
4. Prototype validation in research prevents inheriting bugs — reading existing code critically is part of research, not just gathering facts
5. CRS validation is a must-do for any external shapefile — silent wrong results from coordinate mismatch are worse than an obvious error
6. Validate infrastructure execution constraints (memory, timeout, filesystem) with real workloads before committing to an architecture
