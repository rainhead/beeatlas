---
status: complete
phase: 148-app-shell-precache-vite-plugin-pwa-wiring
source: [148-01-PLAN.md, 148-VERIFICATION.md]
updated: 2026-06-14
---

# Phase 148 — Human UAT Items

> **Canonical URL for the route is `/app/index.html`** — NOT `/app/`. The S3+CloudFront
> origin (OAC, private bucket) returns 403 for trailing-slash paths by design, so the
> project links to `/…/index.html` explicitly (see memory `cloudfront-subdir-403-no-index-rewrite`).
> Offline, the SW serves the cached shell regardless of which form is requested.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0


## OFF-01 criterion 2 — `/app` loads fully offline from the ServiceWorker (D-09)

**Status:** PASSED — confirmed in-browser 2026-06-14 (local production-build preview,
`npm run build` + `npx serve _site -l 8080`, `http://localhost:8080/app/index.html`).

This is the only OFF-01 criterion that cannot be proven by an automated build-output
assertion — it requires a live browser ServiceWorker lifecycle + DevTools offline toggle.
Criteria 1, 3, and 4 are CI-enforced in `src/tests/build-output.test.ts`.

**Criteria that must hold (all confirmed):**
- After one online visit to `/app/index.html`, a SW for scope `/app/` is registered and
  activated.
- No service worker is registered for `/` (the main route) — the no-SW-on-`/` guarantee.
- With DevTools → Network toggled **Offline**, reloading `/app/index.html` renders the
  app shell with the JS/CSS rows served from `(ServiceWorker)` and no failed app-shell
  network requests.
- `/data/*` requests may fail offline — that is Phase 149's runtime-cache scope, not OFF-01.

**Verification steps (verbatim from Task 3 checkpoint):**

1. `npm run build`, then serve the output: `npx serve _site -l 8080` (note the port).
2. Open `http://localhost:8080/app/index.html` once while online; wait for the map + table
   to render (primes the precache).
3. DevTools → Application → Service Workers: confirm a SW for scope `/app/` is "activated
   and running"; open `http://localhost:8080/` and confirm no SW is registered for `/`.
4. DevTools → Network: toggle **Offline**.
5. Reload `/app/index.html`: app shell renders; JS/CSS show `(ServiceWorker)`; no red
   app-shell failures.
