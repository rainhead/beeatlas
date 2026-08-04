#!/usr/bin/env bash
# offline-leak-check.sh — find what an app launch still fetches from the network.
#
# THE IDEA. Testing offline behaviour by going offline is self-defeating: the
# requests you care about are the ones that FAIL, and a failed request tells you
# very little and is hard to observe from inside the page. So leave the network
# UP and watch the server instead. Anything that reaches Apache is, by
# definition, a request that escaped both the service worker and the browser's
# HTTP cache — which is exactly the set that would have failed offline.
#
# WHY THIS BEATS INSTRUMENTING THE PAGE. src/net-log.ts can only see `fetch` and
# XHR from the page's own realm. The access log sees everything:
#   - resources the BROWSER requests (manifest.webmanifest, icons) — no JS
#     initiates those, so nothing in the page can observe them;
#   - the service worker's own fetches;
#   - requests from workers in other realms (the SQLite engine runs in an inline
#     blob: worker, outside the SW scope and invisible to page instrumentation);
#   - the browser's soft service-worker update check for /sw.js.
# Every one of those was a real culprit or suspect during beeatlas-6rs, and the
# first three were each found the slow way.
#
# HOW TO USE IT
#   1. Device or Simulator ONLINE. Force-quit the installed app.
#   2. Relaunch it, let it settle.
#   3. Run this. Whatever it lists is what an offline launch would have failed on.
#
# Reading the output: fewer lines is better. A fully cache-served launch produces
# nothing at all. Note that a fresh entry in the browser's HTTP cache also serves
# offline, so this list is slightly conservative — it can name a request that
# would in fact have succeeded. It never misses one that would have failed.
#
# Usage:
#   bash scripts/offline-leak-check.sh              # last 30 min, iPhone only
#   bash scripts/offline-leak-check.sh 120          # last 120 min
#   bash scripts/offline-leak-check.sh 30 Macintosh # a different client
set -euo pipefail

MINUTES="${1:-30}"
CLIENT="${2:-iPhone}"
HOST="${BEEATLAS_HOST:-maderas}"
LOG="${BEEATLAS_ACCESS_LOG:-/var/log/apache2/beeatlas.net-access.log}"

echo "Requests from '$CLIENT' that REACHED the server in the last ${MINUTES}m."
echo "Each one is a request an offline launch would have failed on."
echo "(sudo on $HOST will prompt)"
echo

# shellcheck disable=SC2029  # $MINUTES/$CLIENT are ours and deliberately expanded here
ssh -t "$HOST" "sudo awk -v since=\$(date -d '-${MINUTES} min' '+%s') '
  /${CLIENT}/ {
    # [03/Aug/2026:10:13:22 +0000] -> epoch, so old lines are skipped cheaply
    t = \$4; gsub(/^\[/, \"\", t);
    split(t, a, /[\/:]/);
    m = index(\"JanFebMarAprMayJunJulAugSepOctNovDec\", a[2]);
    m = (m + 2) / 3;
    ts = mktime(a[3] \" \" m \" \" a[1] \" \" a[4] \" \" a[5] \" \" a[6]);
    if (ts >= since) printf \"%-9s %-4s %s\n\", a[4]\":\"a[5]\":\"a[6], \$9, \$7;
  }' $LOG" || {
  echo
  echo "If that failed on sudo, run it directly instead:" >&2
  echo "  ssh -t $HOST 'sudo tail -200 $LOG | grep $CLIENT'" >&2
}
