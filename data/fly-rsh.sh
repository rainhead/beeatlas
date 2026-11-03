#!/usr/bin/env bash
# rsync's remote shell for the Fly Machine (ADR 0046): `rsync -e data/fly-rsh.sh`.
# rsync runs `fly-rsh.sh <host> <command...>`. There is no host to reach, only the app
# FLY_APP names, so the first argument is a placeholder and is dropped. The command
# goes to `flyctl ssh console -C`, which runs it without a shell, as root; the caller's
# --rsync-path drops it to the app user.
set -euo pipefail
: "${FLY_APP:?FLY_APP names the Fly app to reach}"
shift
exec "${FLYCTL:-flyctl}" ssh console -q -a "$FLY_APP" -C "$*"
