---
phase: 178-thin-write-layer-inat-oauth
plan: 04
subsystem: auth
tags: [oauth2, pkce, inaturalist, requests, flask, itsdangerous-adjacent]

# Dependency graph
requires:
  - phase: 178-03
    provides: "api/ package skeleton (api/main.py Flask app, api/config.py secrets loader with INAT_CLIENT_ID/SECRET/REDIRECT_URI, pytest wiring for api/tests/"
provides:
  - "api/oauth.py — make_pkce_pair, authorize_url, exchange_code, fetch_identity (pure, hermetic functions, no route wiring)"
  - "api/tests/test_oauth.py — fully mocked coverage of the PKCE exchange, identity fetch, header-format gotcha, and token discard"
  - "api/tests/conftest.py — repo-root sys.path fix so `import api.*` resolves under the `cd data && uv run pytest ../api/tests/...` invocation form"
affects: [178-05, 178-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OAuth exchange built with plain `requests` (no OAuth client library) per RESEARCH.md Pattern 1"
    - "Hermetic function design: oauth.py functions take client_id/secret/redirect_uri as arguments rather than importing api.config directly, so tests never need real secrets"

key-files:
  created:
    - api/oauth.py
    - api/tests/test_oauth.py
    - api/tests/conftest.py
  modified: []

key-decisions:
  - "fetch_identity sends Bearer-prefixed access_token to /users/api_token and the RAW (no-Bearer) JWT to /v1/users/me, matching the official inaturalistjs client rather than the ambiguous forum guidance (RESEARCH.md Pitfall 2)"
  - "Added api/tests/conftest.py to insert the repo root onto sys.path — the plan's literal verify command (`cd data && uv run pytest ../api/tests/test_oauth.py`) triggers a pytest rootdir/ini-discovery quirk that skips data/pyproject.toml's pythonpath setting when the test path argument is outside the ini file's directory tree"

patterns-established:
  - "Pure hermetic OAuth helper functions (no module-level config coupling) — future write-layer helpers should follow the same shape so route code (178-06) supplies config.py values explicitly"

requirements-completed: [WRITE-02]

# Metrics
duration: 15min
completed: 2026-07-04
---

# Phase 178 Plan 04: iNat OAuth PKCE Exchange Summary

**Server-side iNat OAuth2 authorization-code exchange with PKCE, implemented as four pure `requests`-based functions in `api/oauth.py`, with fully mocked test coverage proving the Bearer-vs-raw header gotcha and token discard.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-04T04:37:00Z (approx, prior task commit at 178-03 close)
- **Completed:** 2026-07-04T04:43:24Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created for tests, 1 created for implementation)

## Accomplishments
- `make_pkce_pair()` / `authorize_url()` / `exchange_code()` implement the full server-side PKCE authorization-code exchange against a confidential iNat OAuth client (D-01/D-02), matching RESEARCH.md's live-verified Pattern 1 exactly.
- `fetch_identity()` implements the two-call identity derivation (`/users/api_token` then `/v1/users/me`) with the correct, differing `Authorization` header format at each call site (Bearer vs. raw JWT) — the gotcha RESEARCH.md flagged as Pitfall 2.
- Token discard (D-03) is structural: the OAuth access_token and the 24h JWT exist only as local variables inside `fetch_identity`'s frame; a dedicated test asserts neither value appears in the return value or any module-level state.
- All 11 tests pass with fully mocked HTTP (no live iNat calls); the full `data/` pytest suite (356 tests) remains green.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Tasks 1+2 combined (RED): failing tests for PKCE exchange + identity fetch** - `5dffb219` (test)
2. **Tasks 1+2 combined (GREEN): implement oauth.py** - `c5dc513e` (feat)

**Plan metadata:** (this commit, pending)

_Note: the plan's two tasks (PKCE/authorize_url/exchange_code, then fetch_identity) were implemented as a single RED→GREEN TDD cycle since both land in the same file and the test file was written to cover the full module's behavior contract up front; this does not change scope or acceptance criteria, both tasks' `<acceptance_criteria>` are independently verifiable in the test file and both pass._

## Files Created/Modified
- `api/oauth.py` - `INAT_BASE`, `INAT_API_BASE`, `make_pkce_pair()`, `authorize_url()`, `exchange_code()`, `fetch_identity()` — hermetic (no module-level config import), takes client_id/secret/redirect_uri as function arguments
- `api/tests/test_oauth.py` - mocked-`requests` coverage: PKCE shape/randomness, authorize_url param wiring + redirect_uri pin, exchange_code POST body + raise-on-error, fetch_identity header formats + identity return + token-discard
- `api/tests/conftest.py` - repo-root sys.path fix (see Deviations)

## Decisions Made
- Kept `oauth.py`'s functions fully hermetic (client_id/secret/redirect_uri as arguments, not imported from `api.config`) exactly as the plan's `<action>` specified — this keeps `api/tests/test_oauth.py` from needing real secrets and matches the pattern route code (178-06) will use.
- Sent the JWT RAW (no `Bearer` prefix) to `/v1/users/me`, matching the official `inaturalistjs` client per RESEARCH.md's HIGH-confidence citation, rather than defensively trying both formats — simplicity over unverified robustness, consistent with the plan's explicit instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `api/tests/conftest.py` to fix a pytest rootdir/import quirk**
- **Found during:** Task 1, first verification run
- **Issue:** The plan's literal `<verify>` command (`cd data && uv run pytest ../api/tests/test_oauth.py -x -k "..."`) failed with `ModuleNotFoundError: No module named 'api'` even for `import api.config` (a module that already worked in 178-03's `test_app.py`, which uses `from api.main import health`). Root cause: pytest's rootdir/ini-file discovery, when given an explicit test-path argument (`../api/tests/test_oauth.py`) that lies outside the ini file's directory tree (`data/pyproject.toml`), walks upward from the test file's own directory rather than from the invocation cwd — it never finds `data/pyproject.toml`'s `pythonpath = [".", ".."]` setting in that invocation form, so the repo root is never added to `sys.path`. Running `uv run pytest` with no explicit path (relying on `testpaths`) does not hit this, but the plan's stated verify command (and presumably any CI/future engineer copying it) does.
- **Fix:** Added `api/tests/conftest.py`, which unconditionally inserts the repo root onto `sys.path` at collection time — independent of pytest's rootdir/ini resolution. This is a pure test-infrastructure fix with no production code impact.
- **Files modified:** `api/tests/conftest.py` (new)
- **Verification:** Re-ran the plan's exact `<verify>` command for both tasks after the fix — both now correctly show the RED (`ModuleNotFoundError: No module named 'api.oauth'` before implementation) and GREEN (`11 passed`) states. Full `data/` suite (356 tests) unaffected.
- **Committed in:** `5dffb219` (test commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — pytest infra, not app code)
**Impact on plan:** No scope creep; fixes the plan's own verify command so it (and future copies of it) actually runs. No change to `api/oauth.py`'s behavior or the acceptance criteria.

## Issues Encountered
None beyond the pytest rootdir quirk documented above.

## User Setup Required
None - no external service configuration required. (Live iNat OAuth app credentials were already provisioned per D-12/D-13 in 178-03/CONTEXT; this plan never makes a live call — all HTTP is mocked.)

## Next Phase Readiness
- `api/oauth.py`'s four functions are ready for 178-05 (session minting) and 178-06 (route wiring: `/auth/login`, `/auth/callback`, calling `exchange_code()` + `fetch_identity()` with `api.config` values, then discarding both tokens and minting BeeAtlas's own session).
- No blockers. Live end-to-end confirmation of the PKCE exchange against the real iNat Doorkeeper provider remains deferred to 178-08/09 per RESEARCH.md's Open Question 2 (unchanged by this plan).

---
*Phase: 178-thin-write-layer-inat-oauth*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: api/oauth.py
- FOUND: api/tests/test_oauth.py
- FOUND: api/tests/conftest.py
- FOUND: .planning/phases/178-thin-write-layer-inat-oauth/178-04-SUMMARY.md
- FOUND commit: 5dffb219 (test)
- FOUND commit: c5dc513e (feat)
- FOUND commit: bf0230e7 (docs: summary)
