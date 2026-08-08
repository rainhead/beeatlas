#!/bin/bash
# Find better photos for our species, from siblings of the observations we already ship.
#
#   launchctl submit -l com.beeatlas.siblings \
#     -o <abs>/.cache/photo-pipeline/out/siblings.log \
#     -e <abs>/.cache/photo-pipeline/out/siblings.err \
#     -- /bin/bash <abs>/scripts/photo-pipeline/run-siblings.sh
#
# Runs the MODEL on Hostess (the Windows desktop, ~3.4x faster) via the Mac's LM Studio
# LM Link proxy on localhost:1234. Scripts and images stay here; only inference is remote,
# and each request carries ~70 KB of base64 against ~3.6 s of compute, so the link is not
# a bottleneck. Keeping the heavy work off the laptop matters independently of speed --
# it is a laptop, and it is often on a lap.
#
# launchd, not an agent background task: Claude Code SIGTERMs tracked background tasks on
# context compaction. NOTE launchd cannot see GUI-session SMB mounts, but this job touches
# none -- everything is local plus HTTP to localhost.
#
# Stages, each resumable, so an interruption costs at most one photo:
#   1 enumerate siblings   (iNat API, rate-limited)
#   2 download them        (rate-limited, weakest-first)
#   3 locate the bee       (the long stage)
#   4 propose swaps + build the review page

set -u
cd "$(dirname "$0")/../.." || exit 1

NODE=${NODE:-/Users/rainhead/.nvm/versions/node/v24.18.0/bin/node}
MODEL=${MODEL:-qwen/qwen3-vl-32b-instruct}   # hosted; use a local id with PROVIDER=local
PROVIDER=${PROVIDER:-openrouter}
DATA=.cache/photo-pipeline
JSONL="$DATA/out/locate-${MODEL//\//_}-siblings.jsonl"

say() { echo "$(date '+%H:%M:%S') $*"; }
[ -x "$NODE" ] || { say "FATAL: no node at $NODE"; exit 1; }

say "=== 1/4 enumerating siblings ==="
"$NODE" scripts/photo-pipeline/fetch-siblings.mjs --under 45 --model "$MODEL" || { say "FATAL: fetch-siblings"; exit 1; }

say "=== 2/4 downloading ==="
"$NODE" scripts/photo-pipeline/download-siblings.mjs || { say "FATAL: download-siblings"; exit 1; }

TARGET=$("$NODE" -e 'const p=JSON.parse(require("fs").readFileSync(".cache/photo-pipeline/out/sibling-pool.json","utf8"));console.log(new Set(p.map(x=>x.photo_id)).size)')
[ "$TARGET" -gt 0 ] 2>/dev/null || { say "FATAL: bad target '$TARGET'"; exit 1; }

say "=== 3/4 locating bees in $TARGET siblings on $MODEL ==="
for attempt in $(seq 1 60); do
  have=$(wc -l < "$JSONL" 2>/dev/null | tr -d ' '); have=${have:-0}
  [ "$have" -ge "$TARGET" ] && { say "COMPLETE $have/$TARGET"; break; }

  say "--- attempt $attempt, $have/$TARGET ---"
  before=$have
  "$NODE" scripts/photo-pipeline/locate.mjs --model "$MODEL" --pool sibling-pool.json --tag siblings --provider "$PROVIDER"
  after=$(wc -l < "$JSONL" 2>/dev/null | tr -d ' '); after=${after:-0}

  # Refresh the reviewable artifact each cycle, so an interrupted run still leaves
  # something usable rather than only a JSONL.
  "$NODE" scripts/photo-pipeline/compare-siblings.mjs --model "$MODEL" >/dev/null 2>&1

  if [ "$after" -le "$before" ]; then say "no progress ($before -> $after), backing off 60s"; sleep 60; else sleep 3; fi
done

say "=== 4/4 proposing swaps ==="
"$NODE" scripts/photo-pipeline/compare-siblings.mjs --model "$MODEL"

say "done"
launchctl remove com.beeatlas.siblings 2>/dev/null || true
