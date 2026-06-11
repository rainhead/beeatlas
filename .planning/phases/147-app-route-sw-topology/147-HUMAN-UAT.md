# Phase 147 — Human UAT Items

## ROUTE-01/ROUTE-02 — SW topology (local preview, D-11)

**Status:** PENDING — auto-approved in the auto chain; awaiting human DevTools confirmation

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
