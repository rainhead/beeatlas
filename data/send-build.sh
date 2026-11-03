#!/usr/bin/env bash
# Hostess's half of the handoff (ADR 0046, beeatlas-uibw.4). Sends the build that passed
# every gate on Hostess to a staging directory on the Fly Machine's volume, then checks
# the copy there against the Machine's own checkout with the build receipt. A copy that
# passes is one the Machine could serve, and render a note's pages over, without
# building anything itself. Run by data/nightly.sh when SEND_TO_FLY_APP is set.
#
# What goes, under STAGING:
#   export/          EXPORT_DIR: the data the site was built from, notes/ included
#   site/            _site: the rendered site
#   cache/beeatlas-build, cache/beeatlas-vite   the build receipt and Vite's manifest
#   build-log.html   Stelis's page for this build
#
# rsync runs on the Machine as the app user, under a lock of its own so that two sends
# never interleave, and keeps modification times to the nanosecond: the receipt's data
# component compares them. --delete makes each directory an exact copy. The connection
# is `flyctl ssh console` (data/fly-rsh.sh), authorised by FLY_API_TOKEN, a token for
# SSH to this app alone (docs/runbooks/hostess-nightly.md).
#
# Exit 0: sent, and the copy passes the receipt check. 79: sent, and the copy fails
# it, so the Machine runs other code than this build was made with (infra/hostess/
# nightly.sh then builds again at the Machine's commit). Anything else: not sent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=data/fly-lib.sh
. "$SCRIPT_DIR/fly-lib.sh"
EX_STALE=79
FLY_APP="${SEND_TO_FLY_APP:?SEND_TO_FLY_APP names the Fly app to send the build to}"
export FLY_APP FLYCTL="${FLYCTL:-flyctl}"
: "${EXPORT_DIR:?}" "${STELIS_STATE_DIR:?}"

# On the Machine's volume (fly/Dockerfile). The lock is beside the publish lock, which
# this does not take: nothing live is touched here.
STAGING=/data/staging
STAGING_LOCK=/data/var/staging.lock
AS_APP="setpriv --reuid=app --regid=app --init-groups"

# Each source is "<dir>/./<path>": with --relative, rsync recreates <path> under STAGING.
# The trees are reached through symlinks on Hostess (_site is $BASE_DIR/site), so name
# their real paths, and check that each one's path ends in the name it must arrive as.
sources=()
_source() {
    local real want="$2"
    real=$(realpath "$1")
    if [[ "$real" != */"$want" ]]; then
        echo "FATAL: $1 is $real, which cannot arrive on the Machine as $want" >&2
        exit 78  # EX_CONFIG
    fi
    sources+=("${real%/"$want"}/./$want")
}
_source "$EXPORT_DIR" export
_source "$REPO_ROOT/_site" site
_source "$REPO_ROOT/.cache/beeatlas-build" cache/beeatlas-build
_source "$REPO_ROOT/.cache/beeatlas-vite" cache/beeatlas-vite
_source "$STELIS_STATE_DIR/build-log.html" build-log.html

echo "  sending the build to $FLY_APP:$STAGING"
# -rlpt and not -a: as the app user, rsync cannot set owners, and the files should be
# app's anyway. --stats for the log: how much of the tree actually moved. rsync is safe
# to repeat, so a failed send is retried (data/fly-lib.sh).
_send() {
    rsync -rlpt --relative --delete --stats \
        -e "$SCRIPT_DIR/fly-rsh.sh" \
        --rsync-path="$AS_APP flock -w 600 $STAGING_LOCK rsync" \
        "${sources[@]}" "machine:$STAGING/" \
        | grep -E '^(Number of (regular )?files( transferred)?|Total transferred file size|Total bytes sent):'
}
fly_retry _send

echo "  checking the staged build against the Machine's checkout"
_check_log=$(mktemp)
trap 'rm -f "$_check_log"' EXIT
_check() {
    "$FLYCTL" ssh console -q -a "$FLY_APP" -C "$AS_APP flock -w 600 $STAGING_LOCK \
env EXPORT_DIR=$STAGING/export BEEATLAS_SITE_DIR=$STAGING/site BEEATLAS_CACHE_DIR=$STAGING/cache \
node /app/scripts/build-receipt.mjs --check" 2>&1 | tr -d '\r' | tee "$_check_log"
}
# A check that ran and failed is not retried (fly_retry sees the remote exit). It is
# stale only when the receipt says so: the Machine's checkout no longer matches the one
# this build was made from, almost always because a deploy landed after the run read
# the Machine's commit. Any other failure (the lock, the connection) is just a failure.
_check_rc=0
fly_retry _check || _check_rc=$?
if [[ $_check_rc -ne 0 ]]; then
    if grep -q '^build receipt stale:' "$_check_log"; then
        echo "  the staged build does not match the Machine's checkout" >&2
        exit "$EX_STALE"
    fi
    exit "$_check_rc"
fi
