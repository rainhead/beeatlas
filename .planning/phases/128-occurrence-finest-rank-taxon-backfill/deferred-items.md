# Deferred Items — Phase 128

## DEF-128-01: `data/dbt/run.sh` build fails seeds with default relative `DB_PATH`

**Discovered:** 2026-06-01 (Phase 128 Plan 01, Task 3)
**Status:** Out of scope for TID-02 — pre-existing, environmental.

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
