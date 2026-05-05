#!/usr/bin/env bash
# PERF-02 / D-06 / D-07: local Lighthouse mobile measurement of the
# species page. Pre-release ritual — NOT in CI (mobile-throttle on
# shared runners is ±15% noisy and would burn trust per CONTEXT D-06).
#
# Re-runnable per SC #2 wording: "documented command in data/README.md
# or scripts/". See data/README.md "Performance" section.
#
# Canary URL derivation (D-07): in the v3.2 ship shape there is one
# species page (/species/index.html) that renders ALL species cards —
# the worst case for LCP. If per-species pages are added in a future
# phase, re-derive the canary slug with:
#
#   duckdb -c "SELECT slug, occurrence_count
#              FROM read_parquet('public/data/species.parquet')
#              WHERE on_checklist OR occurrence_count > 0
#              ORDER BY occurrence_count DESC
#              LIMIT 5;"
#
# and update CANARY_PATH below.

set -euo pipefail

CANARY_PATH="/species/"
PORT=8080
BUDGET_MS=3000  # PERF-02
OUT_JSON="$(mktemp -t lcp-XXXXXX.json)"

echo "==> Building site"
npm run build

echo "==> Serving _site on http://localhost:${PORT}"
npx --yes serve _site -l "${PORT}" --no-clipboard >/dev/null 2>&1 &
SERVER_PID=$!
trap "kill ${SERVER_PID} 2>/dev/null || true; rm -f ${OUT_JSON}" EXIT

# Wait for the server to be ready (poll for HTTP 200 on the canary path).
for i in $(seq 1 20); do
  if curl -fsS "http://localhost:${PORT}${CANARY_PATH}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

URL="http://localhost:${PORT}${CANARY_PATH}"
echo "==> Lighthouse mobile run against ${URL}"
npx --yes lighthouse "${URL}" \
  --preset=desktop \
  --form-factor=mobile \
  --throttling.cpuSlowdownMultiplier=4 \
  --output=json \
  --output-path="${OUT_JSON}" \
  --quiet \
  --chrome-flags='--headless=new --no-sandbox'

LCP_MS=$(node -e "const r=require('${OUT_JSON}'); const v=r.audits['largest-contentful-paint'].numericValue; console.log(Math.round(v));")
echo "==> LCP: ${LCP_MS} ms (budget: ${BUDGET_MS} ms)"

if [ "${LCP_MS}" -ge "${BUDGET_MS}" ]; then
  echo "x LCP ${LCP_MS} ms exceeds PERF-02 budget ${BUDGET_MS} ms"
  exit 1
fi

HEADROOM=$((BUDGET_MS - LCP_MS))
echo "ok LCP ${LCP_MS} ms / ${BUDGET_MS} ms (${HEADROOM} ms headroom)"
