#!/bin/bash
# Stage the Qwen3-VL GGUF onto Hostess (the Windows desktop) over the SMB mount.
#
#   launchctl submit -l com.beeatlas.stage -o <abs>/out/stage.log -e <abs>/out/stage.err \
#     -- /bin/bash <abs>/scripts/photo-pipeline/stage-model-to-hostess.sh
#
# WHY FROM THE MAC: this laptop pulls from the HuggingFace CDN at ~15 MB/s while Hostess's
# own download stalled repeatedly. `lms get` is ~100x slower still (~80 KB/s) because it
# does not follow the redirect to the fast CDN edge -- never use it for large models.
#
# Files are placed in LM Studio's models tree using the publisher/repo layout already
# present on that machine (.lmstudio/models/lmstudio-community/gemma-4-E4B-it-GGUF/...),
# so LM Studio indexes them without an `lms import` -- which would need shell access to
# Hostess that we do not have.
#
# THE mmproj IS NOT OPTIONAL: without it the model loads but has no vision encoder, and
# every image request fails or silently ignores the image.

set -u
SRC="$(cd "$(dirname "$0")/../.." && pwd)/.cache/photo-pipeline/models"
DEST="/Volumes/peter/.lmstudio/models/Qwen/Qwen3-VL-8B-Instruct-GGUF"

MAIN=Qwen3VL-8B-Instruct-Q4_K_M.gguf
MMPROJ=mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf
MAIN_BYTES=5024000000    # ~4.68 GB, from the HF blob listing
MMPROJ_BYTES=750000000   # ~0.70 GB

say() { echo "$(date '+%H:%M:%S') $*"; }
size() { stat -f%z "$1" 2>/dev/null || echo 0; }

[ -d /Volumes/peter ] || { say "FATAL: /Volumes/peter not mounted"; exit 1; }

say "waiting for both downloads to finish"
for i in $(seq 1 240); do
  m=$(size "$SRC/$MAIN"); p=$(size "$SRC/$MMPROJ")
  if [ "$m" -ge "$MAIN_BYTES" ] && [ "$p" -ge "$MMPROJ_BYTES" ]; then
    say "downloads complete: main $((m/1048576)) MB, mmproj $((p/1048576)) MB"
    break
  fi
  [ "$i" -eq 240 ] && { say "FATAL: timed out (main $((m/1048576))MB, mmproj $((p/1048576))MB)"; exit 1; }
  sleep 15
done

mkdir -p "$DEST" || { say "FATAL: cannot create $DEST"; exit 1; }

# RETRY, because this link genuinely drops. Both earlier failures ("Operation not
# permitted" on mkdir, then on cp) were the SMB mount going away mid-operation, not a
# permissions problem -- every method worked again minutes later. A 16-minute copy over a
# link that blips must survive a blip.
copy_with_retry() {
  local f=$1 want=$2
  for attempt in 1 2 3 4 5; do
    if [ "$(size "$DEST/$f")" -ge "$want" ]; then say "  $f already present, skipping"; return 0; fi
    say "  attempt $attempt: $f"
    if cp "$SRC/$f" "$DEST/$f.part" 2>/dev/null; then
      # Rename only after a complete copy, so LM Studio never indexes a half-written file.
      if mv "$DEST/$f.part" "$DEST/$f" 2>/dev/null; then
        say "  done: $(( $(size "$DEST/$f") / 1048576 )) MB"
        return 0
      fi
    fi
    rm -f "$DEST/$f.part" 2>/dev/null
    say "  failed; SMB may have dropped. waiting 30s"
    sleep 30
    [ -d /Volumes/peter ] || { say "  mount is GONE — cannot continue"; return 1; }
  done
  return 1
}

# mmproj first: it is small, so a run that dies partway leaves the pair visibly incomplete
# rather than a loadable model with no vision encoder.
copy_with_retry "$MMPROJ" "$MMPROJ_BYTES" || { say "FATAL: could not copy $MMPROJ"; exit 1; }
copy_with_retry "$MAIN" "$MAIN_BYTES" || { say "FATAL: could not copy $MAIN"; exit 1; }

say "staged to $DEST"
say "Hostess's LM Studio should index it; verify with: lms ls | grep -i qwen"
launchctl remove com.beeatlas.stage 2>/dev/null || true
