# Deferred Items — Phase 128

## DEF-128-01: `data/dbt/run.sh` build fails seeds with default relative `DB_PATH`

**Discovered:** 2026-06-01 (Phase 128 Plan 01, Task 3)
**Status:** ✅ RESOLVED 2026-06-01 (post-milestone) — `run.sh` now defaults `DB_PATH` to an absolute path.

**Resolution note:** On re-investigation the acute symptom did NOT reproduce — `bash data/dbt/run.sh build`
from the repo root with the default (relative) `DB_PATH` passed cleanly (PASS=61, ERROR=0), and seeds
load via standard dbt-core handling (no DuckDB `read_csv` for seeds), so the original root-cause framing
was at best state/CWD-dependent. Applied the suggested hardening anyway: `run.sh` now exports
`DB_PATH="${DB_PATH:-$(cd "$DIR/.." && pwd)/beeatlas.duckdb}"` so local builds are deterministic
regardless of invocation CWD (verified: build green from repo root AND from `/tmp`). nightly.sh sets an
explicit `DB_PATH`, preserved by the `:-` default — nightly behavior unchanged.

**Symptom:** `bash data/dbt/run.sh build` (default `DB_PATH=../beeatlas.duckdb`) fails both
seeds: `IO Error: No files found that match the pattern "dbt/seeds/auto_synonyms.csv"`
(and `occurrence_synonyms.csv`). This SKIPs int_combined → occurrences, blocking local
validation.

**Root cause:** dbt-duckdb resolves seed CSV paths relative to the DuckDB database file's
directory. run.sh `cd`s to `data/dbt`, so with the *relative* default `../beeatlas.duckdb`
the seed path is miscomputed as `dbt/seeds/...` relative to the wrong base. With an
**absolute** `DB_PATH` it resolves correctly.

**Why the nightly is unaffected:** `data/nightly.sh` sets `DB_PATH=/tmp/beeatlas.duckdb`
(absolute), so seeds load fine. Only the local-dev default path hits this.

**Workaround used this phase:**
`DB_PATH=/home/peter/dev/beeatlas/data/beeatlas.duckdb bash data/dbt/run.sh build`
→ clean PASS=61, ERROR=0.

**Suggested fix (future, not this phase):** in `data/dbt/run.sh`, default `DB_PATH` to an
absolute path (e.g. `export DB_PATH="${DB_PATH:-$DIR/../beeatlas.duckdb}"` resolved to
absolute) so local-dev `run.sh build` works without a manual override. Verify it does not
change nightly behavior (nightly already sets an absolute `DB_PATH`).
