#!/usr/bin/env bash
# Lay out the volume the image expects (fly/Dockerfile, "the volume"; ADR 0044):
#
#   fly/prepare-volume.sh            # as root, at boot, before dropping to app
#
# Creates every directory the scripts, the Stelis graph and the symlinks in the
# checkout write to, and hands the volume to `app`, since Fly mounts it owned by root.
# Idempotent: a directory that exists is left as it is, and chown touches only the
# top level of each (the DuckDB and the site are large; recursing over them every
# boot is not free). The entrypoint (beeatlas-ryli) calls this first.

set -euo pipefail

root=${BASE_DIR:-/data}

dirs=(
    "$root/var"             # VAR_DIR: beeatlas.duckdb, export/, baseline/, publish.lock
    "$root/var/stelis"      # STELIS_STATE_DIR: the observation history and cache
    "$root/var/export"      # EXPORT_DIR
    "$root/var/baseline"    # BASELINE_DIR: the integration gate's last-published copy
    "$root/htdocs"          # SITE_ROOT: what Caddy serves
    "$root/basemap"         # the PMTiles archives, outside every publish path
    "$root/notes"           # the authoritative notes store (NOTES_DB_PATH)
    "$root/raw"             # /app/data/raw: taxa.csv.gz, taxa_cache.json, ecdysis_cache/
    "$root/cache"           # /app/.cache: the build receipt
    "$root/site"            # /app/_site: the rendered site before merge-swap
    "$root/dbt-target"      # /app/data/dbt/target: dbt's sandbox
    "$root/dlt"             # DLT_DATA_DIR: dlt's pipeline working directories
    "$root/log"             # the nightly's log (beeatlas-ryli)
)
for d in "${dirs[@]}"; do
    mkdir -p "$d"
    chown app:app "$d"
done
chown app:app "$root"
echo "prepare-volume.sh: $root ready for app (${#dirs[@]} directories)"
