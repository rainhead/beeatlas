---
phase: 22
name: Orchestration
status: context-captured
date: 2026-03-27
---

# Phase 22 Context: Orchestration

## Phase Boundary

A new Python runner script (`data/run.py`) replaces `scripts/build-data.sh`. It sequences all five dlt pipeline steps plus the export step in the correct order, calling pipeline functions directly (not via subprocess). Each step remains independently runnable via its existing `__main__` entrypoint. The old `scripts/build-data.sh` is removed; `package.json`'s `build:data` script is updated to point to the new runner.

This is a **local-only** orchestration phase — CI integration (INFRA-06/07/08) is deferred to a future milestone.

</domain>

<decisions>
## Implementation Decisions

### Runner Format
- **D-01:** The runner is a Python script at `data/run.py`, not a shell script.
- **D-02:** The runner calls pipeline functions directly by importing the pipeline modules (e.g., `import ecdysis_pipeline; ecdysis_pipeline.run_pipeline()`). It does **not** use `subprocess.run()` to shell out to each pipeline — one `uv` process, shared memory, proper Python tracebacks.

### Step Sequence
- **D-03:** Full sequence: `geographies_pipeline` → `ecdysis_pipeline` → `inaturalist_pipeline` → `projects_pipeline` → `export`. This matches the roadmap exactly. `anti_entropy_pipeline.py` is **not** included in the full sequence (not listed in roadmap success criteria).
- **D-04:** The runner and each pipeline module must expose a callable function (not just `if __name__ == "__main__"`) so the runner can import and call them. The researcher/planner should inspect each pipeline's structure and add `run_pipeline()` functions if they don't exist.

### Individual Step Isolation
- **D-05:** "Runnable in isolation" means: `cd data && uv run python ecdysis_pipeline.py` works for each step. The existing `if __name__ == "__main__"` entrypoints satisfy this requirement. No new npm scripts or `--step` flag are required (user didn't select this area — leave as-is).

### build-data.sh Removal
- **D-06:** `scripts/build-data.sh` is deleted. `package.json`'s `build:data` script is updated to: `cd data && uv run python run.py`. The old npm scripts referencing old pipeline modules (`fetch-inat`, `fetch-links`, `cache-restore-links`, etc.) are **not** touched in this phase — that's Phase 24 (Tech Debt Audit).

### Claude's Discretion
- How `run.py` handles errors (whether to stop on first failure or attempt all steps) — Claude's call. Failing fast (`set -e` equivalent in Python) is the standard for a pipeline runner.
- Whether `run.py` prints step banners/timing — Claude's call. Some logging helps with debugging.
- The exact function signature exposed by each pipeline for the runner to call — Claude's call, consistent with existing module patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — ORCH-01, ORCH-02

### Pipeline modules (read entrypoints to understand callable structure)
- `data/ecdysis_pipeline.py` — ecdysis dlt pipeline, `if __name__ == "__main__"` at line 192
- `data/inaturalist_pipeline.py` — iNat dlt pipeline, `if __name__ == "__main__"` at line 138
- `data/geographies_pipeline.py` — geographies dlt pipeline, `if __name__ == "__main__"` at line 146
- `data/projects_pipeline.py` — projects dlt pipeline, `if __name__ == "__main__"` at line 77
- `data/anti_entropy_pipeline.py` — NOT in sequence; read to understand why it's excluded
- `data/export.py` — export script, `main()` at line 268, `if __name__ == "__main__"` at line 282

### Current orchestration (to be replaced/removed)
- `scripts/build-data.sh` — old bash orchestration using deleted pipeline modules; DELETE this file
- `package.json` — `build:data` script must be updated; `scripts` section has old pipeline npm scripts (leave untouched in this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Each pipeline has `DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")` — runner doesn't need to set this; each module resolves its own DB path.
- `data/export.py` has a `main()` function (line 268) — already callable directly.

### Established Patterns
- All pipelines use `if __name__ == "__main__"` as the entry gate. The runner will need to call the underlying run function, not the `__main__` block.
- `DB_PATH` is defined per-module — no shared config needed.
- Pipelines run from `data/` as working directory (paths like `"beeatlas.duckdb"` resolve relative to `data/`).

### Integration Points
- `package.json` `build:data` script: currently `bash scripts/build-data.sh` → becomes `cd data && uv run python run.py`
- `scripts/build-data.sh` references deleted old modules — remove it entirely

</code_context>

<specifics>
## Specific Ideas

- No specific references from discussion — phase is straightforward replacement of a known script.

</specifics>

<deferred>
## Deferred Ideas

- **Step isolation via npm scripts or --step flag**: User didn't select this area. The existing `python pipeline.py` invocations satisfy ORCH-02. Could be revisited in Phase 24 if developer ergonomics need improvement.
- **Old npm scripts cleanup** (`cache-restore-links`, `fetch-inat`, etc.): Phase 24 (Tech Debt Audit) owns these.
- **anti_entropy_pipeline.py orchestration**: Not in scope for Phase 22 per roadmap success criteria. Phase 24 should evaluate whether it's needed and when it should run.

</deferred>

---

*Phase: 22-orchestration*
*Context gathered: 2026-03-27*
