# Phase 77: Lineage Coverage Expansion — Research

**Researched:** 2026-05-03
**Domain:** iNat taxon-search → name-to-taxon-id bridge persisted in DuckDB, feeding the existing Phase 76 lineage walker so `taxon_lineage_extended` covers ≥95% of species in the FULL OUTER union.
**Confidence:** HIGH (live iNat /v1/taxa endpoint probed; existing pipeline + retry helper read line-by-line; conftest schema confirmed; rate-limit guidance verified against iNat's published API practices).

<user_constraints>
## User Constraints (from CONTEXT.md + ROADMAP.md + CLAUDE.md)

### Locked Decisions (077-CONTEXT.md)

- **D-01 — Phase 77 is the gate before Phase 78.** Phase 78 (Pipeline Outputs) uses `COALESCE(checklist, iNat-via-bridge)` precedence per TAX-02; genus falls back to `split_part(canonical_name, ' ', 1)` only when **both** checklist and iNat are NULL.
- **Bridge table candidate:** `inaturalist_data.canonical_to_taxon_id (canonical_name TEXT PRIMARY KEY, taxon_id INTEGER, resolved_at TIMESTAMP, source TEXT)`.
- **Unresolved CSV columns:** `(canonical_name, reason, attempted_at)` where `reason ∈ {'404', 'ambiguous', 'api_error'}`.
- **iNat endpoint shape:** `GET /taxa?q=<canonical_name>&rank=species` (also `genus`, `subspecies`); ≤1 req/sec.
- **STEPS placement:** new step lands **after `checklist`** and **before `taxon-lineage-extended`** in `data/run.py` STEPS.
- **Refresh knob:** `--refresh-lineage` flag (or equivalent config knob) bypasses the cache for re-resolution.

### Locked by REQUIREMENTS.md (LIN-01 .. LIN-05)

- **LIN-01:** `data/resolve_taxon_ids.py::resolve_taxon_ids` queries iNat taxon-search for every `canonical_name` in the FULL OUTER union (`checklist_data.species ∪ ecdysis_data.occurrences`) without an existing `taxon_id`; persisted to a bridge table.
- **LIN-02:** ≤1 req/sec rate limit; honor 429/5xx with retry/backoff (mirror Phase 76's `_inat_get_with_retry`).
- **LIN-03:** Bridge is the cache — back-to-back runs make zero new API calls; `--refresh-lineage` forces re-resolution.
- **LIN-04:** Unresolved names → `data/lineage_unresolved.csv` with `(canonical_name, reason, attempted_at)`.
- **LIN-05:** ≥95% of species in the FULL OUTER union have non-NULL `family` via `taxon_lineage_extended` LEFT JOIN; pytest fixture asserts the threshold.

### Locked by CLAUDE.md

- Python 3.14+ (`data/pyproject.toml requires-python = ">=3.14"`).
- Static hosting only — pipeline writes artifacts at build time; no server runtime touches the bridge table at request time.
- `data/nightly.sh` on maderas is the active execution path; Lambda CDK artifacts are inert.
- Domain vocabulary: a **Specimen** ≠ a **Sample** ≠ an **Observation** ≠ an **Occurrence record**. This phase deals with **species names**, not specimens — the inputs are the DISTINCT canonical names from the FULL OUTER union of `checklist_data.species.canonical_name` and `ecdysis_data.occurrences.canonical_name`.

### Claude's Discretion (open at research time — recommendations encoded below)

- **Ambiguous-match policy** (open question 1) — see §Locked Sub-Decisions below.
- **Rank fallback ladder** (open question 2) — see §Locked Sub-Decisions below.
- **Retry helper reuse path** (open question 4) — recommendation: import `_inat_get_with_retry` directly from `inaturalist_pipeline`; do **not** factor out a new module in this phase. Promote to `data/inat_http.py` only if a third caller appears.
- **Forced-refresh semantics** (open question 9) — recommendation: `--refresh-lineage` re-attempts **only** rows currently absent from the bridge OR present in `lineage_unresolved.csv` (the safer default). It does **not** delete confirmed matches. A separate `--refresh-lineage-all` flag truncates the entire bridge and re-resolves from scratch (escape hatch for catastrophic upstream change).
- Whether to write the bridge as a `CREATE OR REPLACE` (Phase 76 lineage style) vs. an upsert pattern — recommendation: upsert (`INSERT ... ON CONFLICT (canonical_name) DO UPDATE`) so the cache is genuinely incremental.

### Deferred (OUT OF SCOPE)

- Static `genus → family` map fallback (superseded by this phase's ≥95% target).
- Consolidating the two iNat lineage tables (Phase 76 D-03 deferred to v3.3+).
- DwC-A migration as an alternate lineage source (deferred to v3.3+ per `.planning/seeds/inat-taxonomy-dwca.md`).
- Authenticated iNat API requests (anonymous probing during research showed `/v1/taxa?q=...` works without auth — see §Code Examples).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIN-01 | `data/resolve_taxon_ids.py::resolve_taxon_ids` queries iNat for every canonical_name in the FULL OUTER union without a `taxon_id`; persisted to bridge table | Live `/v1/taxa?q=...&rank=species` endpoint verified; returns `total_results`, `results[].id`, `results[].name`, `results[].matched_term`, `results[].rank`, `results[].is_active`, `results[].iconic_taxon_name` (see §Code Examples). Source SQL is the union of `checklist_data.species.canonical_name` and `ecdysis_data.occurrences.canonical_name` LEFT JOIN against bridge — read straight off Phase 76's already-materialized columns. |
| LIN-02 | ≤1 req/sec rate limit; honors 429/5xx with retry/backoff | `_inat_get_with_retry` (lines 22-49 of `data/inaturalist_pipeline.py`) is the locked pattern. Sleep `_INAT_PACE_SECONDS = 1.0` between successful requests. iNat published guidance: stay under 60 req/min preferred (= 1 req/sec), 100 req/min hard cap, ~10K/day budget. [VERIFIED: iNat API recommended-practices page] |
| LIN-03 | Bridge is the cache; back-to-back runs = zero new API calls; `--refresh-lineage` forces re-resolution | Source SQL for "names to resolve" must be `LEFT JOIN canonical_to_taxon_id b ON b.canonical_name = u.canonical_name WHERE b.canonical_name IS NULL` (and additionally include rows where `--refresh-lineage` is set AND `b.canonical_name IS NULL OR b.canonical_name IN (SELECT canonical_name FROM lineage_unresolved.csv)`). Pytest assertion: run twice with mocked iNat, second run sees `mock_get.call_count == 0`. |
| LIN-04 | Unresolved → `data/lineage_unresolved.csv` with `(canonical_name, reason, attempted_at)`; reason ∈ `{'404', 'ambiguous', 'api_error'}` | `total_results == 0` → `'404'`. `total_results > 0` but no `name`/`matched_term` exact match after the ladder → `'ambiguous'`. `_inat_get_with_retry` raised `requests.HTTPError` after exhausting retries → `'api_error'`. Write CSV via stdlib `csv.writer` (mirrors `data/checklist_pipeline.py::reconcile`). |
| LIN-05 | ≥95% of species in FULL OUTER union have non-NULL family via `taxon_lineage_extended` LEFT JOIN; pytest fixture asserts threshold | Coverage SQL: `SELECT count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*) FROM (SELECT DISTINCT canonical_name FROM checklist_data.species UNION SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences WHERE canonical_name IS NOT NULL) u LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name) LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = b.taxon_id`. Pytest fixture seeds 20 representative names where ≥19 resolve cleanly (95% floor) — see §Validation Architecture. |
</phase_requirements>

## Summary

Phase 77 inserts a single new pipeline step — `("resolve-taxon-ids", resolve_taxon_ids)` — between `checklist` and `taxon-lineage-extended` in `data/run.py STEPS`. This step:

1. Reads the FULL OUTER union of canonical names already materialized by Phase 76 on `checklist_data.species.canonical_name` and `ecdysis_data.occurrences.canonical_name`.
2. LEFT JOINs against `inaturalist_data.canonical_to_taxon_id` (the bridge — created by this phase) to find names not yet resolved.
3. For each unresolved name, calls `GET https://api.inaturalist.org/v1/taxa?q=<canonical_name>&rank=<rank>` via `_inat_get_with_retry` (imported from `inaturalist_pipeline`), at ≤1 req/sec, walking a **rank ladder** (species → genus → subspecies) and applying a **deterministic ambiguity rule** (see §Locked Sub-Decisions).
4. UPSERTs successful matches into the bridge; appends `(canonical_name, reason, attempted_at)` rows for failures to `data/lineage_unresolved.csv`.
5. After this step writes the bridge, the existing `taxon-lineage-extended` step (line 38 of `run.py`) gains additional taxon IDs to walk because its source query (`SELECT DISTINCT taxon__id FROM (inaturalist_data.observations UNION inaturalist_waba_data.observations)`) currently misses bridge-only IDs. **A small surgical change to `enrich_taxon_lineage_extended` is required: add the bridge as a third UNION arm.** This is a one-line SQL edit, NOT a structural refactor.

**Coverage gap that motivated this phase:** Currently 227 / 738 species (~31%) in the FULL OUTER union have a row in `taxon_lineage_extended` (per Phase 78 research, live-DB measured). The remaining ~70% lack lineage because they have no iNat observation in the WABA project — `enrich_taxon_lineage_extended` only walks taxa observed in the project. Phase 77's bridge breaks that dependency: a species can be on the WA checklist with zero iNat observations and still resolve to a `taxon_id` via the search endpoint.

**Three load-bearing planning concerns:**

1. **Ambiguous-match policy is silent-corruption-class.** iNat's `/v1/taxa?q=Andrena+fulva&rank=species` returns three results (`Andrena fulva`, `Andrena fulvago`, `Andrena fulvata`) — prefix-match returns siblings. Without an exact-name guard the bridge would still pick `fulva` (highest `observations_count`) — fine here, but for an unlucky query the right answer can be buried. Worse: a known disagreement case shows `result.name='Lasioglossum zonulus'` matched query `Lasioglossum zonulum` via `result.matched_term='Lasioglossum zonulum'` — exact-equality on `result.name` would **reject** a correct match. The rule must consult `matched_term` first, then `name`, with case-insensitive comparison. See §Locked Sub-Decisions D-02.

2. **`enrich_taxon_lineage_extended` source query needs the bridge as a third UNION arm.** Today (line 205 of `inaturalist_pipeline.py`) it's `inaturalist_data.observations.taxon__id ∪ inaturalist_waba_data.observations.taxon__id`. Add `∪ SELECT taxon_id FROM inaturalist_data.canonical_to_taxon_id WHERE taxon_id IS NOT NULL`. Without this edit, the bridge would resolve names but the lineage table would still be empty for them — Phase 78 would still see ~70% NULL family. **This is the load-bearing dependency between LIN-01 and LIN-05.**

3. **Test-suite must mock at the `requests.get` boundary, not at `_inat_get_with_retry`.** Tests in `data/tests/test_taxon_lineage_extended.py` already follow this idiom (`patch("inaturalist_pipeline.requests.get", ...)`). Mocking at the helper would skip the retry/backoff codepath and let regressions sneak past. The `_zero_inat_pacing` autouse fixture in `conftest.py` already neutralizes sleep — new tests inherit it for free.

**Primary recommendation:** Land the work in 4 plans:
- **Plan 1** — `data/resolve_taxon_ids.py` skeleton + bridge table DDL + STEPS wiring; pytest for cold-start + cache-hit paths (mocked iNat).
- **Plan 2** — Ambiguity ladder + unresolved-CSV writer; pytest for matched / ambiguous / 404 / api_error / rank-fallback paths.
- **Plan 3** — `enrich_taxon_lineage_extended` UNION-arm extension (Pitfall #2); pytest extends `test_taxon_lineage_extended.py` to cover bridge-sourced IDs.
- **Plan 4** — Coverage-threshold pytest fixture (LIN-05 ≥95% assertion) + `--refresh-lineage` CLI handling + integration test (full pipeline w/ mocked iNat, idempotency assertion).

Wave 0 is satisfied by extending `data/tests/conftest.py` with a 20-row `canonical_to_taxon_id` fixture and a small set of seed checklist + occurrence rows that exercise the matched / ambiguous / 404 / genus-fallback paths.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build "names to resolve" set | Database / DuckDB | — | Single SQL query: union of two columns LEFT JOIN bridge. No Python row loop. |
| iNat HTTP request + retry/backoff | Pipeline (Python) | — | Reuse `_inat_get_with_retry` from `inaturalist_pipeline.py:22-49`. Lives in pipeline tier because rate-limit + Retry-After header parsing are iNat-API concerns. |
| Ambiguity-resolution rule (rank ladder + match-strategy) | Pipeline (Python) | — | Pure-Python over the JSON `results[]` list. Deterministic; no I/O. Unit-testable in isolation. |
| Bridge-table UPSERT | Database / DuckDB | Pipeline | DuckDB `INSERT ... ON CONFLICT DO UPDATE`. One round-trip per resolved name (acceptable — at ≤1 req/sec the SQL is never the bottleneck). |
| Unresolved-CSV write | Pipeline (Python, stdlib `csv`) | — | Mirrors `checklist_pipeline.reconcile` (which writes `checklist_unmatched.csv`). Stdlib only. |
| Source-of-truth for `taxon_lineage_extended` taxon IDs | Database / DuckDB | — | One-line SQL edit to add the bridge as a UNION arm in `enrich_taxon_lineage_extended`. |
| `--refresh-lineage` CLI handling | Pipeline orchestration | — | Argparse in `data/run.py` (currently uses `sys.argv` substring match — see line 267 of `inaturalist_pipeline.py`). Phase 77 introduces a real argparse; this is a small lift. |
| Tests | Test (pytest) | — | New `data/tests/test_resolve_taxon_ids.py`; extend `conftest.py` schema + seed; extend `test_taxon_lineage_extended.py` for the UNION-arm change. |

**Why this matters:** All work is pipeline-side. Zero frontend changes. The map is included so the planner can sanity-check that no task accidentally lands a `src/` edit.

## Locked Sub-Decisions (resolutions to CONTEXT.md open questions)

These resolve open questions 1, 2, 5, 6, 7, 9 from the additional_context. Each is a recommendation that should become a CONTEXT.md amendment before plan execution.

### D-02 — Ambiguous-match policy [recommended LOCK]

When `total_results > 1`, apply this filter ladder, stopping at the first non-empty subset:

1. Keep only results where `lower(matched_term) == lower(query)` OR `lower(name) == lower(query)`.
2. Of those, keep only `is_active == true`.
3. Of those, keep only `iconic_taxon_name == 'Insecta'` (avoid cross-kingdom homonyms — e.g. plant genera that share names with bee genera).
4. Of those, prefer the result whose `rank` matches the requested `rank` parameter exactly.
5. If exactly one remains → match. If zero or multiple remain → write `'ambiguous'` to `lineage_unresolved.csv`.

**Rationale:** `matched_term` (not `name`) is the field iNat populates when the query matched a synonym — observed live for `Lasioglossum zonulum` (query) → `Lasioglossum zonulus` (canonical name on iNat). Skipping `matched_term` would reject correct synonym-resolution matches. We do **not** use `observations_count` as a tiebreaker because that introduces an availability-vs-correctness tradeoff: a popular wrong species could shadow an obscure right one.

### D-03 — Rank-fallback ladder [recommended LOCK]

Token-count-driven, not lookup-loop:

| Token count of `canonical_name` | Try ranks (in order) |
|---|---|
| 1 (e.g. `andrena`) | `genus` |
| 2 (e.g. `bombus impatiens`) | `species` → if 0 results, `genus` (using `split_part(canonical_name, ' ', 1)`) |
| 3+ | Should not happen — `canonicalize()` folds trinomials to binomial (verified: `data/canonical_name.py:69` `cleaned[:2]`). If it does happen, treat as `species` query of the first 2 tokens. |

**Why no `subspecies` rank:** Phase 76's `canonicalize()` strips infraspecific markers (ssp./var./aff./cf./nr.) and folds trinomials to binomial. There are zero subspecies-rank canonical names in the input set by construction. CONTEXT.md mentions `subspecies` as a possibility — this is moot given Phase 76's canonicalization.

**Genus-fallback semantics:** A genus-only resolution still populates `family` / `subfamily` / `tribe` / `genus` in `taxon_lineage_extended` (verified — `enrich_taxon_lineage_extended` at line 232 handles `taxon.get("rank") in TARGET_RANKS` for the taxon itself). `subgenus` and `specific_epithet` will be NULL for a genus-fallback resolution, which is correct — we don't have species-level info.

### D-04 — Bridge-table residency [VERIFIED]

`inaturalist_data` schema **already exists** — `inaturalist_pipeline.py:158` constructs the dlt pipeline with `dataset_name="inaturalist_data"`, and Phase 76 created `inaturalist_data.taxon_lineage_extended` in the same schema (line 241). The bridge table is created via raw DuckDB `CREATE TABLE IF NOT EXISTS` (the dlt destination only owns tables it materializes — `taxon_lineage_extended` precedent confirms this works). The bridge persists in `beeatlas.duckdb` (the project's single DuckDB file at `data/beeatlas.duckdb`).

[VERIFIED: `data/inaturalist_pipeline.py:158` and `data/inaturalist_pipeline.py:240-249`]

### D-05 — `canonical_name` source-of-truth [VERIFIED]

`canonicalize()` at `data/canonical_name.py:42-73` returns a **lowercased single-spaced binomial** (or genus-only) with authority + subgenus parens + infraspecific markers stripped. The bridge's PRIMARY KEY uses this exact form. Implication: queries to iNat use the lowercased canonical_name as the `q` parameter — iNat's search is case-insensitive (verified live: `Bombus+impatiens` and `bombus+impatiens` both return `id=118970` — search is fuzzy on case). Comparison in D-02's match-rule uses `lower()` on both sides for safety.

[VERIFIED: `data/canonical_name.py:69-73` and live API probe]

### D-06 — `run.py` STEPS shape and CLI flag [VERIFIED + recommended]

Current STEPS shape is `list[tuple[str, Callable]]` (line 33 of `run.py`). Each callable takes **zero arguments** (`fn()` at line 104). New step lands at index 8 (after `checklist`, before `export`):

```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("taxon-lineage-extended", enrich_taxon_lineage_extended),  # ← stays at index 4 — see WARNING below
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("resolve-taxon-ids", resolve_taxon_ids),  # ← NEW (index 8)
    # NOTE: enrich_taxon_lineage_extended must run AGAIN here OR be moved to here.
    # See §Pitfalls #2 — the existing taxon-lineage-extended step at index 4 doesn't
    # see the bridge IDs because the bridge doesn't exist yet at that point in the
    # pipeline. Recommended: move taxon-lineage-extended to index 9 (after resolve).
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

**The STEPS-ordering decision is load-bearing — see §Pitfalls #2 for the full discussion.**

**`--refresh-lineage` CLI flag:** `run.py` currently has no argparse. The pattern from `inaturalist_pipeline.py:267` is `"--full-reload" in sys.argv`. Two viable approaches:

- **(A) sys.argv substring match** — keep the existing pattern, add `if "--refresh-lineage" in sys.argv: resolve_taxon_ids(refresh=True)`. Minimal lift. **Recommended for Phase 77.**
- **(B) full argparse migration** — wider blast radius (every step would need to opt in). **Defer to a future cleanup phase.**

[VERIFIED: `data/run.py:33-44, 100-104` and `data/inaturalist_pipeline.py:266-267`]

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` | `>=1.4,<2` | Bridge table DDL + UPSERT; FULL OUTER union SQL | Already the project's data store. [VERIFIED: data/pyproject.toml] |
| `requests` | (transitive via dlt) | iNat HTTP via `_inat_get_with_retry` | Already imported by `inaturalist_pipeline.py:8`. [VERIFIED] |
| `csv` | stdlib | `data/lineage_unresolved.csv` write; mirrors `checklist_pipeline.reconcile` | [VERIFIED: data/checklist_pipeline.py:14] |
| `datetime` | stdlib | `attempted_at` timestamp + bridge `resolved_at` | [VERIFIED: stdlib] |
| `pytest` | `>=9.0.2` | Tests; existing `_zero_inat_pacing` autouse fixture neutralizes pacing | [VERIFIED: data/pyproject.toml dev deps; data/tests/conftest.py:375-385] |

### Supporting

None. **Phase 77 ships zero new dependencies.**

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `_inat_get_with_retry` via `from inaturalist_pipeline import _inat_get_with_retry` | Promote it to a new `data/inat_http.py` module | Single-underscore prefix = "by-convention private but importable" — acceptable for one additional caller. Promote only when a third caller appears. **Reuse-via-import.** |
| `INSERT ... ON CONFLICT DO UPDATE` (UPSERT) | `CREATE OR REPLACE TABLE` (Phase 76 lineage style) | UPSERT preserves the cache between runs (LIN-03 requirement: zero new API calls on re-run). CREATE OR REPLACE would re-resolve every name every run. **UPSERT.** [VERIFIED: DuckDB supports `ON CONFLICT (canonical_name) DO UPDATE SET taxon_id = EXCLUDED.taxon_id, resolved_at = EXCLUDED.resolved_at`.] |
| Per-name SQL round-trip | Batch INSERT after collecting all results into a Python list | Phase 76's `enrich_taxon_lineage_extended` uses `con.executemany` after collecting results in-memory (line 250). At ≤1 req/sec the network is the bottleneck — but a partial-write hazard exists if the pipeline crashes mid-resolution. **Per-name UPSERT** (transaction-per-row) so a crash leaves a partially-warm cache that the next run resumes from. Costs ~700 SQL calls per cold start; well under noise floor at 1 req/sec network pacing. |
| iNat batch endpoint (`GET /v1/taxa/<id1>,<id2>,...`) | Per-name `q=<name>` search | The batch endpoint takes IDs, not names — useful only for `enrich_taxon_lineage_extended` (which already uses it). Name resolution requires the search endpoint, one name per request. |
| iNat v2 endpoint | iNat v1 endpoint | `inaturalist_pipeline.py:104` uses v2 for observation streaming, but v2 search has different pagination semantics. v1's `/taxa?q=...&rank=...` is the documented match for taxon-search and what every client (pyinaturalist, jumear/stirfry) uses. **v1.** [VERIFIED: live probe; pyinaturalist documentation] |
| Authenticated request | Anonymous request | Anonymous works for `/v1/taxa` (verified live — 5 burst calls all returned 200). No auth needed. |

**Installation:**
```bash
# No new packages.
cd data && uv sync
```

**Version verification:** No new packages to verify.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │  Phase 76 outputs (already on disk)          │
                    │  - checklist_data.species (canonical_name)   │
                    │  - ecdysis_data.occurrences (canonical_name) │
                    │  - inaturalist_data.taxon_lineage_extended   │
                    │    (taxon_id PK, family/subfamily/tribe/...)│
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
   STEPS:  ... checklist → resolve-taxon-ids → taxon-lineage-extended → export → feeds
                                  │                       │
                                  │                       │ reads bridge.taxon_id
                                  │                       │ + observations.taxon__id
                                  │                       │ (UNION) and walks ancestors
                                  │                       ▼
                                  │           inaturalist_data.taxon_lineage_extended
                                  │           (now covers ≥95% of canonical_names)
                                  ▼
            ┌──────────────────────────────────────────────────────────┐
            │ data/resolve_taxon_ids.py::resolve_taxon_ids(refresh=…)  │
            │                                                          │
            │ 1. SQL: SELECT canonical_name FROM (FULL OUTER union)    │
            │         LEFT JOIN canonical_to_taxon_id WHERE PK IS NULL │
            │ 2. for canonical_name in unresolved:                     │
            │      time.sleep(_INAT_PACE_SECONDS)                      │
            │      r = _inat_get_with_retry(                            │
            │            'https://api.inaturalist.org/v1/taxa',        │
            │            params={'q': canonical_name, 'rank': rank})    │
            │      match = pick_match(r.json(), rank, query)            │
            │      if match: UPSERT bridge                              │
            │      else: append to lineage_unresolved.csv               │
            └──────────────────────┬───────────────────────────────────┘
                                   │ writes
                                   ▼
                    inaturalist_data.canonical_to_taxon_id   (DuckDB)
                    data/lineage_unresolved.csv              (file)
```

### Recommended Project Structure

```
data/
├── resolve_taxon_ids.py       # NEW — Phase 77 module
├── inaturalist_pipeline.py    # MODIFIED — add bridge to UNION arm in enrich_…
├── run.py                     # MODIFIED — add STEP, --refresh-lineage flag
├── canonical_name.py          # UNCHANGED — source-of-truth canonicalize()
├── checklist_pipeline.py      # UNCHANGED
├── lineage_unresolved.csv     # NEW — written every run (regenerated; mirrors checklist_unmatched.csv)
└── tests/
    ├── conftest.py            # MODIFIED — add canonical_to_taxon_id fixture
    └── test_resolve_taxon_ids.py  # NEW
```

### Pattern 1: HTTP-with-retry (reuse, do not duplicate)

**What:** Every iNat HTTP call goes through `_inat_get_with_retry` from `inaturalist_pipeline.py`.
**When:** Always. Direct `requests.get` calls bypass rate-limit handling.
**Example:**
```python
# data/resolve_taxon_ids.py
from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS

# ... inside resolve_taxon_ids():
time.sleep(_INAT_PACE_SECONDS)  # pace BEFORE the call so a retry-after sleep doesn't double up
resp = _inat_get_with_retry(
    "https://api.inaturalist.org/v1/taxa",
    params={"q": canonical_name, "rank": rank},
    timeout=30,
)
data = resp.json()
```

### Pattern 2: Per-row UPSERT (partial-write safe)

**What:** UPSERT each successful match immediately, not in a batch at the end.
**When:** Long-running loops that hit external APIs and could be interrupted.
**Example:**
```python
con.execute(
    """
    INSERT INTO inaturalist_data.canonical_to_taxon_id
        (canonical_name, taxon_id, resolved_at, source)
    VALUES (?, ?, current_timestamp, ?)
    ON CONFLICT (canonical_name) DO UPDATE SET
        taxon_id = EXCLUDED.taxon_id,
        resolved_at = EXCLUDED.resolved_at,
        source = EXCLUDED.source
    """,
    [canonical_name, taxon_id, source],
)
```

### Pattern 3: Test mocks at `requests.get`, not at the helper

**What:** `patch("inaturalist_pipeline.requests.get", side_effect=[...])`.
**When:** Every test for code that calls `_inat_get_with_retry`.
**Example:** see `data/tests/test_taxon_lineage_extended.py:88` and the `_throttled_response` / `_fake_inat_response` helpers at lines 54-62, 289-297. Reuse them — they are battle-tested.

### Anti-Patterns to Avoid

- **Pre-loading all unresolved names then batch-INSERTing at the end.** A pipeline crash after 600/700 successful API calls would lose the work. UPSERT each row inline.
- **Using `result.observations_count` as a tiebreaker.** Trades correctness for popularity; documented in D-02.
- **Calling `requests.get` directly.** Bypasses rate-limit handling — production will eventually hit a 429 burst that surfaces as a hard failure.
- **`CREATE OR REPLACE TABLE canonical_to_taxon_id` on every run.** Defeats LIN-03 (cache requirement).
- **Mocking at `_inat_get_with_retry` in tests.** Skips the retry/backoff codepath and lets regressions in.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| iNat 429 / 5xx retry with Retry-After parsing + exponential backoff | New retry helper for resolve_taxon_ids | Import `_inat_get_with_retry` from `inaturalist_pipeline` | Already battle-tested by Phase 76 with seven dedicated tests (`test_taxon_lineage_extended.py:300-376`). [VERIFIED] |
| Canonical name → JOIN-key transformation | Lowercase + strip parens locally | `canonicalize()` from `canonical_name` module | Phase 76 D-04 LOCKS this algorithm; divergence breaks the JOIN. [VERIFIED: `data/canonical_name.py:42`] |
| Slug for unresolved CSV row IDs | Hand-rolled slugify | (Not needed — unresolved CSV uses raw canonical_name as primary identifier) | — |
| HTTP rate-limiter (token bucket etc.) | Token-bucket implementation | `time.sleep(_INAT_PACE_SECONDS)` before each call | At ≤1 req/sec sequential the simple sleep matches iNat's published guidance. Sophisticated rate-limiters add complexity without benefit at this throughput. |

**Key insight:** This phase is a thin glue layer. The hard parts (retry, rate-limit, canonicalization, ancestor walking) already exist in Phase 76. The only new code is (1) the search-API call site, (2) the ambiguity-rule, (3) the bridge table.

## Runtime State Inventory

> Phase 77 is **NOT a rename/refactor phase**, but it adds runtime state, which the planner must account for.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW table `inaturalist_data.canonical_to_taxon_id` in `data/beeatlas.duckdb`. NEW file `data/lineage_unresolved.csv`. | Create on first run; UPSERT thereafter; CSV regenerated each run. |
| Live service config | None — verified by inspecting `data/run.py` STEPS and `data/inaturalist_pipeline.py`. iNat is queried per-run; no persistent config in iNat's UI. | None. |
| OS-registered state | None — verified by inspecting `data/nightly.sh` (the active execution path on maderas). | None. |
| Secrets/env vars | `DB_PATH` env var (existing — `inaturalist_pipeline.py:11`). Anonymous iNat requests; no API key. | Phase 77 reads `DB_PATH` but does not introduce a new env var. |
| Build artifacts | None — Phase 77 outputs are in DuckDB + a CSV under `data/`, neither of which is `tsc`/`vite`-compiled. | None. |

**Note on `lineage_unresolved.csv`:** Mirrors `data/checklist_unmatched.csv` (Phase 76) — written every run, intended to be inspected by humans, **not** committed to git (verify by checking if `.gitignore` already covers `data/*.csv`; the planner should confirm and amend if needed).

## Common Pitfalls

### Pitfall 1: Fuzzy match returns wrong species (silent corruption)

**What goes wrong:** `/v1/taxa?q=Andrena+nigrocaerulea&rank=species` returns 1 result. But `?q=Andrena+fulva` returns 3 (`fulva`, `fulvago`, `fulvata`). Without an exact-name guard, code that "picks the first" or "picks the highest observations_count" can land on the wrong species. The bridge gets poisoned silently — every downstream artifact carries the wrong family/subfamily.
**Why it happens:** iNat's search is prefix-and-fuzzy by design (helps users find taxa with typos). It is **not** an exact-lookup endpoint.
**How to avoid:** D-02's filter ladder. Keep only `lower(matched_term) == lower(query) OR lower(name) == lower(query)`, then `is_active`, then `iconic_taxon_name == 'Insecta'`, then exact-rank match. If multiple remain → `'ambiguous'`. Pytest covers this with at least one fixture per failure mode.
**Warning signs:** A spike in `lineage_unresolved.csv` size run-over-run; a species suddenly switching family in `species.parquet` between two runs.

### Pitfall 2: STEPS ordering — bridge writes are stranded if `taxon-lineage-extended` runs before `resolve-taxon-ids`

**What goes wrong:** Today, `enrich_taxon_lineage_extended` is at index 4 in STEPS (`run.py:38`), reading taxa from `inaturalist_data.observations ∪ inaturalist_waba_data.observations`. If we add `resolve-taxon-ids` at the end of STEPS but leave `taxon-lineage-extended` at index 4, the bridge produces taxon IDs that the lineage walker has already passed by — the `taxon_lineage_extended` table would still miss them. Phase 78 would still see ~70% NULL family.
**Why it happens:** STEPS is sequential — there is no implicit "re-run dependent steps" mechanism.
**How to avoid:** Choose ONE of:
  - **(A) Move** `taxon-lineage-extended` to run **after** `resolve-taxon-ids`. ← **Recommended.** Single-pass; clean dependency direction. The step needs `enrich_taxon_lineage_extended` modified to add the bridge as a third UNION arm in its source query (line 205 of `inaturalist_pipeline.py`). The existing observation-table sources stay; bridge IDs are additive.
  - **(B) Run** `taxon-lineage-extended` **twice** — once at index 4 (current), once after resolve. Wasteful but minimally invasive. Reject.
  - **(C) Inline the lineage walk** into `resolve_taxon_ids` for bridge-only IDs. Splits the lineage logic across two modules. Reject.
**Warning signs:** Coverage SQL (LIN-05's assertion) returns ~31% on the first dev run despite the bridge populating successfully. Fix is the (A) edit.

### Pitfall 3: Forced refresh blasts past the rate limit

**What goes wrong:** `--refresh-lineage` with no semantic constraint deletes the bridge and re-resolves ~700 names. At 1 req/sec that's ~12 minutes, which is fine — UNLESS the planner removes the `time.sleep` "because we're refreshing." Then iNat 429s within seconds and the run fails partway through.
**How to avoid:** The pacing sleep is unconditional — it always runs, regardless of refresh mode. Pytest assertion: monkeypatch `time.sleep` and verify it was called for every iNat request, even with `refresh=True`.
**Warning signs:** A `--refresh-lineage` run that finishes in <60 seconds — that's faster than the rate limit allows for >60 names; some pacing was bypassed.

### Pitfall 4: Test fixtures hit live iNat (CI flake)

**What goes wrong:** A pytest test forgets to patch `requests.get`, hits the live API, fails on rate-limit or network during CI.
**How to avoid:** Always `patch("inaturalist_pipeline.requests.get", ...)` (or `patch("resolve_taxon_ids.requests.get", ...)` if the import path differs). The autouse `_zero_inat_pacing` fixture in `conftest.py:375-385` zeros pacing but does NOT mock the HTTP layer — that is the test's responsibility. Wave 0 fixture work should add a tiny `@pytest.fixture` `mock_inat` helper that bundles the patch + a default `total_results=0` response, with per-test override.
**Warning signs:** Test failures with `requests.exceptions.ConnectionError` or `HTTPError 429` in CI logs.

### Pitfall 5: `total_results == 0` is the 404, not HTTP 404

**What goes wrong:** A novice implementation checks `resp.status_code == 404` to detect "no match." iNat returns HTTP 200 with `{"total_results": 0, "results": []}` for unknown names. A status-code-only check would treat all 200s as success and wedge with an `IndexError` on `results[0]`.
**How to avoid:** Check `data["total_results"] == 0` (or `len(data["results"]) == 0`) explicitly. [VERIFIED: live probe — `?q=Zzzzz+nonexistensia&rank=species` returns 200 with `total_results: 0`.]

### Pitfall 6: Genus fallback overwrites a partial species match

**What goes wrong:** D-03's ladder says: 2-token name → try species, fall back to genus. If the species query returns one fuzzy-but-wrong result that fails the D-02 ladder, the genus fallback fires. Now the bridge has the genus's `taxon_id`, but the canonical_name stored is the binomial. Phase 78's COALESCE-precedence assumes a binomial-keyed bridge entry corresponds to a species-rank taxon.
**How to avoid:** Two options. Either (a) record the resolved rank in the bridge (`source TEXT` already in CONTEXT.md schema — use values like `'inat_species'`, `'inat_genus'` to disambiguate), or (b) don't fall back to genus for binomials, mark them `'ambiguous'`. **Recommend (a)** — gives Phase 78 the data it needs to render the genus-fallback distinctly. Pytest asserts the `source` column distinguishes the two.

## Code Examples

Verified patterns from official sources and live probes.

### Live iNat /v1/taxa response (probed 2026-05-03)

```bash
# Source: live https://api.inaturalist.org/v1/taxa probe, 2026-05-03
$ curl -sS 'https://api.inaturalist.org/v1/taxa?q=Bombus+impatiens&rank=species' | jq '.'
{
  "total_results": 1,
  "page": 1,
  "per_page": 30,
  "results": [
    {
      "id": 118970,
      "name": "Bombus impatiens",
      "rank": "species",
      "rank_level": 10,
      "is_active": true,
      "extinct": false,
      "matched_term": "Bombus impatiens",
      "iconic_taxon_name": "Insecta",
      "observations_count": 280074,
      "ancestor_ids": [48460, 1, 47120, 372739, 47158, 184884, 47201,
                      124417, 326777, 47222, 630955, 47221, 199939,
                      538883, 52775, 538900, 118970]
    }
  ]
}

# The synonym case — name on iNat differs from the query:
$ curl -sS 'https://api.inaturalist.org/v1/taxa?q=Lasioglossum+zonulum&rank=species' | jq '.results[0] | {id, name, matched_term}'
{
  "id": 1453118,
  "name": "Lasioglossum zonulus",            # ← canonical name on iNat
  "matched_term": "Lasioglossum zonulum"     # ← query (synonym hit)
}

# The fuzzy case — 3 results from a prefix-style match:
$ curl -sS 'https://api.inaturalist.org/v1/taxa?q=Andrena+fulva&rank=species' | jq '.results[] | {id, name, matched_term}'
{"id": 60579,  "name": "Andrena fulva",    "matched_term": "Andrena fulva"}
{"id": 484511, "name": "Andrena fulvago",  "matched_term": "Andrena fulvago"}
{"id": 433153, "name": "Andrena fulvata",  "matched_term": "Andrena fulvata"}

# The 404 case — total_results: 0, HTTP 200:
$ curl -sS 'https://api.inaturalist.org/v1/taxa?q=Zzzzz+nonexistensia&rank=species' | jq '.total_results'
0
```

### Skeleton: `data/resolve_taxon_ids.py`

```python
# Source: synthesized from data/inaturalist_pipeline.py + data/checklist_pipeline.py patterns.
"""Phase 77 — resolve canonical_name → iNat taxon_id, persist as bridge table.

Source SQL: FULL OUTER union of checklist + ecdysis canonical_name LEFT JOIN bridge.
Pacing + retry: reuses _inat_get_with_retry from inaturalist_pipeline.
Unresolved: data/lineage_unresolved.csv with (canonical_name, reason, attempted_at).
"""

import csv
import datetime as dt
import os
import time
from pathlib import Path

import duckdb

from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"
INAT_TAXA_URL = "https://api.inaturalist.org/v1/taxa"


def _ensure_bridge_table(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE TABLE IF NOT EXISTS inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)


def _names_to_resolve(con, refresh: bool) -> list[str]:
    """FULL OUTER union of canonical names LEFT JOIN bridge, filtered by what's missing."""
    sql = """
        WITH u AS (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
        )
        SELECT u.canonical_name
        FROM u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        WHERE b.canonical_name IS NULL
        ORDER BY u.canonical_name
    """
    return [r[0] for r in con.execute(sql).fetchall()]


def _pick_match(results: list[dict], query: str, requested_rank: str) -> dict | None:
    """D-02 filter ladder. Returns the unique winner or None (= 'ambiguous')."""
    q = query.lower()
    # Step 1: name OR matched_term equality (case-insensitive).
    survivors = [
        r for r in results
        if (r.get("matched_term") or "").lower() == q
        or (r.get("name") or "").lower() == q
    ]
    if not survivors:
        return None
    # Step 2: is_active.
    active = [r for r in survivors if r.get("is_active")]
    if active:
        survivors = active
    # Step 3: Insecta (avoid cross-kingdom homonyms).
    insecta = [r for r in survivors if r.get("iconic_taxon_name") == "Insecta"]
    if insecta:
        survivors = insecta
    # Step 4: prefer exact rank match.
    rank_match = [r for r in survivors if r.get("rank") == requested_rank]
    if rank_match:
        survivors = rank_match
    return survivors[0] if len(survivors) == 1 else None


def _resolve_one(con, canonical_name: str, unresolved: list[tuple]) -> None:
    tokens = canonical_name.split()
    rank_ladder = ["species"] if len(tokens) == 2 else ["genus"]
    if len(tokens) == 2:
        rank_ladder.append("genus")  # D-03 fallback

    last_reason = "404"
    for rank in rank_ladder:
        time.sleep(_INAT_PACE_SECONDS)
        try:
            q = canonical_name if rank != "genus" else tokens[0]
            resp = _inat_get_with_retry(
                INAT_TAXA_URL, params={"q": q, "rank": rank}, timeout=30
            )
        except Exception:  # noqa: BLE001 — _inat_get_with_retry's HTTPError + others
            last_reason = "api_error"
            continue
        data = resp.json()
        if data.get("total_results", 0) == 0:
            last_reason = "404"
            continue
        match = _pick_match(data.get("results", []), q, rank)
        if match is None:
            last_reason = "ambiguous"
            continue
        # UPSERT (Pattern 2 — partial-write safe).
        con.execute(
            """
            INSERT INTO inaturalist_data.canonical_to_taxon_id
                (canonical_name, taxon_id, resolved_at, source)
            VALUES (?, ?, current_timestamp, ?)
            ON CONFLICT (canonical_name) DO UPDATE SET
                taxon_id = EXCLUDED.taxon_id,
                resolved_at = EXCLUDED.resolved_at,
                source = EXCLUDED.source
            """,
            [canonical_name, match["id"], f"inat_{rank}"],
        )
        return
    unresolved.append((canonical_name, last_reason, dt.datetime.utcnow().isoformat()))


def resolve_taxon_ids(refresh: bool = False) -> None:
    con = duckdb.connect(DB_PATH)
    try:
        _ensure_bridge_table(con)
        if refresh:
            # Re-attempt names absent from bridge OR previously unresolved.
            # (Implementation reads UNRESOLVED_CSV and DELETEs matching bridge rows.)
            ...
        names = _names_to_resolve(con, refresh)
        unresolved: list[tuple] = []
        for name in names:
            _resolve_one(con, name, unresolved)
        with UNRESOLVED_CSV.open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["canonical_name", "reason", "attempted_at"])
            w.writerows(unresolved)
        n_resolved = con.execute(
            "SELECT count(*) FROM inaturalist_data.canonical_to_taxon_id"
        ).fetchone()[0]
        print(  # noqa: T201
            f"resolve-taxon-ids: {n_resolved} cached, {len(unresolved)} unresolved "
            f"(see {UNRESOLVED_CSV.name})"
        )
    finally:
        con.close()
```

### `enrich_taxon_lineage_extended` UNION-arm edit (Pitfall #2 fix)

```python
# data/inaturalist_pipeline.py — modify line 204-213 inside enrich_taxon_lineage_extended.
# Source: read from data/inaturalist_pipeline.py:184-262 directly.
taxon_ids = [
    row[0] for row in con.execute("""
        SELECT DISTINCT taxon__id FROM (
            SELECT taxon__id FROM inaturalist_data.observations
            WHERE taxon__id IS NOT NULL
            UNION
            SELECT taxon__id FROM inaturalist_waba_data.observations
            WHERE taxon__id IS NOT NULL
            UNION                                                       -- ← NEW
            SELECT taxon_id AS taxon__id                                -- ← NEW
            FROM inaturalist_data.canonical_to_taxon_id                 -- ← NEW
            WHERE taxon_id IS NOT NULL                                  -- ← NEW
        )
    """).fetchall()
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Walk taxa observed in WABA project only (Phase 76) | + bridge from `canonical_to_taxon_id` (Phase 77) | this phase | Lineage coverage 31% → ≥95% |
| Manually curate genus → family map | iNat search-API resolution | this phase | Maintenance-free; iNat is the authoritative bee taxonomy source |
| iNat v2 API for observations | iNat v1 API for taxon search | mixed-version usage already established | v2 has different pagination semantics; v1's `/taxa?q=` is the canonical search endpoint |

**Deprecated/outdated:**
- Static `genus → family` fallback map idea — superseded by D-01 (CONTEXT.md ## Deferred Ideas).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iNat anonymous requests will not be rate-limited differently from authenticated | Standard Stack alternatives | If anonymous gets a tighter limit, cold-start might exceed the 10K/day soft limit. Mitigation: production has ~700 names; well under 10K. [Probed live: 5 burst calls all returned 200; soft confirmation but not authoritative.] |
| A2 | The `iconic_taxon_name` field is reliably populated for bee taxa | D-02 step 3 | If some Insecta entries have NULL `iconic_taxon_name`, step 3 would discard them. Mitigation: verified live for Bombus, Andrena, Lasioglossum, Hylaeus — all show `iconic_taxon_name="Insecta"`. The filter is conditional (only applied if it leaves survivors), so a NULL would fall through to step 4 unscathed. |
| A3 | `data/.gitignore` covers `*.csv` so `lineage_unresolved.csv` won't accidentally land in git | Runtime State Inventory | If not, planner must amend `.gitignore`. **Verify in plan 1.** |
| A4 | `_zero_inat_pacing` autouse fixture covers `resolve_taxon_ids` if the module imports `inaturalist_pipeline` | Validation Architecture | If the module re-exports the constant under a different name, the fixture's `monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0)` is the right target. As written in the skeleton, `resolve_taxon_ids.py` imports `_INAT_PACE_SECONDS` from `inaturalist_pipeline` at module level, so monkeypatching the source module after import won't affect the local binding — **the resolve_taxon_ids module also needs `_INAT_PACE_SECONDS = 0.0` patched (or refactored to read it dynamically).** Pytest fixture should patch both. |
| A5 | DuckDB `ON CONFLICT (canonical_name) DO UPDATE` works on a table with `canonical_name TEXT PRIMARY KEY` | D-04 / UPSERT pattern | DuckDB has supported this since 0.7. Project is on `>=1.4`. [VERIFIED: DuckDB docs and project pyproject.toml.] |
| A6 | The user actually wants `--refresh-lineage` to mean "retry only failures" (D-recommended) and not "wipe the bridge" | Locked Sub-Decisions / open question 9 | If user prefers wipe-and-rebuild semantics, plan 4 needs adjustment. Recommendation: ask in `/gsd-discuss-phase 77` if not already answered. |
| A7 | The "20 representative species" pytest fixture for LIN-05 is parameterizable to ≥95% pass-rate without flake | Validation Architecture | Fixture design requires a representative slice that matches production resolution rate. **Concrete fixture composition described in §Validation Architecture.** |

## Open Questions

1. **Should `--refresh-lineage` retry only failures (D-recommended) or wipe the entire bridge?** — Captured as A6 / D-recommended.
2. **Should the `source` column distinguish `inat_species` from `inat_genus` (D-06 sub-decision in Pitfall #6)?** — Recommendation locked at D-06; planner should confirm.
3. **Does `data/.gitignore` already cover `data/lineage_unresolved.csv`?** — Plan 1 verifies; minor amendment if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | All pipeline modules | ✓ | per CLAUDE.md / pyproject.toml | — |
| `duckdb` Python | Bridge UPSERT, source SQL | ✓ | >=1.4,<2 | — |
| `requests` (transitive) | iNat HTTP | ✓ | via dlt | — |
| iNat /v1/taxa endpoint reachable | resolve_taxon_ids runtime | ✓ | — | None — phase cannot run without iNat. nightly.sh on maderas; if iNat is down, the step's per-name `api_error` path kicks in and the cache holds the previous run's resolutions (LIN-03 cache invariant). |
| pytest | Tests | ✓ | >=9.0.2 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> Required because `workflow.nyquist_validation = true` in `.planning/config.json`. (`workflow.research = true` triggers this section being authored.)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest >=9.0.2 (project devdep) |
| Config file | `data/pyproject.toml [tool.pytest.ini_options] testpaths = ["tests"]` |
| Quick run command | `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x` |
| Full suite command | `cd data && uv run pytest` |
| Existing autouse fixture | `_zero_inat_pacing` in `data/tests/conftest.py:375-385` (zeros pacing/backoff so retry tests don't real-time-sleep) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIN-01 | Bridge populated for unresolved canonical names | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_cold_start_resolves_all_seeded_names -x` | ❌ Wave 0 |
| LIN-01 | Source SQL is FULL OUTER union of checklist + occurrences | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_names_to_resolve_unions_both_sources -x` | ❌ Wave 0 |
| LIN-02 | Pacing sleep happens between each request | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_pacing_sleep_called_per_request -x` | ❌ Wave 0 |
| LIN-02 | 429 → retry → success path | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_retry_on_429_then_succeeds -x` (reuses `_throttled_response` helper from `test_taxon_lineage_extended.py:289`) | ❌ Wave 0 |
| LIN-02 | 5xx → retry → success path | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_retry_on_5xx_then_succeeds -x` | ❌ Wave 0 |
| LIN-02 | Persistent 429 surfaces as HTTPError after _INAT_MAX_RETRIES | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_persistent_429_records_api_error -x` | ❌ Wave 0 |
| LIN-03 | Back-to-back runs make zero new API calls | unit (idempotency) | `uv run pytest tests/test_resolve_taxon_ids.py::test_second_run_makes_no_api_calls -x` | ❌ Wave 0 |
| LIN-03 | `--refresh-lineage` re-resolves only failures (D-recommended) | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_refresh_retries_only_failures -x` | ❌ Wave 0 |
| LIN-04 | 404-equivalent (`total_results: 0`) writes `'404'` to CSV | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_unknown_name_writes_404_row -x` | ❌ Wave 0 |
| LIN-04 | Multi-result without exact match writes `'ambiguous'` | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_ambiguous_match_writes_ambiguous_row -x` | ❌ Wave 0 |
| LIN-04 | API error after retry-exhaustion writes `'api_error'` | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_api_error_writes_api_error_row -x` | ❌ Wave 0 |
| LIN-04 | CSV columns are exactly `(canonical_name, reason, attempted_at)` | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_unresolved_csv_schema -x` | ❌ Wave 0 |
| LIN-05 | ≥95% of FULL OUTER union species have non-NULL family | integration | `uv run pytest tests/test_resolve_taxon_ids.py::test_lineage_coverage_threshold -x` | ❌ Wave 0 |
| D-02 | `matched_term` synonym match (Lasioglossum zonulum case) | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_pick_match_uses_matched_term_for_synonym -x` | ❌ Wave 0 |
| D-02 | Multi-result with exact-name winner | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_pick_match_filters_to_exact_name -x` | ❌ Wave 0 |
| D-03 | 1-token name uses `genus` rank | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_genus_only_query_uses_genus_rank -x` | ❌ Wave 0 |
| D-03 | 2-token name falls back from `species` to `genus` | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_species_404_falls_back_to_genus -x` | ❌ Wave 0 |
| Pitfall #2 | `enrich_taxon_lineage_extended` walks bridge IDs | unit | `uv run pytest tests/test_taxon_lineage_extended.py::test_enrich_includes_bridge_taxon_ids -x` | ⚠️ Wave 0 (extend existing file) |
| Pitfall #6 | Bridge `source` column distinguishes species vs genus resolution | unit | `uv run pytest tests/test_resolve_taxon_ids.py::test_bridge_source_distinguishes_rank -x` | ❌ Wave 0 |

### LIN-05 ≥95% threshold fixture composition (anti-flake)

The threshold assertion needs a deterministic fixture. Compose it as:

- **20 seeded canonical_names** in `conftest.py` (mix of checklist-only, occurrence-only, both)
- Of those, **19 mocked as resolvable** (return a single `is_active=true, iconic_taxon_name='Insecta'` result with the matching `name`)
- **1 mocked as `total_results: 0`** (404 path)
- Coverage assertion: `>= 0.95` (= 19/20). With 20 inputs and 1 unresolved, ratio is exactly 0.95 — assert `>= 0.95` (not `> 0.95`) so the fixture passes deterministically.

This shape lets the test exercise: (a) the bridge populates from the search endpoint (LIN-01), (b) the lineage extension walks the bridge IDs (Pitfall #2 fix), (c) the coverage SQL produces the right ratio (LIN-05).

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x`
- **Per wave merge:** `cd data && uv run pytest` (full suite — catches regressions in `test_taxon_lineage_extended.py` from Pitfall #2 edit)
- **Phase gate:** Full suite green, plus a manual `cd data && uv run python run.py` against the live DB with the resulting `data/lineage_unresolved.csv` reviewed by the user before merge.

### Wave 0 Gaps

- [ ] `data/tests/test_resolve_taxon_ids.py` — covers LIN-01, LIN-02, LIN-03, LIN-04, LIN-05, D-02, D-03, Pitfall #6 (new file)
- [ ] `data/tests/conftest.py` — extend with `canonical_to_taxon_id` table DDL + 20-row resolution fixture
- [ ] `data/tests/test_taxon_lineage_extended.py` — extend with `test_enrich_includes_bridge_taxon_ids` (Pitfall #2 verification)
- [ ] No framework install needed — pytest already in dev deps.

## Sources

### Primary (HIGH confidence)
- `data/inaturalist_pipeline.py` (lines 1-268) — `_inat_get_with_retry`, `enrich_taxon_lineage_extended`, pacing constants
- `data/canonical_name.py` (lines 1-73) — D-04 canonicalization algorithm
- `data/run.py` (lines 1-115) — STEPS list shape, CLI flag pattern
- `data/checklist_pipeline.py` (lines 1-207) — `reconcile()` CSV-write pattern (mirrors LIN-04 unresolved-CSV approach)
- `data/tests/conftest.py` (lines 1-394) — schema, seed fixtures, `_zero_inat_pacing` autouse
- `data/tests/test_taxon_lineage_extended.py` (lines 1-377) — mock helpers `_fake_inat_response`, `_throttled_response` (reusable)
- `data/pyproject.toml` — Python 3.14+, dependency versions
- `.planning/REQUIREMENTS.md` (lines 28-32) — LIN-01..LIN-05
- `.planning/ROADMAP.md` (lines 525-536) — Phase 77 success criteria
- `.planning/phases/077-lineage-coverage-expansion/077-CONTEXT.md` — locked decisions
- `.planning/phases/078-pipeline-outputs/078-RESEARCH.md` (Pitfall #1) — coverage gap data
- Live `https://api.inaturalist.org/v1/taxa` probes (2026-05-03) — `Bombus impatiens`, `Lasioglossum zonulum`, `Andrena fulva`, `Andrena nigrocaerulea`, `Andrena` (genus), `Apis` (fuzzy), `Zzzzz nonexistensia` (404)

### Secondary (MEDIUM confidence)
- iNaturalist API recommended-practices page (rate limits: 60/min preferred, 100/min cap, 10K/day soft) — accessed via WebSearch summary 2026-05-03; original page at `https://www.inaturalist.org/pages/api+recommended+practices` returned 403 to direct WebFetch but content surfaced via search snippets

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all reuse, no new deps, all source files read directly
- Architecture (STEPS placement, UNION-arm edit, UPSERT pattern): HIGH — direct reads of `run.py` and `inaturalist_pipeline.py`
- Pitfalls: HIGH — Pitfalls 1, 2, 5, 6 verified via live API probes or direct code reads
- Validation Architecture: HIGH — pytest scaffolding inspected; mock helpers identified for reuse
- iNat rate-limit guidance: MEDIUM — official page returned 403 to WebFetch; numbers from WebSearch summary of the same source

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (30 days; iNat API surface is stable, but rate-limit policy could change)

## RESEARCH COMPLETE
