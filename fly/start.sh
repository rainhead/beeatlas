#!/usr/bin/env bash
# The Machine's one process (beeatlas-ryli, ADR 0042): Caddy, the write API and the
# schedule side by side, under this script. One process, on purpose. Fly's
# [processes] would put each on a Machine of its own, and a volume attaches to one
# Machine; the synchronous note publish needs the API, the Stelis state, the DuckDB,
# the checkout and the site root on one filesystem. Do not split them.
#
# The same shape as salishsea's fly/start.sh. If Caddy or the schedule exits, or
# Caddy stops answering, this exits non-zero and Fly restarts the Machine (its
# default on-failure policy; a failing Fly health check only stops routing). The API
# is restarted on its own, so an API that cannot start does not take the site down.
set -euo pipefail

# Fly mounts the volume owned by root. Lay it out once, as root, then run everything
# as `app`.
if [ "$(id -u)" = 0 ]; then
    bash /app/fly/prepare-volume.sh
    exec setpriv --reuid=app --regid=app --init-groups "$0" "$@"
fi

# The API's secrets are taken out of the environment before anything starts, so only
# the API is handed them. Hygiene rather than a boundary: everything runs as `app`.
client_secret="${INAT_CLIENT_SECRET:-}"
session_key="${SESSION_SIGNING_KEY:-}"
unset INAT_CLIENT_SECRET SESSION_SIGNING_KEY

caddy_pid='' api_pid='' cron_pid='' watchdog_pid=''

# The process groups of supercronic's running jobs. supercronic puts each job in a
# group of its own and, stopping, waits for the jobs without signalling them, so a
# stop would end a running nightly with Fly's SIGKILL and skip its EXIT trap, the
# offsite backup. Signalling the job's group instead is what a terminal's ^C does,
# which is the path data/nightly.sh's signal handler was written for.
job_groups() {
    local stat fields
    for stat in /proc/[0-9]*/stat; do
        fields=$(sed 's/^.*) //' "$stat" 2> /dev/null) || continue
        # shellcheck disable=SC2086 # split on purpose: state ppid pgrp ...
        set -- $fields
        [ "${2:-}" = "$cron_pid" ] && echo "$3"
    done
}

# Stopping. Fly sends SIGTERM (fly.toml's kill_signal) and SIGKILLs after
# kill_timeout, 300 s, the most it allows. The schedule goes first, so a running
# nightly gets its signal and time for its backup; then the API, then Caddy, which
# serves until the end.
# shellcheck disable=SC2329 # invoked by the trap and the watchdog below
stop() {
    local status=${1:-0}
    echo "stopping: the schedule (a running job gets SIGTERM), then the API, then Caddy" >&2
    if [ -n "$cron_pid" ]; then
        for g in $(job_groups); do kill -TERM -- "-$g" 2> /dev/null || true; done
        kill -TERM "$cron_pid" 2> /dev/null || true
        wait "$cron_pid" || true
    fi
    # shellcheck disable=SC2086 # an empty pid is no argument
    kill -TERM $watchdog_pid 2> /dev/null || true
    if [ -n "$api_pid" ]; then
        kill -TERM "$api_pid" 2> /dev/null || true
        wait "$api_pid" || true
    fi
    if [ -n "$caddy_pid" ]; then
        kill -TERM "$caddy_pid" 2> /dev/null || true
        wait "$caddy_pid" || true
    fi
    exit "$status"
}
trap stop TERM INT

# Caddy, with the species redirects the last publish left (fly/caddy-redirects.sh).
bash /app/fly/caddy-redirects.sh || echo "species redirects unavailable; their meta-refresh pages still forward" >&2
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

# The write API, only when API_ENABLED is set (fly.toml). Restarted here after a
# pause, not by the wait below, while Caddy keeps serving.
if [ -n "${API_ENABLED:-}" ] && [ "${API_ENABLED}" != 0 ]; then
    (
        set +e  # -e would end the loop at the API's first exit
        cd /app
        stopping='' child=''
        trap 'stopping=1; [ -z "$child" ] || kill -TERM "$child"' TERM
        while [ -z "$stopping" ]; do
            INAT_CLIENT_SECRET="$client_secret" SESSION_SIGNING_KEY="$session_key" \
                uv run --no-sync --project /app/data python -m api.serve &
            child=$!
            wait "$child"
            status=$?
            [ -z "$stopping" ] || { wait "$child"; exit 0; }
            child=''
            echo "write API exited ($status); restarting in 10 s" >&2
            sleep 10
        done
    ) &
    api_pid=$!
fi

# The schedule (fly/crontab), in the image's TZ, America/Los_Angeles, which
# supercronic honors: the nightly at 03:00 Pacific, as on maderas, not 03:00 UTC.
supercronic /app/fly/crontab &
cron_pid=$!

# A deploy changes the site's code without changing its data, so the first boot of a
# new image renders the site against the last published export (data/publish-code.sh
# in container mode, ADR 0042: a release_command Machine has no volume). It takes the
# publish lock, so it waits for a running nightly. Not watched: a failed render leaves
# the last good site in place, and the next nightly renders anyway.
rendered=/data/var/rendered-commit
if [ "$(cat "$rendered" 2> /dev/null || true)" != "${GITHUB_SHA:-}" ] && [ -d /data/var/export ]; then
    (
        if /app/fly/logged.sh deploy-render bash /app/data/publish-code.sh; then
            echo "${GITHUB_SHA:-}" > "$rendered"
        fi
    ) &
fi

# The watchdog: Caddy answering is what this Machine is for, and a wedged Caddy does
# not exit. Three failed probes in a row, a minute and a half, stop the Machine so Fly
# restarts it.
(
    failures=0
    sleep 30
    while sleep 30; do
        if curl -fsS -o /dev/null --max-time 5 http://localhost:8080/healthz; then
            failures=0
        else
            failures=$((failures + 1))
            echo "watchdog: Caddy did not answer /healthz ($failures of 3)" >&2
            [ "$failures" -lt 3 ] || exit 1
        fi
    done
) &
watchdog_pid=$!

# Any of the three ending is a failure, whatever its status: a clean exit would read to
# Fly as a finished Machine, not one to restart.
wait -n "$caddy_pid" "$cron_pid" "$watchdog_pid" || true
echo "caddy, supercronic or the watchdog ended; stopping so Fly restarts the Machine" >&2
stop 1
