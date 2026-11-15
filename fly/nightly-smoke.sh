#!/usr/bin/env bash
# Does the nightly's image (the nightly target of fly/Dockerfile, ADR 0047) hold a
# working pipeline toolchain? Run by the fly-image workflow on every change, and by
# hand on Hostess after a build:
#
#   bash fly/nightly-smoke.sh beeatlas-nightly:<commit>
#
# It runs nothing that reaches the network or writes anywhere but the container. /data
# is an empty tmpfs, laid out as a real run's is (fly/nightly-entry.sh's folders), so
# the links into it resolve.
set -euo pipefail
image=${1:?usage: fly/nightly-smoke.sh <image>}

docker run --rm --tmpfs /data:uid=1000,gid=1000 --entrypoint bash "$image" -c '
set -euo pipefail
cd /app
for d in raw ecdysis-zip geography-cache burke-cache cache site dbt-target dbt-logs \
         checkout-files fly-home dlt notes var var/export; do mkdir -p "/data/$d"; done
echo "--- stelis preflight"
bash /opt/stelis/scripts/preflight.sh
echo "--- the beeatlas graph loads"
(cd /opt/stelis && BEEATLAS_DIR=/app SOURCE_DATE_EPOCH=1700000000 racket src/main.rkt --project beeatlas --help > /dev/null)
echo "--- python: dlt, dbt, the duckdb extensions"
(cd data && uv run --frozen --no-sync python -c "
import dlt, duckdb, pyarrow, pyogrio, rasterio
c = duckdb.connect()
c.execute(\"LOAD spatial\"); c.execute(\"LOAD sqlite_scanner\")
print(\"duckdb\", duckdb.__version__, \"dlt\", dlt.__version__)
")
(cd data && bash dbt/run.sh --identity)
echo "--- the CLIs"
duckdb -c "LOAD sqlite_scanner; SELECT 1" > /dev/null
flyctl version
sqlite3 --version
node --version; pnpm --version
(cd data && pnpm exec mapshaper -v)
echo "--- the links into /data"
for l in data/raw data/.ecdysis_cache data/.geography_cache data/.burke_cache .cache _site \
         data/dbt/target data/dbt/logs data/dedup_candidate_pairs.csv data/lineage_unresolved.csv \
         data/inactive_unresolved.csv; do
    test -L "$l" || { echo "$l is not a symlink" >&2; exit 1; }
done
test -L "$HOME/.fly"
echo "nightly image OK"
'
