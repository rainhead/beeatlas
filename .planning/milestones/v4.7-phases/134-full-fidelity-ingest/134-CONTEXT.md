# Phase 134: Full-Fidelity Ingest - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Load the committed full-fidelity Bartholomew CSV (`final_checklist_records.csv`, 50,646 rows) into a **new** DuckDB table `checklist_data.checklist_records_full` carrying all six target columns (lat, lon, parsed date, recordedBy, locality, verbatim name). Validate coordinates and tag each row with a `coord_flag`; normalize the messy/missing `Date` column into `year`/`month`/`day` integers plus a `date_quality` enum. Add the three v4.7 pip dependencies to `data/pyproject.toml`.

**This is Phase A of the v4.7 DAG — pure Python data ingest, zero architecture-level risk.** It is strictly *additive*. It does NOT touch the dbt model layer, `int_combined`, `occurrences.parquet`, `sqlite_export.py`, or the frontend — all of that is Phases 135–138. There is no "point arm" yet in 134; the literal exclusion of invalid coordinates from the point arm is realized **downstream in Phase 137** by filtering on the `coord_flag` this phase produces.

</domain>

<decisions>
## Implementation Decisions

### Coordinate validation (ING-02)
- **D-01:** WA bounding box is **tight / actual state extent**: `lat ∈ [45.5, 49.0]`, `lon ∈ [-124.85, -116.9]`. No padding for border records.
- **D-02:** **No swap detection or recovery.** Empirically verified against the static file: 0 rows have an impossible latitude (`|lat| > 90`), so no swapped `Latitude`/`Longitude` pairs exist. The redundant `x`/`y` columns are **ignored** — they are a coarser fallback (e.g. rounded `-117.0, 47.0` county centroids), not an authority. 918 rows where `Latitude/Longitude ≠ x/y` are NOT swaps and need no handling.
- **D-03:** The table keeps **all 50,646 rows**; invalid coordinates are **tagged, not dropped**. Add a `coord_flag VARCHAR` column with values `valid` / `null_coord` / `zero_coord` / `out_of_bbox`. (Empirical counts: ~45,927 `valid`, 4,595 `null_coord`, 2 `zero_coord`, 122 `out_of_bbox`.) Keeping all rows satisfies success-criterion #1's "row count ~50,646" and preserves the ~9% no-coord records for the (later) county-fill / non-point uses.
- **D-04:** Log the excluded-coordinate total **plus a per-reason breakdown** (`null_coord` / `zero_coord` / `out_of_bbox`) to build output. No separate excluded-rows sidecar CSV in this phase (discussed and not selected).

### Date normalization (ING-03)
- **D-05:** Store dates as **three nullable integers `year` / `month` / `day`** plus a `date_quality` enum (`full` / `year_only` / `none`). The time component of ISO datetimes is **dropped** (keep only y/m/d).
- **D-06:** **No `verbatim_date` string stored** — parsed integers + `date_quality` only. (This overrides the research SUMMARY's "preserve verbatim_date" suggestion; success-criterion #3 only mandates the three integers + enum, and success-criterion #1's loosely-named `date` column is satisfied by this y/m/d + `date_quality` representation. The Phase 138 detail card reconstructs the displayed date from y/m/d + `date_quality`.)
- **D-07:** `date_quality` classification: `full` = parsed to y/m/d (43,957 rows); `none` = empty/unparseable (6,689 rows). The `year_only` value stays in the enum for robustness/future data but **0 current rows hit it** — the static file contains no year-only, year-range, or year-month entries (verified: `OTHER` bucket = 0).
- **D-08:** Parse **US month-first** for `M/D/YYYY` dates (291 rows; e.g. `6/14/1905` = June 14). Deterministic — use stdlib `strptime('%m/%d/%Y')` or `dateparser` with `DATE_ORDER='MDY'`, never per-row auto-detection.
- **D-09:** Parsing strategy is **stdlib-first**. Empirically stdlib parses **100% of current non-empty dates** (ISO datetime 43,602 + ISO date 64 + M/D/YYYY 291; year span 1812–2022, 248 pre-1900 — all handled by `datetime`/`date`). `dateparser` is retained as the documented fallback tier per research, not the primary parser.

### Old 4-col path transition (ING-01)
- **D-10:** **Add-only.** 134 adds `checklist_records_full` from the new CSV. The old `wa_bee_checklist_records.tsv`, `checklist_data.checklist_records` table, `_load_checklist_records()`, `sources.yml` entry, and `marts/checklist.sql` (county-fill mart) are **left exactly as-is**. Zero risk to the working county-fill build. Retiring the redundant TSV is deferred to a later phase (137/138) once the full table is proven. ING-01's "replacing the 4-column derivation" is the milestone end-state, not a 134 deliverable.

### Dependencies (SC#4)
- **D-11:** Add all three — `dateparser`, `pygbif`, `rapidfuzz` — to `data/pyproject.toml` and confirm they install under Python 3.14 (`uv sync` / `uv add`). `pygbif`/`rapidfuzz` are not *used* until Phase 135 but are added now per success-criterion #4. **Watch item:** `dateparser`'s `regex` dependency wheel for 3.14 (research-flagged MEDIUM). If `dateparser` fails to install on 3.14, surface it as a blocker (SC#4 mandates it) — but note 134's date parsing does not functionally depend on it (D-09).

### Table schema (discretion, research-aligned)
- **D-12:** Preserve the source **`ObjectID`** plus raw `Family` / `Genus` columns in `checklist_records_full` for traceability. The synthetic `checklist_id` (`ROW_NUMBER`) is a later-phase dbt concern (research item 6) — do NOT add it here. `verbatim_name` = the raw `Scientific Name` (with authority), stored unmodified.

### Claude's Discretion
- Exact `coord_flag` column type/ordering, function decomposition within `checklist_pipeline.py`, and table column order are Claude's to decide, consistent with the existing module's style.
- Whether date parsing lives in a helper function vs inline — Claude's call; must be unit-testable (pytest asserts `1812-06-18` and `m/d/yyyy` parse correctly).
- `CREATE OR REPLACE TABLE` full-refresh semantics (mirrors the existing loader's idempotency — no dlt cursor).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 134: Full-Fidelity Ingest" — goal + 4 success criteria
- `.planning/REQUIREMENTS.md` — ING-01, ING-02, ING-03 (current/target framing)

### v4.7 research (HIGH confidence; this phase = "Phase A")
- `.planning/research/SUMMARY.md` — executive summary; "Phase A: Full-Fidelity CSV Ingest" section (rationale, delivers, gate); confirms source file, confirms `coordinateUncertaintyInMeters` and `catalogNumber` are absent
- `.planning/research/STACK.md` — three new pip packages, pyproject.toml delta, rejected-alternatives list, ITIS-offline note (relevant to Phase 135)
- `.planning/research/ARCHITECTURE.md` — `stg_checklist__records_full` / `int_checklist_dedup` / ARM 4 sketches (DOWNSTREAM context — not built in 134; informs the table shape this phase must produce)
- `.planning/research/PITFALLS.md` — coordinate-quality and date-parsing pitfalls (both must be resolved at ingest, per research)

### Code to read before modifying
- `data/checklist_pipeline.py` — the module to extend; existing `_load_checklist_records()` (old 4-col loader, leave untouched), `CHECKLIST_RECORDS_PATH`, `load_checklist()` entry point, `CREATE OR REPLACE` idempotency pattern
- `data/canonical_name.py` — `normalize_scientific_name` (authority-strip etc.); used for name handling — NOT for `verbatim_name`, which is stored raw
- `data/tests/test_checklist_pipeline.py` — pytest fixture pattern (isolated DuckDB via `DB_PATH` env + `importlib.reload`); new tests follow this shape
- `data/pyproject.toml` — dependency target (Python 3.14)
- `data/run.py` — STEPS orchestrator (env-driven via `DB_PATH` + `EXPORT_DIR`)
- `data/dbt/models/marts/checklist.sql` + `data/dbt/models/sources.yml` §`checklist_records` — the old county-fill consumer that D-10 must NOT disturb

### Source data
- `/home/peter/final_checklist_records.csv` — 50,646 rows. Header: `ObjectID, Family, Genus, Scientific Name, Locality, Latitude, Longitude, Date, recordedBy, County_join, x, y`. **Must be committed into `data/checklists/`** (tracked via git-LFS — `.gitattributes` routes `*.csv`). The final committed filename is a planning decision (e.g. `checklist_records_full.csv`); CONTEXT does not lock it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/checklist_pipeline.py`: extend in place — already owns the `checklist_data` schema, DuckDB connection lifecycle, and `print()`-to-build-output logging convention.
- `data/tests/test_checklist_pipeline.py`: the isolated-DuckDB pytest fixture (monkeypatch `DB_PATH`, `importlib.reload`, redirect file paths to `tmp_path`) is the template for the new ingest tests.
- Python stdlib `datetime`/`date`: parses 100% of current date formats including pre-1900 (`date(1812,6,18)` is valid; the 1900 limit is `strftime`-only).

### Established Patterns
- **Idempotent full refresh:** `CREATE OR REPLACE TABLE` on every run; no incremental cursor. The new table follows suit.
- **Build-output logging:** `print(f"...")  # noqa: T201` for pipeline counts (e.g. `checklist_records: N loaded`). The excluded-coord breakdown logs the same way.
- **Validation-at-ingest:** research mandates coordinate + date quality be resolved in Python, NOT deferred to dbt — so zero-coord rows never reach `ST_Point(lon,lat)` later.

### Integration Points
- The new `checklist_records_full` table is consumed by `stg_checklist__records_full.sql` in **Phase 135** (not this phase). 134 only has to produce the table + flags; it wires into nothing downstream yet.
- `data/run.py` STEPS already runs `checklist_pipeline` after ecdysis — no new step needed if the new loader is called from `load_checklist()`.

</code_context>

<specifics>
## Specific Ideas

- Empirical data profile (verified against the static file, not assumed):
  - Coordinates: 50,646 total · ~45,927 valid · 4,595 null · 2 zero · 122 out-of-tight-bbox · 0 swapped.
  - Dates: 43,602 ISO datetime · 64 ISO date · 291 `M/D/YYYY` · 6,689 empty · 0 malformed/partial. Year span 1812–2022 (248 pre-1900).
- These exact counts are the basis for the pytest assertions (SC#1 row count ~50,646; SC#2 zero `lat=0/lon=0` in the `valid` set; SC#3 `1812-06-18` and `m/d/yyyy` parse, NULL-date rows tagged `none`).

</specifics>

<deferred>
## Deferred Ideas

- **Retire `wa_bee_checklist_records.tsv` / re-derive or re-point `checklist_records`** — deferred per D-10 to a later phase (137/138) once `checklist_records_full` is proven.
- **Excluded-coordinate sidecar CSV** for curator review — discussed, not selected for 134; per-reason build-log breakdown is sufficient here.
- **Synthetic `checklist_id` (`ROW_NUMBER`), synonym JOIN, taxon_id bridge, dedup, ARM 4, contract bump** — all Phases 135–137.
- **County-fill layer retirement, map points, detail card, source toggle** — Phases 137–138.
- Reviewed-not-folded todos: the `todo.match-phase` matches (data-test-suite env deps, genus-page subgenera, pluralization sweep, table rank column, cluster selection feedback) are generic keyword hits unrelated to ingest — not folded.

</deferred>

---

*Phase: 134-full-fidelity-ingest*
*Context gathered: 2026-06-04*
