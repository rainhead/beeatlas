#!/usr/bin/env bash
# The nightly on Hostess (ADR 0046). Checks out the commit the Fly Machine is
# running, sets up Hostess's layout, and runs data/nightly.sh from that commit.
# Setting up and operating it: docs/runbooks/hostess-nightly.md.
#
# beeatlas-nightly.service does not run this file where it sits: it copies main's
# version out of the checkout first and runs the copy. The checkout below can move
# to a commit older than this file, and a service that ran it in place would then
# have nothing to start the next night. The body is one function, called on the last
# line, so that bash has read all of it before anything changes underneath.

set -euo pipefail

main() {
    BASE_DIR="${BASE_DIR:-$HOME/beeatlas-nightly}"
    local checkout="$BASE_DIR/beeatlas"
    export STELIS_DIR="$BASE_DIR/stelis"
    FLY_APP="${FLY_APP:-beeatlas}"
    export FLYCTL="${FLYCTL:-$HOME/.fly/bin/flyctl}"

    mkdir -p "$BASE_DIR/log"
    exec >> "$BASE_DIR/log/nightly-$(date +%F).log" 2>&1
    echo "=== hostess nightly $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

    # systemd starts this with a bare PATH. Racket and uv are installed per user;
    # node comes from nvm, which data/nightly.sh activates from .nvmrc.
    export PATH="$HOME/.local/racket/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
    local tool
    for tool in racket raco uv git; do
        command -v "$tool" > /dev/null || { echo "FATAL: $tool is not on PATH ($PATH)" >&2; exit 78; }
    done
    [[ -x "$FLYCTL" ]] || { echo "FATAL: no flyctl at $FLYCTL" >&2; exit 78; }

    # The commit the Machine runs is its image's GITHUB_SHA. The manifest's build_id
    # is not it: that names the commit that last rendered (ADR 0045).
    local sha
    # `|| true`, so a failed call reaches the message below instead of ending the run
    # under set -e with no reason given; flyctl's own error goes to the log.
    sha=$("$FLYCTL" ssh console -q -a "$FLY_APP" -C 'printenv GITHUB_SHA' | tr -d '\r\n') || true
    if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
        echo "FATAL: could not read the Machine's GITHUB_SHA (got '$sha')" >&2
        exit 69  # EX_UNAVAILABLE
    fi
    # For testing a change to this script or to data/nightly.sh before it is
    # deployed: build another commit, which must already be in the checkout. Never
    # for a run whose build is sent to the Machine, which would then render note
    # saves with different code from the code that built the site.
    # Such a run backs up nothing and pings nobody, whatever nightly.env says: its
    # DuckDB must not replace production's backup, nor its success stand in for a
    # night's.
    if [[ -n "${NIGHTLY_COMMIT:-}" ]]; then
        echo "WARN: NIGHTLY_COMMIT set — building $NIGHTLY_COMMIT, not the Machine's $sha;" \
            "no backup, no healthcheck ping" >&2
        sha="$NIGHTLY_COMMIT"
        export SKIP_PIPELINE_BACKUP=1 HEALTHCHECK_URL=
    fi
    # --force: these checkouts belong to the nightly and hold nothing of anyone's. The
    # integration gate restores its baseline into public/data/, which has tracked
    # files, and a checkout that refused to overwrite them would stop every night.
    git -C "$checkout" fetch -q origin
    git -C "$checkout" checkout -q --force --detach "$sha"
    local stelis_sha
    stelis_sha=$(cat "$checkout/fly/stelis-commit")
    git -C "$STELIS_DIR" fetch -q origin
    git -C "$STELIS_DIR" checkout -q --force --detach "$stelis_sha"
    echo "  beeatlas $sha, stelis $stelis_sha"
    # A commit from before ADR 0046 has a data/nightly.sh that would pull on this
    # detached checkout and harvest notes from the empty store. Say so, rather than
    # fail somewhere inside it.
    if ! grep -q BEEATLAS_CODE_PINNED "$checkout/data/nightly.sh"; then
        echo "FATAL: the Machine runs $sha, whose data/nightly.sh predates the nightly on" >&2
        echo "Hostess (ADR 0046). Deploy a later commit to the Machine; until then its" >&2
        echo "own schedule must run the nightly (fly/crontab)." >&2
        exit 78  # EX_CONFIG
    fi

    # The volume's layout (fly/Dockerfile, ADR 0044): what the pipeline writes inside
    # the checkout lives in BASE_DIR, behind symlinks, so a checkout never carries
    # state and the build receipt never counts it. Listed in .git/info/exclude
    # because a .gitignore pattern ending in / does not match a symlink.
    local link target
    while read -r link target; do
        mkdir -p "$BASE_DIR/$target"
        if [[ ! -L "$checkout/$link" ]]; then
            rm -rf "${checkout:?}/$link"
            ln -s "$BASE_DIR/$target" "$checkout/$link"
        fi
        grep -qxF "/$link" "$checkout/.git/info/exclude" || echo "/$link" >> "$checkout/.git/info/exclude"
    done << 'EOF'
data/raw raw
data/.ecdysis_cache ecdysis-zip
data/.geography_cache geography-cache
data/.burke_cache burke-cache
.cache cache
_site site
data/dbt/target dbt-target
EOF

    # The same environment the image sets. SITE_ROOT does not exist on Hostess, so
    # data/nightly.sh skips the merge-swap; the handoff to the Machine replaces it
    # (beeatlas-uibw.4, .5).
    export BASE_DIR
    export SITE_ROOT="$BASE_DIR/htdocs"
    export VAR_DIR="$BASE_DIR/var"
    export STELIS_STATE_DIR="$VAR_DIR/stelis"
    export DB_PATH="$VAR_DIR/beeatlas.duckdb"
    export EXPORT_DIR="$VAR_DIR/export"
    export BASELINE_DIR="$VAR_DIR/baseline"
    export DLT_DATA_DIR="$BASE_DIR/dlt"
    export TZ=America/Los_Angeles
    export BEEATLAS_CODE_PINNED=1
    export NOTES_FROM_FLY_APP="$FLY_APP"

    # Hostess never holds the notes store (ADR 0046). The build reads an empty one,
    # made afresh from this commit's migrations so it always has their schema, and
    # data/nightly.sh then takes the Machine's published notes/.
    export NOTES_DB_PATH="$BASE_DIR/notes/empty.db"
    mkdir -p "$BASE_DIR/notes"
    rm -f "$NOTES_DB_PATH"
    (cd "$checkout/data" && uv run --frozen alembic -c notes_store/migrations/alembic.ini upgrade head) > /dev/null

    exec bash "$checkout/data/nightly.sh"
}

main "$@"
