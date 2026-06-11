---
status: partial
phase: 147-app-route-sw-topology
source: [147-VERIFICATION.md]
updated: 2026-06-10
---

# Phase 147 — Human UAT Items

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0


## ROUTE-01/ROUTE-02 — SW topology (local preview, D-11)

**Status:** PASSED — confirmed in-browser 2026-06-10 (Firefox + Chrome, `npm run dev` on `http://localhost:8080/app/`). SW registers and activates for scope `/app/` after the scope fix (commit `e254127`); no SW on `/`; `/data/*` intercept observed. Note: the SW shows "stopped" when idle — normal event-driven lifecycle, respawns on the next fetch.

**Criteria that must hold:**
- SW registered for scope `/app/` (source `/app/sw.js`) when visiting `/app/`
- No service worker detected on `/` (the main route)
- A `/data/*` request (e.g. `/data/occurrences.db`) shows the Service Worker as initiator/served-by in DevTools Network tab

**Verification steps (verbatim from Task 5 checkpoint):**

1. Ensure local data exists so `/data/*` fetches resolve: run `npm run predev` (and confirm `public/data/occurrences.db` is present from a prior `npm run fetch-data`/local run). If the DB is absent the SW-intercept is still demonstrable — the `/data/*` request will 404 but DevTools still shows the SW as initiator (per RESEARCH Pitfall 5).

2. Run `npm run build && npm run preview`. Note the localhost URL the preview prints.

3. Visit `http://localhost:<port>/app/`. Confirm the BeeAtlas map+table SPA renders identically to `/`.

4. DevTools → Application → Service Workers: confirm a service worker is registered and activated for scope `/app/` (source `/app/sw.js`).

5. Visit `http://localhost:<port>/` (the main route). DevTools → Application → Service Workers: confirm "No service workers detected" for `/` (ROUTE-01 / ROUTE-02 no-SW-on-`/`).

6. Back on `/app/`, DevTools → Network: trigger/observe a `/data/*` request (e.g. `/data/occurrences.db` or a GeoJSON). Confirm the request's initiator/served-by shows the Service Worker (ROUTE-02 criterion 4 — the pass-through handler intercepted it).

**To mark complete:** Update this entry with date of confirmation and results observed.

---

## ROUTE-03 — CloudFront no-cache (post-deploy, D-10)

**Status:** PENDING — deferred at developer's choice; run at next deploy.

**Background:** The synth-time guarantee (D-10) is already enforced by the CDK assertion test at `infra/test/beeatlas-stack.test.ts` (passing as of commits `d49959e`–`e563ae8`). This item covers the live distribution confirmation only, which requires a real deploy. Note that `/app/manifest.webmanifest` returning 403/404 with the no-cache header present is the expected pre-Phase-151 state (D-08 — the behavior is harmless before the file exists).

**Verification steps (verbatim from Task 4 checkpoint):**

1. Deploy when ready: `cd infra && npm run deploy` (or fold into the normal deploy flow). The `/app/manifest.webmanifest` file does not exist until Phase 151 — that is expected; the behavior is harmless before the file lands (D-08).

2. After deploy, run `curl -I https://<distribution-domain>/app/sw.js` and confirm the response includes `Cache-Control: no-cache, no-store, must-revalidate`.

3. Record the `curl -I` output (header line) in this file (D-10). `/app/manifest.webmanifest` returning 403/404 with the no-cache header present is the expected pre-151 state.

**To mark complete:** After deploying, paste the `curl -I` output for `/app/sw.js` here and update status to PASSED with date.
