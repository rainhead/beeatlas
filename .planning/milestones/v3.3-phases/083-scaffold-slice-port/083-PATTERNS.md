# Phase 83: Scaffold & Slice Port - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 20 (1 modified, 18 new, 1 modified gitignore)
**Analogs found:** 4 / 20 (most files are NEW — no analog in repo; canonical patterns live in 083-RESEARCH.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/pyproject.toml` (MOD) | config (deps) | n/a | self — `[dependency-groups].dev` entry for `pytest` | exact (in-file pattern) |
| `data/dbt/dbt_project.yml` | config (dbt project) | n/a | NONE | NEW — no analog |
| `data/dbt/profiles.yml` | config (dbt connection) | n/a | NONE | NEW — no analog |
| `data/dbt/models/sources.yml` | config (dbt sources) | n/a | NONE | NEW — no analog |
| `data/dbt/models/staging/stg_*.sql` (~11 files) | model (staging, view) | transform | NONE — translation of `data/export.py:23–105` CTEs | NEW — no analog |
| `data/dbt/models/intermediate/int_*.sql` (~9 files) | model (intermediate, view/table) | transform | NONE — translation of `data/export.py:41–197` CTEs | NEW — no analog |
| `data/dbt/models/marts/occurrences.sql` | model (mart, external parquet) | batch | NONE — translation of `data/export.py:199–263` | NEW — no analog |
| `data/dbt/models/marts/counties_geo.sql` | model (mart, table + post-hook) | batch | NONE — translation of `data/export.py:280–296` | NEW — no analog |
| `data/dbt/models/marts/ecoregions_geo.sql` | model (mart, table + post-hook) | batch | NONE — translation of `data/export.py:297–314` | NEW — no analog |
| `data/dbt/macros/emit_feature_collection.sql` | macro (utility) | transform | NONE | NEW — no analog |
| `data/dbt/run.sh` | utility (shell wrapper) | request-response | `data/nightly.sh` | role-match (shell wrapper) |
| `data/tests/test_dbt_scaffold.py` | test (pytest, integration) | file-I/O | `data/tests/test_export.py` | exact (pytest reads parquet/geojson outputs) |
| `data/dbt/tests/scaffold_assert.sh` | test (shell smoke) | file-I/O | `data/nightly.sh` (shell idioms) | partial (shell idioms only) |
| `.gitignore` (MOD) | config | n/a | self — existing patterns (`*.parquet`, `/public/data/`) | exact (in-file pattern) |
| `.planning/research/dbt-spike-findings.md` | doc (seed) | n/a | NONE (markdown stub) | NEW — no analog |

---

## Pattern Assignments

### `data/pyproject.toml` (modify — add dbt-duckdb)

**Analog:** self — existing `[dependency-groups].dev` block at `data/pyproject.toml:16–19`.

**Current pattern** (lines 16–19):
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
]
```

**Pattern to apply (add adjacent entry, preserve existing):**
- Add `"dbt-duckdb==1.10.1"` to the same `dev` list per RESEARCH §"Standard Stack".
- Do NOT add `dbt-core` directly (Pitfall 4 in RESEARCH); let it resolve transitively.
- Do NOT alter `[project].dependencies`, `requires-python`, or `[tool.beeatlas]`.
- Verify via `uv tree --project data | grep -E "dbt-(core|duckdb)"` post-install.

---

### `data/dbt/run.sh` (new — wrapper script)

**Analog:** `data/nightly.sh` (only existing shell wrapper in `data/`).

**Imports/preamble pattern** (`data/nightly.sh:1–18`):
```bash
#!/usr/bin/env bash
# <one-line purpose>
# <multi-line context>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
```

**Patterns to copy:**
- Shebang `#!/usr/bin/env bash` (line 1).
- Header comment block describing purpose (lines 2–4 style).
- `set -euo pipefail` (line 6) — fail-fast invariant; reuse verbatim.
- `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"` idiom (line 8) — repo-relative directory resolution. Adapt to `DIR=...` per RESEARCH Pattern 6.
- `uv run --project ...` invocation style (line 41 of nightly.sh: `uv run python run.py`). For dbt this becomes `uv run --project "$DIR/.." dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"`.
- File mode: make executable (`chmod +x`) — nightly.sh is executable.

**Do not copy:** AWS / boto / S3 logic, `trap` handlers, CloudFront invalidation, timing helpers (`_ts`, `_hash`, `_elapsed`). The dbt wrapper is one-line `exec`-style.

**Canonical code:** RESEARCH §Pattern 6 (lines 484–490 of 083-RESEARCH.md).

---

### `data/tests/test_dbt_scaffold.py` (new — pytest module)

**Analog:** `data/tests/test_export.py` (the canonical pytest for the exact slice being ported; same outputs, same assertions shape).

**Imports pattern** (`data/tests/test_export.py:9–11`):
```python
import json
import duckdb
import export as export_mod
```

**Patterns to copy:**

1. **Schema assertion via `DESCRIBE read_parquet(...)`** — `test_export.py:46–52`:
   ```python
   schema = duckdb.execute(
       f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
   ).fetchall()
   actual_cols = [row[0] for row in schema]
   for col in EXPECTED_COLS:
       assert col in actual_cols, f"Missing column: {col}"
   ```
   For Phase 83, the assertion is weaker — just file existence + non-null county/eco + row count > 0. Schema parity is Phase 84 (TEST-03).

2. **Row-count + null-county/eco sanity** — `test_export.py:60–71` (`test_occurrences_parquet_has_rows`):
   ```python
   row = duckdb.execute(f"""
       SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
           SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
       FROM read_parquet('{parquet_path}')
   """).fetchone()
   total, null_county, null_eco = row
   assert total >= 2
   assert null_county == 0
   assert null_eco == 0
   ```
   This mirrors `export.py:266–277` invariants — copy verbatim for Phase 83's PORT-02 smoke.

3. **GeoJSON validation pattern** — `test_export.py:137–148` (`test_counties_geojson`):
   ```python
   geojson = json.loads((export_dir / 'counties.geojson').read_text())
   assert geojson['type'] == 'FeatureCollection'
   features = geojson['features']
   assert len(features) >= 1
   for feature in features:
       assert 'geometry' in feature, "Feature missing geometry"
       assert 'NAME' in feature['properties'], "Feature missing NAME property"
   ```
   Apply to both `counties.geojson` (property `NAME`) and `ecoregions.geojson` (property `NA_L3NAME`, see `test_export.py:155–166`).

**Pattern divergences (intentional):**
- **NO `fixture_con` / `fixture_db`**: Phase 83 tests run against the real `data/beeatlas.duckdb` after `data/dbt/run.sh build`, not the in-memory test fixture. The fixture (`data/tests/conftest.py:530–540`) is sized for `export.py` direct calls; dbt's full DAG needs the S3-hydrated DB.
- **NO `monkeypatch.setattr(export_mod, 'ASSETS_DIR', ...)`**: dbt writes to `data/dbt/target/sandbox/`, not configurable per-test. Read from that fixed path.
- **Test invocation order**: Phase 83 tests run *after* `dbt build` — they assert post-build state. Document this in module docstring + via a session-scoped pytest fixture or explicit ordering in the plan.

**Path pattern (new, no analog):**
```python
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
parquet_path = str(SANDBOX / "occurrences.parquet")
counties_path = SANDBOX / "counties.geojson"
ecoregions_path = SANDBOX / "ecoregions.geojson"
```

**Do not copy:** `fixture_con` / `export_dir` fixtures, `monkeypatch.setattr(export_mod, ...)` — they bind to `export.py`, not dbt.

---

### `data/dbt/tests/scaffold_assert.sh` (new — shell smoke)

**Analog:** `data/nightly.sh` (shell idioms only — different purpose).

**Patterns to copy:**
- `#!/usr/bin/env bash` + `set -euo pipefail` (nightly.sh:1, 6).
- `SCRIPT_DIR=...` idiom (nightly.sh:8).

**Patterns to add (NEW — no analog):**
- File-existence asserts via `test -f ...` per RESEARCH "Phase Requirements → Test Map" (083-RESEARCH.md lines 736–742).
- `git check-ignore data/dbt/target/whatever` for gitignore verification (RESEARCH Pitfall 8).
- `! git grep -E 'dbt/|dbt-duckdb' -- data/run.py data/nightly.sh .github/` for SCAFFOLD-03 isolation (RESEARCH "Phase Requirements → Test Map").

---

### `.gitignore` (modify — add dbt artifacts)

**Analog:** self — existing patterns at lines 139–140:
```
*.parquet
/public/data/
```

**Pattern to apply:**
- Append a section (with section comment header matching existing style — see lines 1, 75, 139, 142, 145, 150) for dbt artifacts:
  - `data/dbt/target/`
  - `data/dbt/logs/`
  - `data/dbt/dbt_packages/`
- Verify with `git check-ignore data/dbt/target/foo` after commit (RESEARCH Pitfall 8).

**Note:** `*.parquet` at line 139 already covers the external parquet output incidentally, but the targeted `data/dbt/target/` rule is the load-bearing one (also covers `manifest.json`, `run_results.json`, etc.).

---

### `data/dbt/dbt_project.yml` (NEW — no analog)

**Canonical code:** 083-RESEARCH.md §Pattern 2 (lines 317–337). Copy structure verbatim, adjusting only:
- `name: beeatlas`
- `profile: beeatlas`
- Per-layer materializations (`staging: view`, `intermediate: view`, `marts: table`).
- Consider `intermediate: { int_combined: { +materialized: table } }` override per RESEARCH Pitfall 5.

---

### `data/dbt/profiles.yml` (NEW — no analog)

**Canonical code:** 083-RESEARCH.md §Pattern 1 (lines 295–309). Copy verbatim, with:
- `path: ../beeatlas.duckdb` (repo-relative from `data/dbt/`).
- `schema: dbt_sandbox`.
- `extensions: [spatial]` (and possibly `json` per RESEARCH Pitfall 6 / Assumption A2).
- `external_root: target/sandbox`.

---

### `data/dbt/models/sources.yml` (NEW — no analog)

**Canonical code:** 083-RESEARCH.md §Pattern 3 (lines 341–372). Copy verbatim — four `source` blocks (`ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies`) with the table sets enumerated in CONTEXT §"Model granularity & layering" (lines 60–71 of 083-CONTEXT.md).

---

### `data/dbt/models/staging/stg_*.sql` (~11 files, NEW)

**Canonical translations:** Per CONTEXT §"Staging" (083-CONTEXT.md lines 60–71). Each is a thin `{{ source('schema', 'table') }}` wrapper with renaming/typing/NULL filters mirroring `data/export.py:23–105`.

**Reference SQL excerpt:** 083-RESEARCH.md §"Preserving `export.py`'s `wa_eco` filter at the staging layer" (lines 646–658) shows the canonical staging shape for `stg_geo__ecoregions.sql`. Apply analogous patterns to the other 10.

**Materialization:** `view` (default from `dbt_project.yml`).

**Note (RESEARCH Assumption A3):** Use native `geom GEOMETRY` column if Phase 47 migrations are applied; fall back to `ST_GeomFromText(geometry_wkt)` if not. Verify at plan execution.

---

### `data/dbt/models/intermediate/int_*.sql` (~9 files, NEW)

**Canonical translations:** Per RESEARCH §"CTE-to-model mapping" (083-RESEARCH.md lines 668–686). Each maps 1:1 to a named CTE in `data/export.py:41–197`. Use `{{ ref('stg_*') }}` and `{{ ref('int_*') }}` exclusively — never `source()` in this layer.

**Materialization:** `view` default; `int_combined` overrides to `table` per RESEARCH Pitfall 5.

---

### `data/dbt/models/marts/occurrences.sql` (NEW — external parquet)

**Canonical code:** 083-RESEARCH.md §Pattern 4 (lines 376–416). The full spatial-join block is at `data/export.py:199–263`. Preserve verbatim (PORT-02 constraints listed in RESEARCH lines 418–423):
- `_row_id = ROW_NUMBER() OVER ()` over `int_combined`.
- `DISTINCT ON (_row_id)` in `eco_dedup` (DuckDB-specific).
- Correlated `(SELECT ... ORDER BY ST_Distance LIMIT 1)` in fallbacks.

**Config:**
```sql
{{ config(
    materialized='external',
    location='target/sandbox/occurrences.parquet',
    format='parquet'
) }}
```

---

### `data/dbt/models/marts/counties_geo.sql` and `ecoregions_geo.sql` (NEW)

**Canonical code:** 083-RESEARCH.md §Pattern 5 (lines 446–469). Each is `materialized='table'` + `post_hook=[emit_feature_collection(this, '<PROP>', '<path>')]`.

**Property names** (preserve `export.py` parity per PORT-02):
- `counties_geo` → `NAME` (from `data/export.py:280–296`).
- `ecoregions_geo` → `NA_L3NAME` (from `data/export.py:297–314`).

**Output paths:**
- `target/sandbox/counties.geojson`
- `target/sandbox/ecoregions.geojson`

---

### `data/dbt/macros/emit_feature_collection.sql` (NEW)

**Canonical code:** 083-RESEARCH.md §Pattern 5 (lines 427–443). The shared serializer using `to_json(list({...}))` + `COPY ... (FORMAT JSON, ARRAY false)`. Simplification tolerance `0.001` matches `export.py:283, 300`.

**Trade-off to document in findings (PORT-04):** GDAL driver alternative adds `crs`/`bbox`/`id` fields that `export.py` doesn't emit. RESEARCH lines 472–479 has the verbatim language to drop into the findings stub.

---

### `.planning/research/dbt-spike-findings.md` (NEW — seed)

**Pattern:** Markdown stub with H1 title + "Slice rationale" paragraph only. Body content is Phase 84's scope. PORT-04 only requires the file exists with the slice-choice paragraph (RESEARCH lines 113–114 + 736–743 row PORT-04).

---

## Shared Patterns

### Shell wrapper idioms
**Source:** `data/nightly.sh` lines 1, 6, 8.
**Apply to:** `data/dbt/run.sh`, `data/dbt/tests/scaffold_assert.sh`.
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
```

### Pytest output-file assertion shape
**Source:** `data/tests/test_export.py:46–52, 60–71, 137–148`.
**Apply to:** all assertions in `data/tests/test_dbt_scaffold.py`.

Key patterns:
- `duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()` for column probing.
- `duckdb.execute(f"SELECT COUNT(*), SUM(CASE WHEN ... NULL THEN 1 ELSE 0 END) FROM read_parquet(...)").fetchone()` for row + null counts.
- `json.loads(path.read_text())` + `assert geojson['type'] == 'FeatureCollection'` for GeoJSON.

### dbt-duckdb declarative conventions
**Source:** 083-RESEARCH.md Patterns 1–6 (the only canonical reference — no in-repo analog).
**Apply to:** all dbt YAML and SQL files.

Key invariants:
- `extensions: [spatial]` in profile, never via `on-run-start` hook.
- `materialized='external'` for parquet outputs, never custom Python materialization or post-hook COPY.
- `{{ source(...) }}` only in staging; `{{ ref(...) }}` everywhere else.
- Relative paths in `location` (PORT-03 / RESEARCH Pitfall 3).

### Conventions to NOT inherit from analogs
- **From `data/nightly.sh`:** AWS / boto / S3 logic, CloudFront invalidation, `EXPORT_DIR` env handling. These belong to production scope (out of v3.3 per SCAFFOLD-03).
- **From `data/tests/test_export.py`:** `fixture_con` / `fixture_db` / `export_dir` / `monkeypatch.setattr(export_mod, ...)`. The dbt scaffold tests run against the real `data/beeatlas.duckdb` + the post-build `data/dbt/target/sandbox/` artifacts.

---

## No Analog Found

Files with no close match in the codebase — planner should reference 083-RESEARCH.md canonical code patterns directly.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/dbt/dbt_project.yml` | dbt project config | n/a | First dbt project in repo; canonical in RESEARCH §Pattern 2 |
| `data/dbt/profiles.yml` | dbt connection config | n/a | First dbt project in repo; canonical in RESEARCH §Pattern 1 |
| `data/dbt/models/sources.yml` | dbt source declaration | n/a | First dbt project in repo; canonical in RESEARCH §Pattern 3 |
| `data/dbt/models/staging/stg_*.sql` (~11) | dbt staging models | transform | Greenfield SQL DAG; canonical translations in RESEARCH §"CTE-to-model mapping" + §"Preserving `export.py`'s `wa_eco` filter" |
| `data/dbt/models/intermediate/int_*.sql` (~9) | dbt intermediate models | transform | Greenfield; canonical translations in RESEARCH §"CTE-to-model mapping" |
| `data/dbt/models/marts/occurrences.sql` | external parquet mart | batch | Greenfield; canonical in RESEARCH §Pattern 4. Source SQL `data/export.py:199–263` for spatial-join body |
| `data/dbt/models/marts/counties_geo.sql` | mart + post-hook | batch | Greenfield; canonical in RESEARCH §Pattern 5 |
| `data/dbt/models/marts/ecoregions_geo.sql` | mart + post-hook | batch | Greenfield; canonical in RESEARCH §Pattern 5 |
| `data/dbt/macros/emit_feature_collection.sql` | dbt macro | transform | First macro in repo; canonical in RESEARCH §Pattern 5 |
| `.planning/research/dbt-spike-findings.md` | seed markdown doc | n/a | PORT-04 seed only |

## Metadata

**Analog search scope:**
- `data/` (existing pipeline, tests, configs)
- `data/tests/` (pytest analogs)
- `/Users/rainhead/dev/beeatlas/.gitignore` (existing ignore patterns)

**Files scanned:** ~6 (focused on the known analogs flagged in heads-up; deep search unnecessary since most files are greenfield)

**Pattern extraction date:** 2026-05-12

**Confidence:** HIGH for the four files with real analogs (`pyproject.toml`, `run.sh`, `test_dbt_scaffold.py`, `.gitignore`). HIGH that the remaining 16 files have no in-repo analog and must take patterns from 083-RESEARCH.md verbatim.
