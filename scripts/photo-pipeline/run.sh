#!/bin/bash
# Run the photo pipeline to completion, surviving interruption.
#
#   scripts/photo-pipeline/run.sh                      # foreground
#   launchctl submit -l com.beeatlas.photos \
#     -o .cache/photo-pipeline/out/run.log \
#     -e .cache/photo-pipeline/out/run.err \
#     -- /bin/bash <ABSOLUTE PATH>/scripts/photo-pipeline/run.sh
#
# RUN IT UNDER launchd, not as an agent background task. Claude Code SIGTERMs every
# tracked background task when the session compacts
# (github.com/anthropics/claude-code/issues/25188) -- confirmed locally with paired
# canaries, and it killed this run three times before the move to launchd. A retry wrapper
# does not help, because the wrapper is itself a tracked task and dies in the same sweep.
#
# ABSOLUTE NODE PATH IS REQUIRED: launchd does not inherit the interactive shell's PATH,
# so bare `node` is not found. That failure is SILENT -- variables come back empty, numeric
# tests quietly fail, and the job looks alive while doing nothing. Hence the loud check.

set -u
cd "$(dirname "$0")/../.." || exit 1   # repo root

NODE=${NODE:-/Users/rainhead/.nvm/versions/node/v24.18.0/bin/node}
DATA=.cache/photo-pipeline
JSONL=$DATA/out/locate-qwen3-vl-8b-instruct-mlx.jsonl

say() { echo "$(date '+%H:%M:%S') $*"; }
[ -x "$NODE" ] || { say "FATAL: node not executable at $NODE"; exit 1; }

say "=== downloading manifest photos (rate-limited 1/sec) ==="
"$NODE" scripts/photo-pipeline/download-photos.mjs || { say "FATAL: download-photos"; exit 1; }

TARGET=$("$NODE" -e 'const p=JSON.parse(require("fs").readFileSync(".cache/photo-pipeline/out/pool.json","utf8"));console.log(new Set(p.map(x=>x.photo_id)).size)')
if ! [ "$TARGET" -gt 0 ] 2>/dev/null; then say "FATAL: bad target '$TARGET'"; exit 1; fi

say "=== locating bees in $TARGET photos ==="
for attempt in $(seq 1 60); do
  have=$(wc -l < "$JSONL" 2>/dev/null | tr -d ' '); have=${have:-0}
  if [ "$have" -ge "$TARGET" ]; then say "COMPLETE $have/$TARGET"; break; fi

  say "--- attempt $attempt, $have/$TARGET ---"
  before=$have
  "$NODE" scripts/photo-pipeline/locate.mjs
  after=$(wc -l < "$JSONL" 2>/dev/null | tr -d ' '); after=${after:-0}

  # No forward progress means a real failure (model server down, unreadable pool), not an
  # external kill. Back off hard rather than burning all 60 attempts in a tight loop.
  if [ "$after" -le "$before" ]; then say "no progress ($before -> $after), backing off 60s"; sleep 60; else sleep 3; fi
done

say "done"
# launchctl submit defaults to KeepAlive and will respawn this script every ~10s otherwise.
launchctl remove com.beeatlas.photos 2>/dev/null || true
