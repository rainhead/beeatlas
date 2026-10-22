#!/usr/bin/env bash
# A restore drill for the notes store's replica (beeatlas-lwqi): restore the latest
# replicated state into a scratch file, never over the store, and compare each table
# with the store's: its row count and a hash of every row, in rowid order, so a changed
# row shows as well as a missing one. Exits non-zero if any differ. The same drill as
# salishsea's fly/restore-drill.sh.
#
#   fly/restore-drill.sh [config] [store]
#
# On the Machine, as app, with the replica's key in the environment as
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (the Machine's secrets carry it as
# NOTES_REPLICA_AWS_*). A write in the second between the two reads can show as a
# difference; run it again before believing one.
set -euo pipefail
config="${1:-/app/fly/litestream.yml}"
store="${2:-${NOTES_DB_PATH:-/data/notes/notes.db}}"
scratch="$(mktemp -d)"
restored="$scratch/restored.db"
trap 'rm -rf "$scratch"' EXIT

litestream restore -config "$config" -o "$restored" "$store"

counts() {
    /app/data/.venv/bin/python - "$1" <<'PY'
import hashlib, json, sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
db.execute("BEGIN")  # one read transaction: the tables agree with each other
tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
for t in tables:
    h, n = hashlib.sha256(), 0
    for row in db.execute(f'SELECT * FROM "{t}" ORDER BY rowid'):
        h.update((json.dumps(row, default=str) + "\n").encode())
        n += 1
    print(t, n, h.hexdigest()[:16])
PY
}

# Each read must succeed, or there is nothing to compare: two failed reads would
# otherwise "agree".
live="$(counts "$store")"
replica="$(counts "$restored")"
if [ "$live" = "$replica" ]; then
    echo "restore drill: the replica's latest state matches the store, table by table:"
    printf '%s\n' "$replica" | sed 's/^/  /'
else
    echo "restore drill: the replica differs from the store (< store, > restored):" >&2
    diff <(printf '%s\n' "$live") <(printf '%s\n' "$replica") >&2 || true
    exit 1
fi
