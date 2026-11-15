#!/usr/bin/env bash
# The nightly image's command (the nightly target of fly/Dockerfile, ADR 0047). Hostess's
# wrapper, infra/hostess/nightly.sh, runs the image with ~/beeatlas-nightly mounted at
# /data; this lays out what the run expects there and hands over to data/nightly.sh.
# In the image rather than in the wrapper, so that it is always the commit's own: the
# wrapper is main's, and the image is built at the commit the Machine runs.
set -euo pipefail

# The folders the image's symlinks point into (fly/Dockerfile, "What the pipeline
# writes inside the checkout"), and the ones data/nightly.sh writes itself.
for d in raw ecdysis-zip geography-cache burke-cache cache site dbt-target dbt-logs \
         checkout-files fly-home dlt notes var var/export; do
    mkdir -p "/data/$d"
done

# Hostess never holds the notes store (ADR 0046). The build reads an empty one, made
# afresh from this commit's migrations so it always has their schema, and
# data/nightly.sh then takes the Machine's published notes/.
rm -f "$NOTES_DB_PATH" "$NOTES_DB_PATH-shm" "$NOTES_DB_PATH-wal"
(cd /app/data && uv run --frozen --no-sync alembic -c notes_store/migrations/alembic.ini upgrade head) > /dev/null

exec bash /app/data/nightly.sh
