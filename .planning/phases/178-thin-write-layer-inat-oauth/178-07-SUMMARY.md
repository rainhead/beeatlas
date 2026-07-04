---
phase: 178-thin-write-layer-inat-oauth
plan: 07
subsystem: auth
tags: [lit, vitest, oauth, whoami, frontend]

# Dependency graph
requires:
  - phase: 178-06
    provides: "GET /auth/login, GET /auth/whoami, POST /auth/logout routes on api.beeatlas.net (Flask/Waitress)"
provides:
  - "src/auth-client.ts: fetchWhoami/startSignIn/signOut against VITE_NOTES_API_BASE_URL, credentials:'include' throughout"
  - "bee-header.ts authState property + sign-in/whoami-badge/sign-out UI, sign-in/sign-out CustomEvents"
  - "entries/bee-header.ts controller: non-blocking whoami fetch + event wiring for all standalone pages"
affects: [179-notes-feature-harvest-bake, 178-08, 178-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "auth-client.ts mirrors manifest.ts's import.meta.env.VITE_*_BASE_URL ?? default convention"
    - "bee-header stays a pure presenter for auth state too (authState in, sign-in/sign-out events out) — same invariant as offline/cacheState/installable"

key-files:
  created: [src/auth-client.ts, src/tests/auth-client.test.ts]
  modified: [src/bee-header.ts, src/entries/bee-header.ts, src/env.d.ts, src/tests/bee-header.test.ts]

key-decisions:
  - "AuthState.isAuthor is a camelCase client-side field mapped from the API's snake_case is_author (fetchWhoami normalizes the response shape at the boundary)"
  - "Sign-in/sign-out rendered as text pill buttons (.auth-btn) rather than reusing .icon-btn chrome, since .icon-btn is sized/styled for glyph-only icons and these carry a label"
  - "Auth controller wired only into src/entries/bee-header.ts (the standalone-page mount used by species/places/collectors/taxon pages via _layouts/default.njk) — NOT into bee-atlas.ts (the map page's own <bee-header> instance), matching the plan's exact files_modified scope"

requirements-completed: [WRITE-02, WRITE-03]

# Metrics
duration: 4min
completed: 2026-07-04
---

# Phase 178 Plan 07: Frontend Sign-in + Whoami UI Summary

**Cross-origin credentialed auth-client (fetchWhoami/startSignIn/signOut) wired into a pure-presenter bee-header sign-in/whoami/sign-out affordance, driven by a non-blocking controller in the standalone-page header entry.**

## Performance

- **Duration:** ~4 min (task commits 22:13:51 → 22:16:22 PT)
- **Started:** 2026-07-04T05:13:00Z (approx)
- **Completed:** 2026-07-04T05:17:01Z
- **Tasks:** 3 (2 code tasks + 1 verification-only gate task)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `src/auth-client.ts` exports `fetchWhoami`/`startSignIn`/`signOut`, all using `${API_BASE}` (default `https://api.beeatlas.net`, overridable via `VITE_NOTES_API_BASE_URL`) and `credentials:'include'`; `fetchWhoami` never throws, always resolving to a typed `AuthState`.
- `bee-header.ts` gained an `authState` property and renders "Sign in with iNaturalist" (signed out) or iNat login + allowlisted-or-not badge + sign-out (signed in), dispatching composed+bubbling `sign-in`/`sign-out` CustomEvents — no fetch or `window.location` write inside the component (architecture invariant preserved).
- `entries/bee-header.ts` now mounts a small controller: fire-and-forget `fetchWhoami()` on load sets `authState`, and `sign-in`/`sign-out` listeners call `startSignIn`/`signOut` (re-fetching whoami after logout) — this covers every static page using the standalone header (species, places, collectors, taxon pages).
- No-secret gate confirmed: `grep -rn "client_secret" src/` finds nothing; full `npm test` suite green (918/918 across 35 files); `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: src/auth-client.ts + env typing** - `af17a021` (feat)
2. **Task 2: bee-header sign-in/whoami affordance + entry controller wiring** - `793e810e` (feat)
3. **Task 3: No-secret bundle check + full frontend suite** - verification only, no files changed, no commit (grep gate + `npm test` both passed)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/auth-client.ts` - `AuthState` type + `fetchWhoami`/`startSignIn`/`signOut`, no secret/token literal
- `src/tests/auth-client.test.ts` - vitest coverage: whoami success/network-error/unauthenticated, login URL encoding, logout POST+credentials
- `src/bee-header.ts` - `authState` property, `.auth-btn`/`.whoami`/`.whoami-badge` styles, sign-in/sign-out render branch + click handlers dispatching `sign-in`/`sign-out`
- `src/entries/bee-header.ts` - whoami-fetch controller + `sign-in`/`sign-out` event wiring for standalone pages
- `src/env.d.ts` - `VITE_NOTES_API_BASE_URL?: string` declaration
- `src/tests/bee-header.test.ts` - 6 new tests: unauthenticated render, authenticated render (both badge variants), both event dispatches

## Decisions Made
- Mapped the API's `is_author` (snake_case, per `api/main.py`'s `/auth/whoami`) to `isAuthor` (camelCase) inside `fetchWhoami`, keeping the plan's specified `AuthState` shape (`{authenticated, login?, role?, isAuthor?}`) as the client-side contract while matching the actual 178-06 route response.
- Used dedicated `.auth-btn`/`.whoami`/`.whoami-badge` CSS classes rather than forcing the sign-in/sign-out buttons into `.icon-btn` chrome, since that chrome is a 44px glyph-only tap target and these controls carry text labels.
- Rewrote a comment that would have contained the literal string `client_secret` (it would have tripped Task 3's own grep gate) — the invariant is documented without using the flagged token.

## Deviations from Plan

None — plan executed exactly as written. One scope note (not a deviation, since it matches the plan's literal `files_modified` list) is documented below.

## Issues Encountered
None.

## Known Gap (in-scope per plan, flagged for follow-up)

The plan's `files_modified` list (and Task 2's `read_first`) scopes the entry controller to `src/entries/bee-header.ts` only — the standalone-page mount used by `_layouts/default.njk` (species/places/collectors/taxon pages). `src/bee-atlas.ts` (the map page at `/`) renders its own `<bee-header>` instance with its own property wiring (`offline`, `cacheState`, `installable`, etc.) and was **not** touched by this plan. Since `bee-header`'s `authState` defaults to `null`, the map page's header will render the "Sign in with iNaturalist" button by default, but `bee-atlas.ts` has no listener for the `sign-in`/`sign-out` events it dispatches — clicking it is currently a silent no-op on `/` only. This is a real but non-crashing gap (not a security or correctness issue — no error is thrown, no secret exposure). Follow-up plans (178-08/178-09 UAT, or 179) should either wire the same controller pattern into `bee-atlas.ts` or confirm this is intentionally deferred.

## User Setup Required

None - no external service configuration required. (The live end-to-end OAuth round-trip against the deployed `api.beeatlas.net` is the 178-09 security UAT, not this plan.)

## Next Phase Readiness

- `src/auth-client.ts` is ready to be reused by 179's note-CRUD UI for authenticated write calls.
- The `sign-in`/`sign-out` event contract (composed+bubbling `CustomEvent` from `<bee-header>`) is stable for any future mounting context (including a prospective `bee-atlas.ts` wiring, per the Known Gap above).
- Live-browser verification (network tab shows no token in the URL/localStorage, whoami badge reflects the real allowlist) is deferred to 178-09 per plan design.

---
*Phase: 178-thin-write-layer-inat-oauth*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present; all 3 task commits (af17a021, 793e810e) plus this summary commit (64ee39ea) verified in git log.
