#!/usr/bin/env bash
# Single entry point for the BeeAtlas nightly (stelis ADR 0007 Amendment,
# Model Y).
#
# Cron invokes this directly. Crontab owns only host-specific knowledge
# (repo location, log path, schedule). Everything else — dependency
# management, source sync, pipeline orchestration, publish — is owned
# in-repo and version-controlled here.
#
# What this script does, in order. NOTE this list counts the cd+lock as step 1, which
# the numbered comments in the body do not, so from there on the two disagree: this 6
# is the body's 5, and this 7 covers the body's 6 AND 7. Match them by NAME, not by
# number.
#   1. cd to repo root (derived from $0 — host-agnostic); take the publish
#      lock (shared with the st-nee write path: nightly and a note write
#      serialize here).
#   2. Source NVM, `nvm use` the .nvmrc-pinned node, git pull BOTH repos —
#      this one and the stelis checkout that owns the task graph, since a
#      change spanning the two ships only if both move (beeatlas-cwh) —
#      `pnpm install --frozen-lockfile` in both Node trees, uv sync. In the Fly
#      image (BEEATLAS_CONTAINER, data/runtime-env.sh) none of this runs: the
#      code, Stelis and the dependencies are the image's.
#   3. Restore the integration-gate baseline (last PUBLISHED artifacts,
#      snapshotted in step 7) into public/data/.
#   4. `pnpm run fetch-data` — Stelis (github.com/rainhead/stelis) builds the
#      data into $EXPORT_DIR. Content-addressed: unchanged work skips;
#      partial-success (a failed task blocks only its dependents; non-zero
#      exit aborts the publish below via `set -euo pipefail`). On success it
#      stamps $EXPORT_DIR/generated_at — the site's "Data as of" clock, which
#      only this step may advance (beeatlas-923).
#   5. Integration gate: ALL @integration tests must pass (fresh dbt sandbox
#      vs. the step-3 baseline) or the publish is aborted — stale data stays
#      live until fixed.
#   6. `pnpm run build` — 11ty inlines the baked artifacts from $EXPORT_DIR,
#      Vite hashes the bundles, and the build's last steps (scripts/
#      postbuild-data.mjs) derive _site/data: hashed runtime binaries +
#      stable-URL dirs + the slim manifest, plus the build receipt, which is
#      withdrawn until 6b passes.
#   6b. JS data-dependent gate (`*.data.test.ts`, which `pnpm test` excludes):
#      assertions against the _site just built — BEEATLAS_SITE_PREBUILT=1, so it
#      gates the tree about to be published rather than building its own
#      (beeatlas-b4p). A hard gate; failure aborts the publish.
#   7. Merge-swap _site into SITE_ROOT (rsync: assets + hashed data first
#      without --delete, stable dirs with --delete, pages with --delete,
#      manifest.json mv'd atomically LAST, age-prune old hashed files), then
#      snapshot the baseline for tomorrow's gate.
#   8. EXIT trap: back up the DuckDB + taxa cache offsite even on failure so
#      partial progress (e.g. occurrence_links) isn't lost. Still the S3 site
#      bucket for now; relocation to a dedicated backup bucket is st-pry,
#      which then unblocks the site bucket's teardown (st-vjd).
#
# Everything AWS-serving-side is gone (Model Y step C): the S3 site publish,
# CloudFront invalidation, GH-Actions dispatch, the bash manifest block, and
# the S3 pulls (DuckDB, taxa, baseline) — state now lives on this host under
# $VAR_DIR. Only the offsite backup trap remains.
#
# On Hostess (ADR 0046) infra/hostess/nightly.sh runs this with the layout below
# under ~/beeatlas-nightly, BEEATLAS_CODE_PINNED (it has already checked out the
# code, so step 1 pulls nothing) and NOTES_FROM_FLY_APP (step 3a takes the Machine's
# notes/). docs/runbooks/hostess-nightly.md.
#
# Layout (the /var/www htdocs+var convention; see
# docs/runbooks/serve-from-maderas.md for the migration):
#   $BASE_DIR/htdocs  — SITE_ROOT, the Apache DocumentRoot
#   $BASE_DIR/var     — pipeline state: beeatlas.duckdb, export/, baseline/,
#                       publish.lock

set -euo pipefail

# uv installs to ~/.local/bin which cron omits from PATH.
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# in_container, use_pinned_node, describe_code: host checkout vs the Fly image.
# shellcheck source=data/runtime-env.sh
. "$SCRIPT_DIR/runtime-env.sh"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
SITE_ROOT="${SITE_ROOT:-$BASE_DIR/htdocs}"
VAR_DIR="${VAR_DIR:-$BASE_DIR/var}"
# Stelis's build state — observation history + input-addressed cache (st-7wu).
# Belongs beside the DuckDB and export dir it observes, not in whatever engine
# checkout happens to be cwd; step 1 updates that checkout nightly, and a
# project's record of itself should not ride along with it. Exported, so
# scripts/fetch-data.sh's `cd "$STELIS_DIR"` cannot change where state resolves.
# NOTE for interactive use on this host: a shell does NOT inherit this, so a bare
# `racket src/main.rkt --history` reads the cwd-relative default and reports an
# empty history. Pass the variable, or export it in your profile.
export STELIS_STATE_DIR="${STELIS_STATE_DIR:-$VAR_DIR/stelis}"
DB_PATH="${DB_PATH:-$VAR_DIR/beeatlas.duckdb}"
EXPORT_DIR="${EXPORT_DIR:-$VAR_DIR/export}"
BASELINE_DIR="${BASELINE_DIR:-$VAR_DIR/baseline}"
# Notes store: the notes-harvest step reads the SAME authoritative
# SQLite store the write API (systemd beeatlas-api) writes to. Must match the
# API's NOTES_DB_PATH (~/.config/systemd/user/beeatlas-api.service) and the
# go-live runbook (docs/runbooks/notes-write-launch-gate.md §A4), NOT the code
# default in notes_store/db.py (/opt/beeatlas-store/notes.db, which is unused on
# maderas). Without this export the harvest reads a nonexistent store and emits
# an empty notes/ dir — no author note ever reaches the static site.
NOTES_DB_PATH="${NOTES_DB_PATH:-$HOME/beeatlas-store/notes.db}"
# Set but EMPTY disables the ping: a trial run (beeatlas-f21l) must not report to
# production's monitor, where its success would mask production's failure. Hence `-`,
# not `:-`, which turned an empty value back into the production URL. Unset keeps it.
HEALTHCHECK_URL="${HEALTHCHECK_URL-https://hc-ping.com/411cd80a-965b-408c-8f89-b2b3afda0286}"

# Offsite backup (trap, step 8). Same-host is not a backup. The dedicated
# PipelineBackupBucket (CDK, st-pry) is the destination — set
# PIPELINE_BACKUP_BUCKET in the crontab from the stack's
# PipelineBackupBucketName output. No fallback: the old default (the site
# bucket) was DELETED by st-vjd, and a silent upload to a dead bucket would
# look like a backup while `|| true` swallowed every failure. Fail loud
# instead — the missed healthcheck ping is the alarm.
#
# SKIP_PIPELINE_BACKUP=1 is the one way past that, for a trial run on a second host
# while the production host still backs up (beeatlas-uibw.6): the trial's DuckDB must
# not replace production's backup. It is announced, like SKIP_INTEGRATION_GATE, and
# a trial runs with HEALTHCHECK_URL empty, so it cannot pass for a backed-up night.
if [[ -n "${SKIP_PIPELINE_BACKUP:-}" ]]; then
    echo "WARN: SKIP_PIPELINE_BACKUP set — this run backs up NOTHING offsite." >&2
elif [[ -z "${PIPELINE_BACKUP_BUCKET:-}" ]]; then
    echo "FATAL: PIPELINE_BACKUP_BUCKET is not set (crontab must pass the" >&2
    echo "PipelineBackupBucketName stack output) — refusing to run without" >&2
    echo "a real offsite backup destination (st-vjd)." >&2
    exit 78  # EX_CONFIG
fi
BACKUP_BUCKET="${PIPELINE_BACKUP_BUCKET:-}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
DB_S3_KEY="db/beeatlas.duckdb"
# The Stelis state dir, as one archive: its build history is the provenance of every
# artifact, and nothing rebuilds it. Under stelis/, which has db/'s lifecycle.
STELIS_S3_KEY="stelis/state.tar.gz"
STELIS_ARCHIVE="$VAR_DIR/stelis-state.tar.gz"
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_CACHE_S3_KEY="raw/taxa_cache.json"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"
TAXA_CACHE_PATH="$SCRIPT_DIR/raw/taxa_cache.json"

# One epoch for the whole run: Stelis presets it for build determinism. The slim
# manifest's generated_at does NOT come from here — it comes from the export dir's
# `generated_at` stamp, written by scripts/fetch-data.sh at step 4 when the data
# actually refreshes, so a publish clock can never stand in for a data clock
# (beeatlas-923).
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_hash() { sha256sum "$1" | awk '{print $1}'; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

# How far the run got. Read by the EXIT trap's publish receipt (stelis st-8x1)
# and by the signal handler below, so it is initialised HERE rather than beside
# the receipt's other variables — the stelis gate runs long before those, and an
# abort during it must still be able to name its stage. Free-form: stelis
# validates OUTCOME and PATH but not STAGE (src/main.rkt --mark-publish), and
# the pre-fetch-data stages can never reach a receipt anyway, because a receipt
# is written only once _sb_num is captured.
_stage="startup"

# AN INTERRUPTED RUN IS NOT A FAILED GATE (beeatlas-bbo9).
#
# Every gate below is a plain `if ! <cmd>; then <abort>; fi`, so a signal that
# stops <cmd> lands in the failure branch and the run reports whatever that
# branch asserts. For the stelis gate that assertion names a CAUSE ("the engine
# disagrees with this repo"), and pressing ^C is not that cause.
#
# Reading the exit code cannot fix it, so do not try: Racket HANDLES SIGINT as
# an exn:break, prints "user break", and exits 1 — indistinguishable from a
# failing test, and never 130 (verified 2026-08-16). Sniffing "user break" out
# of stderr would be worse. What the shell CAN know is that it was signalled
# too: ^C goes to the whole foreground process group, and an operator's or
# supervisor's `kill` reaches this PID directly.
#
# So trap the signal and leave before any gate's failure branch is reached, then
# re-raise from the default handler so a parent sees a genuine signal death
# (130/143/129) rather than the gate's synthesized `exit 1`. The EXIT trap still
# runs on this path — verified — so the backups below are never skipped.
#
# Except before it exists: this trap is installed here, the EXIT trap only after
# the sync (it needs $_sb_num). An abort during the sync or the stelis gate
# therefore backs nothing up, which is correct and not a regression — neither
# step writes $DB_PATH, so there is nothing this run could have lost.
#
# TERM and HUP as well as INT: an unattended run is stopped by a timeout wrapper
# (SIGTERM), an operator kill (either), or a session teardown (SIGHUP), and all
# three reach the same misreporting failure branch.
#
# HONEST, BUT PROMPT ONLY FOR A GROUP SIGNAL. Bash will not run a trap while it
# is waiting on a foreground command, so `kill -INT <this pid>` is not acted on
# until the running gate finishes by itself — during the hour-long data build,
# that is an hour. The REPORT is right either way, which is what this is for;
# only the timing differs. To stop a run now, signal the process group:
#
#     kill -INT -"$(ps -o pgid= <pid> | tr -d ' ')"
#
# which is exactly what a terminal's ^C does, and which `timeout --foreground`
# and systemd's KillMode=control-group also do. A bare `timeout` signals this
# PID alone and is therefore the slow path.
#
# NOTE: the handler deliberately does not kill the group itself. On the ^C path
# the child already got the signal; on a PID-only `kill` it is orphaned and runs
# to completion, which is untidy but harmless — the publish is already
# abandoned, and signalling our own group risks taking a supervisor down with us.
_on_signal() {
    local sig="$1"
    echo "" >&2
    echo "ABORTED BY SIG$sig during stage '${_stage:-unknown}' — no gate failed." >&2
    echo "This run was interrupted; nothing was published and no contract was" >&2
    echo "found to be broken." >&2
    # Report the backup from the observed state, not from an assumption. This
    # handler is installed before the EXIT trap is, so during the sync and the
    # stelis gate there is nothing to run — and asserting a backup that did not
    # happen would be the very thing this change removes from the gate below.
    if [[ -n "$(trap -p EXIT)" ]]; then
        echo "The EXIT trap is installed, so the backups below still run." >&2
    else
        echo "The EXIT trap is not installed yet, so nothing was backed up —" >&2
        echo "this stage writes no \$DB_PATH, so there is nothing to lose." >&2
    fi
    trap - INT TERM HUP
    kill -"$sig" $$
}
trap '_on_signal INT'  INT
trap '_on_signal TERM' TERM
trap '_on_signal HUP'  HUP

# Copy the integration-gate baseline artifacts (artifacts.py baseline-files)
# from $1 to $2, atomically per file. A missing source WARNs and is skipped —
# absence-tolerant in both directions (first run has no snapshot; a partial
# export refreshes only what it built).
_copy_baseline() {
    local from="$1" to="$2" copied=0
    mkdir -p "$to"
    while IFS=$'\t' read -r _name _src; do
        if [[ -f "$from/$_src" ]]; then
            cp "$from/$_src" "$to/.$_src.tmp"
            mv "$to/.$_src.tmp" "$to/$_src"
            copied=$(( copied + 1 ))
        else
            echo "WARN: $from missing $_name ($_src) — skipped" >&2
        fi
    done < <(uv run --no-sync --directory "$SCRIPT_DIR" python artifacts.py baseline-files)
    echo "  $copied baseline artifacts: $from -> $to"
}

echo "=== BeeAtlas nightly pipeline $(_ts) ==="

mkdir -p "$VAR_DIR" "$EXPORT_DIR"

# Publish lock: the st-nee write path runs the same fetch-data → build →
# merge-swap sequence for a single note; both serialize here so a nightly and
# a note write never interleave a publish. Waits (no -n): a queued run is
# better than a skipped one.
exec 200>"$VAR_DIR/publish.lock"
flock 200

# 1. Sync source + dependencies. NVM is required for node tooling: the site build
# (root package.json) and the pipeline's mapshaper (data/package.json, called by
# data/topology_postprocess.py). Both trees are installed below.
#
# In the Fly image there is nothing to sync (beeatlas-h6mo): the image IS the
# deploy, with Stelis pinned by digest, so pulling would move this run past the
# pin. The pull, the Stelis pull and compile, and the installs are host-only.
_stage="sync"
echo "--- syncing source + dependencies ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
use_pinned_node
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
export STELIS_DIR
if in_container; then
    describe_code
elif [[ -n "${BEEATLAS_CODE_PINNED:-}" ]]; then
    # Hostess (ADR 0046): infra/hostess/nightly.sh has already checked out the commit
    # the Machine is running, and Stelis at that commit's fly/stelis-commit, both
    # detached. Pulling either would move this run off the code that will render
    # note saves over what it builds.
    describe_code
    echo "  stelis: $(git -C "$STELIS_DIR" rev-parse --short HEAD) (pinned by fly/stelis-commit)"
    (cd "$STELIS_DIR" && raco make src/main.rkt)
else
    git pull --ff-only

    # Sync STELIS too (beeatlas-cwh). The task graph lives in a SEPARATE repo, so a
    # change spanning both — a loader + dbt model here, its graph node there — ships
    # only if BOTH move. Pulling one was a real failure on 2026-07-25: the new dbt
    # model ran against a graph that never produced its input, and the error named a
    # missing SCHEMA, which reads like a broken migration rather than "the other repo
    # is one commit behind".
    #
    # We auto-FOLLOW stelis main rather than pinning a SHA. The nightly already adopts
    # beeatlas main unreviewed a few lines up — the repo holding the loaders and dbt
    # models — so this is the same risk already accepted, not a new category. Stelis is
    # content-addressed, so a pull reads as 'code-changed and rebuilds exactly what the
    # edit reaches. And the integration gate below still stands between a bad build and
    # the publish. The alternatives (a pinned SHA in-repo, or vendoring stelis as a
    # submodule) are written up on beeatlas-cwh and stay the right shape if this ever
    # needs a review step per ship.
    #
    # A dirty or diverged stelis checkout — someone debugging on this host — fails
    # --ff-only. That has to name STELIS_DIR HERE rather than surface an hour later as
    # a dbt Catalog Error.
    if [[ ! -d "$STELIS_DIR/.git" ]]; then
        echo "FATAL: no stelis git checkout at $STELIS_DIR — the task graph lives" >&2
        echo "there and cannot be synced. Set STELIS_DIR, or clone" >&2
        echo "github.com/rainhead/stelis." >&2
        exit 78  # EX_CONFIG
    fi
    if ! git -C "$STELIS_DIR" pull --ff-only; then
        echo "FATAL: 'git pull --ff-only' failed in the STELIS checkout $STELIS_DIR" >&2
        echo "(dirty working tree? diverged branch?). That checkout owns the task" >&2
        echo "graph; building with a stale one fails deep inside dbt instead of here." >&2
        exit 1
    fi
    echo "  stelis: $(git -C "$STELIS_DIR" rev-parse --short HEAD) $(git -C "$STELIS_DIR" log -1 --format=%s)"
    # Racket compiles on demand, so this is an optimization, not a correctness step —
    # but a cold compile of the whole graph inside the build is a slow surprise, and
    # the 2026-07-25 recovery needed it. Non-fatal if raco is absent: `racket` is what
    # fetch-data.sh actually invokes, and it would fail with a better message.
    if command -v raco > /dev/null; then
        (cd "$STELIS_DIR" && raco make src/main.rkt)
    else
        echo "  WARN: raco not on PATH — skipping stelis bytecode build" >&2
    fi
fi

# 1b. Can this host RUN the engine, and does the engine still agree with THIS
# repo? Two questions, both about the checkout we just pulled unreviewed.
#
# PROVISIONING (stelis scripts/preflight.sh, st-7lm): a stelis push arrives via
# the pull above, and nothing checked the host can load it. On 2026-08-01 `sha`
# was missing here, every `racket src/main.rkt` failed to load, and this whole
# leg was dead — as a module-resolution stack trace naming no fix. Fatal, early,
# and it prints the install command.
#
# DRIFT (the stelis suite, st-r0x): stelis MIRRORS things that live in this repo
# — notes-digest hardcodes notes_harvest's join, filter, and hashed field list;
# the graph declares each task's inputs and outputs. Nothing but stelis's tests
# ties the two, and they CANNOT run in stelis's CI, which has no beeatlas
# checkout. This host has both repos, so it is the only place they run at all.
#
# BEEATLAS_DIR is load-bearing, not decoration. Those tests default it to a path
# that exists only on Peter's laptop, and SKIP when it is absent — measured
# 2026-08-04, the suite skips 9 things without it and 2 with it. Unset, this gate
# would pass while running none of the checks it exists for.
#
# STELIS_STATE_DIR is redirected to a scratch dir for the same reason it is set
# globally above: tests must never write into the production build history.
#
# 40-65s on this host across two runs (measured 2026-08-04), against an hour for
# the data build — so it goes BEFORE that build rather than after.
_stage="stelis-gate"
echo "--- stelis preflight + test gate ---"
_t0=$(date +%s)
if [[ -n "${SKIP_STELIS_GATE:-}" ]]; then
    echo "WARN: SKIP_STELIS_GATE set — BYPASSING the stelis preflight + test gate." >&2
    echo "WARN: this publishes with the cross-repo drift checks UNRUN." >&2
else
    bash "$STELIS_DIR/scripts/preflight.sh"          # exits 78 on a provisioning gap
    _stelis_test_state="$(mktemp -d)"
    if ! (cd "$STELIS_DIR" &&           BEEATLAS_DIR="$REPO_ROOT" STELIS_STATE_DIR="$_stelis_test_state"           raco test src/*-test.rkt); then
        rm -rf "$_stelis_test_state"
        echo "STELIS TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
        # State the outcome and the reason for ABORTING; do not name a cause.
        # This gate knows only that raco test exited non-zero, and it used to
        # read that as "the engine disagrees with this repo (or with itself)" —
        # an inference that is wrong for at least one reachable cause (an
        # interrupted run, beeatlas-bbo9) and unprovable for others (a missing
        # package, an OOM). beeatlas-6jdo is what a gate misdescribing its own
        # problem costs: a whole extra nightly. Its two siblings state the
        # outcome and stop; so does this one now.
        echo "raco test exited non-zero, so the pipeline's contracts are unverified" >&2
        echo "and this run will not build data on them. The failures above are the" >&2
        echo "cause — this gate cannot name it." >&2
        exit 1
    fi
    rm -rf "$_stelis_test_state"
    echo "stelis gate passed in $(_elapsed $_t0)"
fi

# Install both Node trees. `--frozen-lockfile` is pnpm's `npm ci`: the same
# contract, fail rather than silently rewrite the lockfile.
#
# There is NO node_modules cache guard here any more, and its removal is the
# point rather than a simplification. The old one hashed package-lock.json and
# skipped the install when it matched, because `npm ci` WIPES node_modules and
# so recompiled msgpackr-extract and better-sqlite3 — a multi-minute hit on
# every run. Neither half of that is true now: pnpm reconciles an existing tree
# instead of erasing it, resolves from a content-addressed store, and both
# addons are denied outright in data/pnpm-workspace.yaml, so nothing compiles.
#
# Removing the guard also fixes something it was quietly wrong about. It keyed
# on the LOCKFILE, so a node_modules that was corrupt, half-installed, or
# hand-edited still matched the hash and the install was skipped — the failure
# surfaced later, somewhere else. An unconditional frozen install verifies the
# tree every night, which is what a publish gate should do.
#
# Two trees since beeatlas-dqh, and they are separate pnpm PROJECTS, not
# workspace members (docs/adr/0038-pnpm-over-npm.md): the root one builds the
# SITE, data/ holds the PIPELINE's Node tooling (mapshaper). Each has its own
# pnpm-workspace.yaml, without which this root would claim data/ and the install
# below would report "Already up to date" having installed nothing.
_pnpm_sync() {
    local dir="$1" label="$2"
    echo "  pnpm[$label]: installing from lockfile"
    ( cd "$dir" && pnpm install --frozen-lockfile )
}
if ! in_container; then
    _pnpm_sync "$REPO_ROOT" site
    _pnpm_sync "$SCRIPT_DIR" data
    (cd "$SCRIPT_DIR" && uv sync)
fi
cd "$SCRIPT_DIR"
echo "sync done in $(_elapsed $_t0)"

# Always back up DuckDB + taxa cache on exit (success or failure) so pipeline
# progress (e.g. occurrence_links) is not lost if a later step fails. The upload
# is s3_backup.py (beeatlas-gcdo.1), which confirms S3 holds each file before
# calling it backed up. A failed backup must not pass for a good night
# (beeatlas-pqfr), so the healthcheck ping lives HERE, after the backups, and is
# sent only when the run and its backup both succeeded; a run that succeeded
# but could not back up exits 74 (EX_IOERR). A failed run keeps its own code.
# stelis st-8x1: which build this run appended (captured after fetch-data, by
# epoch match) and how far the run got — the trap turns these into a publish
# receipt. Empty capture = this run appended nothing = nothing to mark.
_sb_num=""
_sb_epoch=""
# _stage is NOT initialised here — it is set beside the signal handler at the top,
# which needs it before the stelis gate, and is already at a later value by now.

trap '
_exit_rc=$?
_backup_ok=1
if [[ -n "${SKIP_PIPELINE_BACKUP:-}" ]]; then
    echo "--- offsite backup SKIPPED (SKIP_PIPELINE_BACKUP) ---"
else
    [[ -f "$DB_PATH" ]] && echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"
    # No state dir yet (a host before its first build) is nothing to lose; a state dir
    # that cannot be archived is a failed backup.
    _stelis_backup=()
    if [[ -d "$STELIS_STATE_DIR" ]]; then
        if tar -C "$(dirname "$STELIS_STATE_DIR")" -czf "$STELIS_ARCHIVE" "$(basename "$STELIS_STATE_DIR")"; then
            _stelis_backup=("$STELIS_S3_KEY=$STELIS_ARCHIVE")
        else
            echo "WARN: could not archive the Stelis state dir $STELIS_STATE_DIR" >&2
            _backup_ok=""
        fi
    fi
    AWS_PROFILE="$AWS_PROFILE" uv run --directory "$SCRIPT_DIR" python s3_backup.py upload \
        --bucket "$BACKUP_BUCKET" \
        "$DB_S3_KEY=$DB_PATH" "$TAXA_S3_KEY=$TAXA_PATH" "$TAXA_CACHE_S3_KEY=$TAXA_CACHE_PATH" \
        "${_stelis_backup[@]}" \
        || _backup_ok=""
fi
# stelis st-8x1 + st-9rf: publish receipt, then the served operator page. AFTER
# the backups — nothing below may block them — and each guarded (|| true): a
# broken stelis checkout degrades to a stale badge, never a lost backup or a
# changed exit code. The receipt is written only when this run CAPTURED its own
# build (epoch-matched after fetch-data); a run that died earlier marks nothing,
# and stelis itself refuses a mismatch or double-mark. Serving the page even on
# a gate abort is deliberate — a failed build is what the page is for; the site
# DATA stays at last-published. merge-swap.sh excludes /build-log.html from its
# --delete.
if [[ -n "${_sb_num:-}" ]]; then
    _outcome="not-published"
    [[ -n "${_published:-}" ]] && _outcome="published"
    ( cd "$STELIS_DIR" && env BEEATLAS_DIR="$REPO_ROOT" racket src/main.rkt \
        --mark-publish "$_sb_num" "$_sb_epoch" "$_outcome" "${_stage:-unknown}" nightly ) || true
fi
if [[ -f "$STELIS_STATE_DIR/build-log.html" && -d "$SITE_ROOT" ]]; then
    cp "$STELIS_STATE_DIR/build-log.html" "$SITE_ROOT/build-log.html" || true
fi
if [[ $_exit_rc -eq 0 && -z "$_backup_ok" ]]; then
    echo "FATAL: the run succeeded but its offsite backup did not (s3_backup above);" >&2
    echo "withholding the healthcheck ping so the miss raises the alarm." >&2
    exit 74
fi
if [[ $_exit_rc -eq 0 && -n "$HEALTHCHECK_URL" ]]; then
    curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null || exit 1
fi
# No `exit` otherwise: falling off the end keeps the status the run exited with, and a run
# killed by a signal (_on_signal) still dies of that signal.
' EXIT

if [[ ! -f "$DB_PATH" ]]; then
    echo "WARN: no DuckDB at $DB_PATH — first run on this layout? Loaders start fresh." >&2
    echo "WARN: migrating hosts? restore the offsite backup first: (cd $SCRIPT_DIR && uv run python s3_backup.py restore --bucket $BACKUP_BUCKET $DB_S3_KEY $DB_PATH)" >&2
fi

# 2. Restore the integration-gate baseline into public/data/ so test_dbt_diff
# can compare tonight's fresh sandbox against the last PUBLISHED data (the
# snapshot in step 7 below — NOT last night's possibly-unpublished export).
# First run: no snapshot yet → the diff tests skip (not fail) on the missing
# files, same first-run semantics as the retired S3 manifest pull.
echo "--- restoring integration baseline ---"
mkdir -p "$REPO_ROOT/public/data"
if [[ -d "$BASELINE_DIR" ]]; then
    _copy_baseline "$BASELINE_DIR" "$REPO_ROOT/public/data"
else
    echo "  no baseline snapshot yet (first run) — diff tests will skip (not fail)"
fi

# 3. Build the data — Stelis via the site repo's own interface (pnpm run
# fetch-data → stelis --build --all --export-dir). Cache + history persist in
# $STELIS_STATE_DIR across nightlies (set near the top, under $VAR_DIR beside the
# DuckDB and export dir they observe — stelis st-7wu), so an unchanged nightly is
# fast and the state does not live in the engine checkout that step 1 updates.
# Replaced run.py at the 2026-07-17 cutover; Model Y (ADR 0007 Amendment)
# narrowed Stelis to the data engine — the site render below is top-level.
echo "--- building data (stelis fetch-data) ---"
_t0=$(date +%s)
export DB_PATH EXPORT_DIR NOTES_DB_PATH
# STELIS_DIR is set and exported in step 1, which also syncs that checkout.
# Log the content-addressed plan (why each task runs/skips) before building, so the
# nightly log records what Stelis decided and why. scripts/fetch-data.sh runs the
# explain pass against the same export dir the build reads (non-fatal on error).
export STELIS_EXPLAIN=1
# The build writes down which build it appended (stelis st-3un), so asking needs
# no second launch. Emptied first, so a run that fails before Stelis starts
# cannot read the last night's answer.
export STELIS_REPORT_DIR="$VAR_DIR/stelis-report-nightly"
rm -rf "$STELIS_REPORT_DIR"
cd "$REPO_ROOT"
_stage="data-build"
_fetch_rc=0
pnpm run fetch-data || _fetch_rc=$?
# stelis st-8x1: capture WHICH build the engine just appended — positively: the
# report names it, and its epoch must match the SOURCE_DATE_EPOCH this run
# exported. A FAILED build appended too, and deserves its not-published receipt,
# hence capturing before the exit below; no report means the run died before
# appending, and the trap marks nothing. A capture failure costs the badge,
# never the run.
if [[ -f "$STELIS_REPORT_DIR/build" ]]; then
    read -r _num _epoch < "$STELIS_REPORT_DIR/build" || true
    if [[ "${_epoch:-}" == "$SOURCE_DATE_EPOCH" ]]; then
        _sb_num="$_num"
        _sb_epoch="$_epoch"
    fi
fi
if [[ $_fetch_rc -ne 0 ]]; then
    echo "--- data build FAILED (rc=$_fetch_rc) in $(_elapsed $_t0) ---" >&2
    exit "$_fetch_rc"
fi
echo "--- data build done in $(_elapsed $_t0) ---"

# 3a. Hostess (ADR 0046) holds no notes store: NOTES_DB_PATH there is an empty one,
# so the build above harvested no notes. Replace that notes/ with the one the Machine
# last published, so the site rendered here carries the notes, and the Machine's
# next harvest finds the notes/ it wrote and stays partial. Before the gates, which
# then judge the tree that is sent. A Machine that cannot be reached stops the run:
# a site without its notes must not be published.
if [[ -n "${NOTES_FROM_FLY_APP:-}" ]]; then
    _stage="machine-notes"
    echo "--- taking notes/ from the Machine ($NOTES_FROM_FLY_APP) ---"
    _incoming="$EXPORT_DIR/.notes-incoming"
    rm -rf "$_incoming"
    mkdir -p "$_incoming"
    # /data/var/export is the Machine's EXPORT_DIR (fly/Dockerfile). tar through
    # `flyctl ssh console` arrives byte for byte (checked against sha256, 2026-10-30).
    # Under the Machine's publish lock, as the app user (fly/deploy.sh does the same),
    # so a note save cannot be half-way through rewriting notes/ while it is packed.
    # A lock held past ten minutes fails the copy, and the check below stops the run.
    "${FLYCTL:-flyctl}" ssh console -q -a "$NOTES_FROM_FLY_APP" \
        -C 'setpriv --reuid=app --regid=app --init-groups flock -w 600 /data/var/publish.lock tar -C /data/var/export -cf - notes' \
        | tar -C "$_incoming" -xf -
    if [[ ! -d "$_incoming/notes" ]]; then
        echo "FATAL: the Machine sent no notes/ directory — aborting publish" >&2
        exit 1
    fi
    rm -rf "$EXPORT_DIR/notes"
    mv "$_incoming/notes" "$EXPORT_DIR/notes"
    rmdir "$_incoming"
    echo "  notes for $(find "$EXPORT_DIR/notes" -name '*.json' | wc -l) species"
fi

# 3b. Compact the DuckDB. Every CREATE OR REPLACE the build does leaves the old
# table's blocks free inside the file, which never shrinks on its own — by
# 2026-10 it was 1.27 GB, ~40% free, all of it uploaded by the backup trap every
# night. data/compact_duckdb.py rewrites it into a fresh file when enough is
# free, verifies the copy, and renames it over the original. Here, not in the
# EXIT trap: it must run while nothing else can write the database, and a
# signal-aborted run can leave a Stelis task still writing. Housekeeping, not a
# gate — a failure leaves the original untouched, so warn and carry on.
_stage="compact-db"
echo "--- compacting DuckDB ---"
cd "$SCRIPT_DIR"
uv run python compact_duckdb.py || echo "WARN: DuckDB compaction failed — original kept" >&2

# 4. Integration (dataset-validation) gate — HARD GATE before build/publish.
#
# ALL @integration tests gate the publish: any single failure exits non-zero
# here, before the site build and merge-swap. Stale data stays live until
# fixed; monitoring catches the skipped healthcheck ping.
#
# The gate runs AFTER Stelis builds fresh dbt artifacts (SANDBOX is populated)
# and AFTER step 2 restored the last-published baseline into public/data/
# (PUBLIC is populated) — the correct regression-diff pairing.
#
# EXPECTED FIRST-RUN BEHAVIOR after an INTENDED occurrences-contract change:
# test_dbt_diff WILL fail — the baseline carries the OLD schema, the sandbox
# the NEW. Correct regression behavior, but a one-time DEADLOCK (the gate
# blocks the publish that would refresh the baseline). Break it with ONE
# gate-bypassed run:
#     SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
# Use the bypass ONLY for an intended, reviewed contract change — never to
# paper over an unexpected diff.
_stage="integration-gate"
echo "--- integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if [[ -n "${SKIP_INTEGRATION_GATE:-}" ]]; then
    echo "WARN: SKIP_INTEGRATION_GATE set — BYPASSING integration gate for this run." >&2
    echo "WARN: intended only for the one-time publish after a reviewed contract change." >&2
elif ! uv run pytest -m integration -x --tb=short -q; then
    echo "INTEGRATION GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
else
    echo "integration gate passed in $(_elapsed $_t0)"
fi

# 5. Render the site. 11ty inlines the baked artifacts straight from
# $EXPORT_DIR (lib/build-data-dir.js honors the env), Vite hashes the
# bundles, and the build's last steps derive _site/data (hashed runtime
# binaries + stable dirs + slim manifest, generated_at from
# SOURCE_DATE_EPOCH above) and record the build receipt a scoped note
# render checks (beeatlas-4oa).
#
# This runs BEFORE the JS gate below, which is the whole point (beeatlas-b4p):
# build-output.data.test.ts used to build the site ITSELF, in a beforeAll, so the
# nightly built twice and gated a tree it then threw away in favour of a second
# build nothing had looked at. They were byte-identical in practice, which is
# exactly why it went unnoticed. Now there is one build and the gate inspects the
# artifact that gets published.
_stage="site-build"
echo "--- building site ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
pnpm run build
echo "--- site build done in $(_elapsed $_t0) ---"
# The build ends by writing the build receipt, which lets a note save render over this
# tree without validating it (ADR 0017). The gate below has not passed the tree yet, so
# withdraw the build receipt until it does, keeping "a build receipt means the gates
# passed" true. It does NOT keep a rejected tree off the site: with no receipt, the
# next note save builds in full from the same export and publishes that, with no
# test:data gate of its own (beeatlas-yvsd).
node scripts/build-receipt.mjs --invalidate

# 5b. JS suites that need the pipeline's artifacts (*.data.test.ts). These are
# excluded from `pnpm test` because a clean CI checkout has no data dir — see
# vite.config.ts and beeatlas-6q2, which is the CI red this split fixes. Here
# the data exists, so they run for real: EXPORT_DIR is already exported above
# and lib/build-data-dir.js resolves it ahead of public/data.
#
# BEEATLAS_SITE_PREBUILT=1 tells build-output.data.test.ts to assert against the
# _site just built above instead of building its own (beeatlas-b4p). The suite
# fails loudly if that tree is missing, so the flag cannot silently gate nothing.
#
# This is a hard gate, like the integration gate: a failure here means the
# rendered site would be wrong, so we abort rather than publish. Note that
# SKIP_INTEGRATION_GATE does NOT bypass it — that flag is scoped to the pytest
# contract gate above.
_stage="js-data-gate"
echo "--- JS data-dependent test gate ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
if ! BEEATLAS_SITE_PREBUILT=1 pnpm run test:data; then
    echo "JS DATA TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "JS data test gate passed in $(_elapsed $_t0)"
node scripts/build-receipt.mjs --write

# 6. Merge-swap into SITE_ROOT (the Apache DocumentRoot). The rsync sequence
# lives in data/merge-swap.sh — THE publish contract, shared with the st-nee
# note-write path (data/publish-notes.sh). Exit 3 = SITE_ROOT absent, which
# for the nightly is a skip (fresh host), not a failure.
_stage="merge-swap"
echo "--- publishing into $SITE_ROOT ---"
_t0=$(date +%s)
_published=""
_swap_rc=0
# MERGE_SWAP_VERIFY: once a day, check the live data files' bytes, not only their names.
MERGE_SWAP_VERIFY=1 BASE_DIR="$BASE_DIR" SITE_ROOT="$SITE_ROOT" bash "$SCRIPT_DIR/merge-swap.sh" || _swap_rc=$?
if [[ $_swap_rc -eq 0 ]]; then
    _published=1
    echo "published in $(_elapsed $_t0)"
elif [[ $_swap_rc -eq 3 ]]; then
    _stage="site-root-absent"
    echo "NOTE: SITE_ROOT $SITE_ROOT absent — publish skipped (install: docs/runbooks/serve-from-maderas.md)" >&2
else
    exit $_swap_rc
fi

# 7. Snapshot the baseline for tomorrow's gate — only after a successful
# publish, so the baseline is always the last data that actually went live.
# A publish-skipped run (no SITE_ROOT) must NOT advance the baseline to data
# that never went live.
if [[ -n "$_published" ]]; then
    echo "--- snapshotting integration baseline ---"
    _copy_baseline "$EXPORT_DIR" "$BASELINE_DIR"
else
    echo "publish skipped — baseline snapshot skipped (stays at last published)"
fi

echo "=== pipeline complete $(_ts) ==="
# The healthcheck ping is in the EXIT trap, after the backups it vouches for.
