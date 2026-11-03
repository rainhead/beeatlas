# Calls to the Fly Machine over `flyctl ssh console`, retried (beeatlas-uibw.10).
# Sourced by data/nightly.sh and data/send-build.sh on Hostess (ADR 0046).
#
# Every one of these calls first asks Fly's API for the app and its organization, and
# on 2026-11-01 one such request returned 503 and cost the night's build, which had
# already passed every gate. Fly's API failing for a minute is not a reason to lose a
# night, so a failed call is tried again. Two kinds of failure are not retried:
#
#   - The remote command ran and failed. flyctl reports that as "Process exited with
#     status N" (and exits 1, whatever N was). Running it again would fail again, or
#     worse, wait out the same ten-minute lock a second time.
#   - The caller says the command must not run twice. Pass only commands that are safe
#     to repeat: reading a value, copying a tree, rsync. data/finish-publish.sh is
#     not one, so data/nightly.sh retries only a no-op before it (fly_reachable).
#
# FLY_RETRY_WAITS is the wait before each retry, in seconds; its length is the number
# of retries. The default rides out a few minutes of trouble at Fly.

FLY_RETRY_WAITS="${FLY_RETRY_WAITS:-30 60 120}"

# fly_retry CMD [ARG...]: run CMD, retrying as above. Its standard output passes
# through untouched (it may be a stream, as with tar); its standard error is shown
# after each attempt. Returns CMD's status from the last attempt.
fly_retry() {
    local waits wait rc err
    read -r -a waits <<< "$FLY_RETRY_WAITS"
    err=$(mktemp)
    for wait in "${waits[@]}" ""; do
        rc=0
        "$@" 2> "$err" || rc=$?
        cat "$err" >&2
        if [[ $rc -eq 0 ]] || grep -q 'Process exited with status' "$err" || [[ -z "$wait" ]]; then
            break
        fi
        echo "  the call to the Machine failed (rc=$rc); trying again in ${wait}s" >&2
        sleep "$wait"
    done
    rm -f "$err"
    return "$rc"
}

# fly_reachable APP: a no-op on the Machine, retried, for a caller about to run a
# command that must not be repeated. It proves Fly's API and the tunnel answer now,
# which is where every failure so far has been.
fly_reachable() {
    fly_retry "${FLYCTL:-flyctl}" ssh console -q -a "$1" -C true
}
