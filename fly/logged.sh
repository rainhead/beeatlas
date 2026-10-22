#!/usr/bin/env bash
# Run one scheduled job with its output in a dated log on the volume (beeatlas-ryli).
#
#   fly/logged.sh <name> <command> [args...]
#
# Fly's log buffer will not hold a nightly's few hundred lines, and a log that falls
# out of it is gone. So the job's output goes to $LOG_DIR/<name>-<date>.log (one file
# a day, appended to, kept 30 days), and only a start line and an end line, with the
# exit status and the log's last lines, go to Fly's log. The job's exit status is
# this script's.
#
# A stop signals the job's whole process group (fly/start.sh), which reaches both
# this script and the job. This script waits on; it does not pass the signal on
# again, which would land a second SIGTERM in the middle of the nightly's backup.

set -uo pipefail

name=${1:?usage: logged.sh <name> <command> [args...]}
shift
dir=${LOG_DIR:-/data/log}
mkdir -p "$dir"
log="$dir/$name-$(date +%F).log"
find "$dir" -maxdepth 1 -name "$name-*.log" -mtime +30 -delete 2> /dev/null || true

echo "$name: started $(date -u +%Y-%m-%dT%H:%M:%SZ), output in $log"
echo "=== $name $(date -u +%Y-%m-%dT%H:%M:%SZ): $*" >> "$log"
"$@" >> "$log" 2>&1 &
child=$!
# Set after the fork, so the job does not inherit it; a trap with a command (not '')
# leaves the job's own signal handling alone.
trap ':' TERM INT HUP
status=0
while true; do
    wait "$child"
    status=$?
    # A signal interrupts wait; keep waiting while the job is still running.
    kill -0 "$child" 2> /dev/null || break
done
echo "$name: exited $status $(date -u +%Y-%m-%dT%H:%M:%SZ); last lines of $log:"
tail -n 5 "$log" | sed 's/^/  /'
exit "$status"
