#!/usr/bin/env bash
# The nightly on Hostess (ADR 0046, ADR 0047). Builds the nightly image (the nightly
# target of fly/Dockerfile) at the commit the Fly Machine is running, and runs it with
# ~/beeatlas-nightly mounted as its /data. Inside, fly/nightly-entry.sh runs
# data/nightly.sh. Setting up and operating it: docs/runbooks/hostess-nightly.md.
#
# beeatlas-nightly.service does not run this file where it sits: it copies main's
# version out of the checkout first and runs the copy, so this file must work with
# any commit the Machine may be running, not only with main. The body is functions,
# and the only call is on the last line, so that bash has read all of it before
# anything changes underneath.
#
# Hostess needs git, docker and flyctl, nothing else: the pipeline's tools are the
# image's. The checkout at ~/beeatlas-nightly/beeatlas is only where commits are
# fetched; the image is built from `git archive` of one, never from its working tree.

set -euo pipefail

# Variables passed into the container from this run's environment, besides those named
# in nightly.env (which systemd has already put in the environment, and which are
# passed by name too): the switches an operator may set for one run by hand
# (data/nightly.sh and data/fly-lib.sh read them). Only these reach the container, so
# nothing else of the host's environment does.
PASS_THROUGH=(
    SKIP_INTEGRATION_GATE SKIP_STELIS_GATE SKIP_PIPELINE_BACKUP HEALTHCHECK_URL
    FLY_RETRY_WAITS ECDYSIS_CACHE_TTL_SECONDS ECDYSIS_SKIP_PROBE STELIS_REBUILD_KEYS
    SOURCE_DATE_EPOCH
)
# The image's user, app, is uid and gid 1000 (fly/Dockerfile). Files it writes under
# /data are this host's user's only if that user is 1000 too.
IMAGE_UID=1000

main() {
    BASE_DIR="${BASE_DIR:-$HOME/beeatlas-nightly}"
    FLY_APP="${FLY_APP:-beeatlas}"
    FLYCTL="${FLYCTL:-$HOME/.fly/bin/flyctl}"
    NIGHTLY_ENV_FILE="${NIGHTLY_ENV_FILE:-$HOME/.config/beeatlas/nightly.env}"
    # One container per layout, so that a trial against a copy of the layout and the
    # 03:00 run never collide by name.
    CONTAINER="beeatlas-nightly-$(printf '%s' "$BASE_DIR" | sha256sum | cut -c1-8)"

    mkdir -p "$BASE_DIR/log"
    exec >> "$BASE_DIR/log/nightly-$(date +%F).log" 2>&1
    echo "=== hostess nightly $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

    # systemd starts this with a bare PATH.
    export PATH="/usr/local/bin:/usr/bin:/bin"
    local tool
    for tool in git docker sha256sum; do
        command -v "$tool" > /dev/null || { echo "FATAL: $tool is not on PATH ($PATH)" >&2; exit 78; }
    done
    [[ -x "$FLYCTL" ]] || { echo "FATAL: no flyctl at $FLYCTL" >&2; exit 78; }
    if [[ "$(id -u)" != "$IMAGE_UID" || "$(id -g)" != "$IMAGE_UID" ]]; then
        echo "FATAL: this user is $(id -u):$(id -g), the image's app user is $IMAGE_UID:$IMAGE_UID;" \
            "files the run writes under $BASE_DIR would not be this user's" >&2
        exit 78
    fi

    # A deploy that lands while this run builds leaves the build made from code the
    # Machine no longer runs, and its check on the Machine fails: data/nightly.sh exits
    # 79. Then build again, once, at the Machine's new commit. A second 79, or a 79 with
    # the Machine still at the same commit, is a failure like any other.
    local attempt sha rc
    for attempt in 1 2; do
        sha=$(_machine_sha) || exit 69  # EX_UNAVAILABLE
        # Called plainly, so that set -e stops the run on any failure inside it; only
        # the container's status is caught. (A function called as `f || rc=$?` runs
        # with set -e off throughout.)
        _image_at "$sha"
        rc=0
        _run || rc=$?
        if [[ $rc -eq 79 && $attempt -eq 1 && -z "${NIGHTLY_COMMIT:-}" ]]; then
            local now
            now=$(_machine_sha) || exit 69
            if [[ "$now" != "$sha" ]]; then
                echo "=== the Machine moved from $sha to $now during the build; building again ==="
                continue
            fi
        fi
        _prune
        exit "$rc"
    done
}

# The commit the Machine runs is its image's GITHUB_SHA. The manifest's build_id is
# not it: that names the commit that last rendered (ADR 0045). Retried, because Fly's
# API fails now and then (beeatlas-uibw.10).
_machine_sha() {
    local wait sha
    for wait in 30 60 120 ""; do
        sha=$("$FLYCTL" ssh console -q -a "$FLY_APP" -C 'printenv GITHUB_SHA' | tr -d '\r\n') || true
        if [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
            echo "$sha"
            return 0
        fi
        [[ -n "$wait" ]] || break
        echo "  could not read the Machine's GITHUB_SHA (got '$sha'); trying again in ${wait}s" >&2
        sleep "$wait"
    done
    echo "FATAL: could not read the Machine's GITHUB_SHA (got '$sha')" >&2
    return 1
}

# _image_at SHA: make sure the nightly image for SHA exists, building it if not, and
# set IMAGE and the run's switches. Not called in a subshell: the exports are the run's.
_image_at() {
    local sha="$1"
    local checkout="$BASE_DIR/beeatlas"
    git -C "$checkout" fetch -q origin
    # For testing a change to the image or to data/nightly.sh before it is deployed:
    # build another commit, which must already be in the checkout (fetched from origin
    # above, or by hand from a development checkout, as the runbook shows). Never for a
    # run whose build is sent to the Machine, which would then render note saves with
    # different code from the code that built the site. Such a run backs up nothing and
    # pings nobody, whatever nightly.env says: its DuckDB must not replace production's
    # backup, nor its success stand in for a night's.
    if [[ -n "${NIGHTLY_COMMIT:-}" ]]; then
        echo "WARN: NIGHTLY_COMMIT set — building $NIGHTLY_COMMIT, not the Machine's $sha;" \
            "no backup, no healthcheck ping, nothing sent to the Machine" >&2
        sha=$(git -C "$checkout" rev-parse --verify -q "$NIGHTLY_COMMIT^{commit}") || {
            echo "FATAL: NIGHTLY_COMMIT $NIGHTLY_COMMIT is not a commit in $checkout" >&2
            exit 78
        }
        export SKIP_PIPELINE_BACKUP=1 HEALTHCHECK_URL=
    fi
    git -C "$checkout" cat-file -e "$sha^{commit}" || {
        echo "FATAL: $sha is not in $checkout after a fetch" >&2
        exit 78
    }
    # A commit from before ADR 0047 has no nightly target. Say so, rather than fail
    # somewhere inside docker build. Read whole before matching: grep -q stops at the
    # match, and under pipefail a `git show` still writing would turn that into a miss.
    local dockerfile
    dockerfile=$(git -C "$checkout" show "$sha:fly/Dockerfile")
    if ! grep -q '^FROM base AS nightly' <<< "$dockerfile"; then
        echo "FATAL: the Machine runs $sha, whose fly/Dockerfile has no nightly target" >&2
        echo "(ADR 0047). Deploy a later commit to the Machine." >&2
        exit 78
    fi

    IMAGE="beeatlas-nightly:$sha"
    echo "  beeatlas $sha, stelis $(git -C "$checkout" show "$sha:fly/stelis-commit" | tr -d '[:space:]')"
    if docker image inspect "$IMAGE" > /dev/null 2>&1; then
        echo "  image $IMAGE already built"
    else
        _build "$checkout" "$sha"
    fi

    # Where the build goes. A run of another commit (NIGHTLY_COMMIT) builds with code
    # the Machine does not run, so it sends nothing, as it backs up nothing.
    export NOTES_FROM_FLY_APP="$FLY_APP"
    if [[ -z "${NIGHTLY_COMMIT:-}" ]]; then
        export SEND_TO_FLY_APP="$FLY_APP"
    else
        unset SEND_TO_FLY_APP  # including one inherited from the environment
    fi
}

# _build CHECKOUT SHA: build the nightly target from the commit alone. `git archive`
# rather than the working tree, so that nothing git does not track (an old run's
# outputs, a developer's files) reaches the image.
_build() {
    local checkout="$1" sha="$2" stelis_sha stelis_digest t0
    stelis_sha=$(git -C "$checkout" show "$sha:fly/stelis-commit" | tr -d '[:space:]')
    stelis_digest=$(git -C "$checkout" show "$sha:fly/stelis-digest" | tr -d '[:space:]')
    [[ "$stelis_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "FATAL: fly/stelis-commit at $sha: not a commit: '$stelis_sha'" >&2; exit 78; }
    [[ "$stelis_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "FATAL: fly/stelis-digest at $sha: not a digest: '$stelis_digest'" >&2; exit 78; }
    echo "--- building $IMAGE ---"
    t0=$(date +%s)
    git -C "$checkout" archive --format=tar "$sha" \
        | docker build --progress=plain -f fly/Dockerfile --target nightly \
            --build-arg GITHUB_SHA="$sha" \
            --build-arg STELIS_SHA="$stelis_sha" \
            --build-arg STELIS_IMAGE="ghcr.io/rainhead/stelis@$stelis_digest" \
            -t "$IMAGE" -
    echo "  built in $(( $(date +%s) - t0 ))s"
}

# _run: run the image, and return its status. A run already going for this layout
# (a manual one, or last night's that has not finished) is waited for rather than
# removed: the old nightly queued on the publish lock the same way.
_run() {
    local state args=() name
    state=$(docker container inspect -f '{{.State.Status}}' "$CONTAINER" 2> /dev/null || true)
    if [[ "$state" == running ]]; then
        echo "  $CONTAINER is still running; waiting for it to finish"
        docker wait "$CONTAINER" > /dev/null || true
    fi
    # Gone with --rm, unless the daemon stopped mid-run; an exited one only holds the name.
    docker rm "$CONTAINER" > /dev/null 2>&1 || true

    # By name only (`-e NAME`): docker takes the value from this environment, so a
    # value is never on a command line, and an unset name is left out, while one set
    # but empty (HEALTHCHECK_URL= in a trial) arrives empty. Not --env-file, which
    # would keep nightly.env's quotes as part of the values.
    if [[ -f "$NIGHTLY_ENV_FILE" ]]; then
        while read -r name; do
            args+=(-e "$name")
        done < <(sed -n 's/^[[:space:]]*\(export[[:space:]]\+\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=.*/\2/p' "$NIGHTLY_ENV_FILE")
    fi
    for name in "${PASS_THROUGH[@]}" SEND_TO_FLY_APP NOTES_FROM_FLY_APP; do
        args+=(-e "$name")
    done

    echo "--- running $IMAGE as $CONTAINER ---"
    # --stop-timeout: `docker stop` (beeatlas-nightly.service's ExecStopPost) gives the
    # run ten minutes to finish its backups before it is killed. --cpu-shares: the
    # host's Nice=10 does not reach a container. No --memory: an out-of-memory kill
    # would read as a failed gate.
    # The labels say which layout the run is for and which systemd invocation started
    # it (INVOCATION_ID, which systemd sets for a unit's processes; "manual" otherwise).
    # beeatlas-nightly.service stops only a container its own invocation started, never
    # one it only waited for above.
    docker run --rm --name "$CONTAINER" \
        --label "beeatlas-nightly.base=$BASE_DIR" \
        --label "beeatlas-nightly.invocation=${INVOCATION_ID:-manual}" \
        --stop-timeout 600 --cpu-shares 512 \
        -v "$BASE_DIR:/data" \
        "${args[@]}" \
        "$IMAGE"
}

# Keep this run's image and the newest other one (usually last night's); drop the rest.
# Then trim Docker's build cache to 20 GB. That cache is the whole host's, shared with
# every other project's builds, so the limit is for all of them. Housekeeping: a
# failure here never changes the run's status.
_prune() {
    docker images beeatlas-nightly --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' \
        | sort -r | cut -f2 | grep -vxF "$IMAGE" | tail -n +2 \
        | xargs -r docker rmi > /dev/null 2>&1 || true
    docker builder prune -f --max-used-space 20GB > /dev/null 2>&1 || true
}

main "$@"
