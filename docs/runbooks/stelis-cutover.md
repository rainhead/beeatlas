# Runbook: retiring run.py in favour of Stelis

> **✅ COMPLETED 2026-07-17.** `nightly.sh` now runs Stelis unconditionally and
> `data/run.py` has been deleted (recover from git history if a rollback is ever
> needed). The first green `STELIS=1` nightly published live on 2026-07-17
> (build 30 ok · 0 failed; integration gate 58 passed). This runbook is retained
> as the record of how the cutover was done.

Retire `data/run.py` (the imperative STEPS loop) in favour of
[Stelis](https://github.com/rainhead/stelis) `--build --all` — the same steps as a
content-addressed dependency graph. Stelis shells the SAME `data/` scripts via uv;
it just decides what to run. Wins over run.py: it **skips work whose inputs are
unchanged**, is **partial-success** (a failed task blocks only its dependents), and
plans the minimal upstream. run.py always ran everything, fail-fast.

## Where it plugs in

`nightly.sh` step 2 is gated on `STELIS`:

- **unset (default):** `uv run python run.py` — unchanged, safe.
- **`STELIS=1`:** `(cd $STELIS_DIR && BEEATLAS_DIR=$REPO_ROOT racket src/main.rkt
  --build --all --export-dir "$EXPORT_DIR")`.

Everything else in `nightly.sh` — S3 sync, the integration gate, hashing/manifest/
upload, CloudFront, the deploy dispatch — is unchanged and still gates publish.

Stelis reads the pipeline's DuckDB via `DB_PATH` and the notes store via
`NOTES_DB_PATH` (both already exported by `nightly.sh`); its `beeatlas-db` honours
`DB_PATH`. Cache + history persist in `$STELIS_DIR/.stelis/` across nightlies, so an
unchanged nightly is fast.

## Prereqs on maderas (all verified 2026-07-16)

- Racket **v9.1 CS** at `/usr/bin/racket` (on the cron PATH) — Stelis's 440 tests
  pass on it. `datalog` is present (installation scope). `duckdb` v1.5.1, `sqlite3`.
- Stelis checkout at `~/dev/stelis`, beeatlas at `~/dev/beeatlas` (`STELIS_DIR`
  defaults to `~/dev/stelis`; override if elsewhere).

## Cutover procedure

1. **Update checkouts:** `cd ~/dev/stelis && git pull` (and beeatlas pulls itself
   at the top of `nightly.sh`).
2. **Non-destructive verify first** (recommended — no S3, no live DuckDB):
   ```sh
   cp /tmp/beeatlas.duckdb /tmp/verify.duckdb 2>/dev/null   # or start fresh
   ( cd ~/dev/stelis && \
     BEEATLAS_DIR=~/dev/beeatlas DB_PATH=/tmp/verify.duckdb \
     NOTES_DB_PATH=~/beeatlas-store/notes.db \
     racket src/main.rkt --build --all --export-dir /tmp/stelis-verify )
   ```
   Then confirm EXPORT_DIR completeness — every published artifact must be present:
   ```sh
   cd ~/dev/beeatlas/data && python3 artifacts.py publish-plan \
     | cut -f2 | while read -r f; do [ -e "/tmp/stelis-verify/$f" ] || echo "MISSING $f"; done
   ```
   (No `MISSING` lines = Stelis produced the full published set.)
3. **Supervised full run:** `STELIS=1 bash data/nightly.sh` — watch it end-to-end
   (build → integration gate → publish → dispatch). This publishes; run it when you
   intend a real nightly.
4. **Retire:** once trusted over a few runs, make `STELIS=1` the default (or drop
   the gate) and `git rm data/run.py`.

## Differences to expect vs run.py

- **Skipping:** a re-run with unchanged inputs skips most tasks (run.py always
  rebuilt). Ingestion boundaries (ecdysis/iNat/WABA/taxa/checklist) always re-run —
  they're the fresh-data roots.
- **Partial success:** Stelis continues past an independent failure and exits
  non-zero if ANY task failed/skipped — so `nightly.sh`'s `set -e` still aborts the
  publish, same gate outcome, just possibly more work done first.
- Stelis adds two nodes run.py did implicitly/lacked: `place-marts` (dbt→EXPORT_DIR
  placement) and an `inat-obs` integrity gate.

## Rollback

Unset `STELIS` (or revert the `nightly.sh` block). Immediate; run.py is untouched
until you delete it.
