---
phase: 178-thin-write-layer-inat-oauth
plan: 05
subsystem: auth
tags: [itsdangerous, flask, sqlalchemy, csrf, authz, oauth]

# Dependency graph
requires:
  - phase: 178-02
    provides: User model (data/notes_store/models.py) + 0002 migration
  - phase: 178-03
    provides: api/config.py (INAT_CLIENT_ID/SECRET, REDIRECT_URI, SESSION_SIGNING_KEY) + api/main.py Flask app
  - phase: 178-04
    provides: api/oauth.py (PKCE exchange + fetch_identity) + api/tests/conftest.py sys.path setup
provides:
  - api/session.py — itsdangerous-signed long-lived cookie mint/verify + cookie policy constants
  - api/users.py — upsert_user(engine, inat_login, inat_user_id) -> internal id
  - api/auth.py — require_session / require_author decorators, origin_allowed, ALLOWED_ORIGINS
  - api/config.py WRITES_ENABLED launch-gate flag (env-driven, default False)
  - api/tests/conftest.py now also puts data/ on sys.path so api/* can import notes_store.*
affects: [178-06, 178-08, 179]

# Tech tracking
tech-stack:
  added: []  # itsdangerous/Flask/SQLAlchemy all already present from 178-02/03/04
  patterns:
    - "Stateless signed cookie (itsdangerous.URLSafeTimedSerializer), never PyJWT — no alg-confusion surface"
    - "Per-request allowlist recheck by re-parsing the committed TOML from disk (not the module-level cached ROLES dict) — revocation without restart"
    - "Server-side Origin allow-list is the authoritative CSRF gate on state-changing verbs; SameSite=Strict is defense-in-depth"
    - "Author identity always derived from flask.g.identity (verified session), never from request body/query — forged author_id silently ignored"
    - "Launch gate (WRITE-04) is a plain env var (WRITES_ENABLED), read at call-time so it can flip without redeploying code"

key-files:
  created:
    - api/session.py
    - api/users.py
    - api/auth.py
    - api/tests/test_session.py
    - api/tests/test_users.py
    - api/tests/test_authz.py
  modified:
    - api/config.py (added WRITES_ENABLED)
    - api/tests/conftest.py (also inserts data/ onto sys.path)

key-decisions:
  - "Allowlist revocation re-reads roles_module._ALLOWLIST from disk on every require_author call (not a full importlib.reload of notes_store.roles) — cheap, testable via monkeypatching the path, and doesn't disturb the module's import-time ROLES cache used elsewhere"
  - "WRITES_ENABLED is env-driven (WRITES_ENABLED=true/false), not stored in secrets.toml — it's an operational switch the operator flips on maderas after confirming the 177-07 restore, not a secret"
  - "require_session/require_author read api.config.SESSION_SIGNING_KEY and WRITES_ENABLED at call-time (not cached at import) so tests can monkeypatch config module attributes directly"

patterns-established:
  - "Decorator composition: require_author = require_session(inner_check_wrapper) — session check always runs first (401), then allowlist/origin/gate checks (403/403/503), then the real view"

requirements-completed: [WRITE-02, WRITE-03, WRITE-04]

# Metrics
duration: 4min
completed: 2026-07-04
---

# Phase 178 Plan 05: Session, Users Upsert, and Write Authorization Gate Summary

**itsdangerous-signed long-lived session cookie, idempotent iNat-login-keyed user upsert, and a require_author decorator enforcing per-request allowlist revocation + server-side Origin CSRF gate + WRITE-04 launch gate — no HTTP routes yet, pure/store-touching modules only**

## Performance

- **Duration:** ~4 min (21:50:07 → 21:54:11 PT)
- **Started:** 2026-07-04T04:50:07Z
- **Completed:** 2026-07-04T04:54:11Z
- **Tasks:** 3 completed
- **Files modified:** 8 (3 new modules, 3 new test files, 2 modified existing files)

## Accomplishments
- `api/session.py`: `make_serializer`/`mint_cookie`/`verify_cookie` round-trip `{uid, login, role}`; tamper, cross-key, and expiry all verify to `None`; cookie policy constants (`COOKIE_NAME`, `COOKIE_MAX_AGE` = 30 days, `COOKIE_KWARGS` with HttpOnly/Secure/SameSite=Strict/host-only) exposed for 178-06.
- `api/users.py`: `upsert_user` mints a new internal id on first login and returns the same id on repeat logins with the same `inat_login`, refreshing `inat_user_id`/`updated_at` in place.
- `api/auth.py`: `require_session` (401 gate) and `require_author` (403 allowlist revocation + 403 Origin CSRF gate on state-changing verbs + 503 launch gate + server-derived author) fully tested against a throwaway Flask app.

## Task Commits

Each task followed the TDD RED→GREEN cycle:

1. **Task 1: api/session.py** — RED `7d63e88a`, GREEN `63e1f15d`
2. **Task 2: api/users.py** — RED `fe01c3a6` (also extended `api/tests/conftest.py` for `notes_store` imports), GREEN `0496015f`
3. **Task 3: api/auth.py** — RED `2e75d02a` (also added `api/config.py` `WRITES_ENABLED`), GREEN `273ec4de`

_No REFACTOR commits were needed — each GREEN implementation was clean on first pass._

## Files Created/Modified
- `api/session.py` - itsdangerous serializer, mint/verify, cookie policy constants
- `api/users.py` - `upsert_user(engine, inat_login, inat_user_id) -> int`
- `api/auth.py` - `require_session`, `require_author`, `origin_allowed`, `ALLOWED_ORIGINS`
- `api/config.py` - added `WRITES_ENABLED` (env-driven launch gate, default `False`)
- `api/tests/conftest.py` - also inserts `data/` onto `sys.path` so `api/*` can `import notes_store.*`
- `api/tests/test_session.py`, `api/tests/test_users.py`, `api/tests/test_authz.py` - new test suites (24 tests total)

## Decisions Made
- Allowlist revocation re-parses `roles_module._ALLOWLIST` from disk per request rather than `importlib.reload`-ing the whole `notes_store.roles` module — cheaper, and testable by monkeypatching just the path attribute without disturbing the module's own import-time `ROLES` cache (which other consumers may still rely on).
- `WRITES_ENABLED` is a plain environment variable read in `api/config.py`, not part of `secrets.toml` — it's an operational on/off switch (WRITE-04 gate), not a secret, and this matches the project's existing env-driven config convention (`DB_PATH`/`EXPORT_DIR` in `run.py`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `api/tests/conftest.py` to also add `data/` to `sys.path`**
- **Found during:** Task 2 (`api/users.py` — first api module needing `notes_store.*`)
- **Issue:** `api/tests/test_users.py` needs `from notes_store.db import make_engine`, but the existing conftest only inserted the repo root, so `notes_store` (which lives under `data/`) wasn't importable when pytest was invoked as `cd data && uv run pytest ../api/tests/...`.
- **Fix:** Added `data/` to the same sys.path-insertion loop already used for the repo root.
- **Files modified:** `api/tests/conftest.py`
- **Verification:** `cd data && uv run pytest ../api/tests/test_users.py -x` green; full suite (`uv run pytest`) still green (380 passed).
- **Committed in:** `fe01c3a6` (Task 2 RED commit)

**2. [Rule 3 - Blocking] Added `WRITES_ENABLED` to `api/config.py`**
- **Found during:** Task 3 (`api/auth.py` — `require_author`'s launch-gate check)
- **Issue:** The plan's Task 3 action requires reading a `writes_enabled` boolean from config, but no such flag existed in `api/config.py` (not in the plan's `files_modified` list, but required for the task to be completable).
- **Fix:** Added `WRITES_ENABLED: bool = os.environ.get("WRITES_ENABLED", "false").lower() == "true"` — env-driven, default `False`, documented as the WRITE-04 operator switch for 178-06/178-08.
- **Files modified:** `api/config.py`
- **Verification:** `test_launch_gate_off_is_503` and `test_allowlisted_author_allowed_origin_gate_on_is_200` both pass, monkeypatching `config.WRITES_ENABLED` per-test.
- **Committed in:** `2e75d02a` (Task 3 RED commit)

**3. [Rule 1 - Bug] Fixed a self-inflicted flaky test in `test_session.py`**
- **Found during:** Task 1, first test run
- **Issue:** `test_verify_cookie_rejects_expired_token` originally used `max_age_seconds=0`, which is not reliably "already expired" since the elapsed time between mint and verify can itself be 0 seconds (fast local execution) — `itsdangerous` only expires when `age > max_age`, not `age >= max_age`.
- **Fix:** Changed to `max_age_seconds=-1`, which is unconditionally expired regardless of timing.
- **Files modified:** `api/tests/test_session.py`
- **Verification:** Test passes deterministically across repeated runs.
- **Committed in:** `63e1f15d` (Task 1 GREEN commit)

**4. [Rule 1 - Bug] Fixed an over-strict "no PyJWT" test assertion**
- **Found during:** Task 1, first test run
- **Issue:** `test_uses_itsdangerous_not_pyjwt` originally asserted the substring `"jwt"` (case-insensitive) did not appear anywhere in `api/session.py`'s source — but the module's own docstring mentions "PyJWT" by name when explaining why it wasn't chosen, correctly tripping the naive check.
- **Fix:** Rewrote the test to assert the serializer is an `itsdangerous.URLSafeTimedSerializer` instance and that `"jwt"` is not a name bound in the module's namespace (`vars(session)`), which is what actually matters (no PyJWT import/usage), rather than grepping prose.
- **Files modified:** `api/tests/test_session.py`
- **Verification:** Test passes; still fails if a `jwt`-named import/binding were added to the module.
- **Committed in:** `63e1f15d` (Task 1 GREEN commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 2 Rule 1 bug — both bugs in this plan's own new test code, not pre-existing code).
**Impact on plan:** All four were necessary to make the plan's own tests correct and runnable. No scope creep beyond what Task 1-3's `<action>` blocks already specified.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required. `WRITES_ENABLED` defaults to `False`; the operator sets `WRITES_ENABLED=true` in the maderas environment in a later plan (178-06/178-08) once the 177-07 restore is (re-)confirmed for this launch.

## Next Phase Readiness
- `api/session.py`, `api/users.py`, `api/auth.py` are ready for 178-06 to wire into real Flask routes: `/auth/callback` (mint session via `session.mint_cookie` + `users.upsert_user`), `/auth/logout`, and a `require_author`-guarded `POST /api/write-check` (the trivial endpoint RESEARCH.md's Open Question #1 calls for to exercise WRITE-03's security UAT without pulling note-CRUD scope forward).
- No blockers. Full test suite (`cd data && uv run pytest`) is green: 380 passed, 9 skipped, 60 deselected (integration tier).

---
*Phase: 178-thin-write-layer-inat-oauth*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created files verified present on disk; all 7 referenced commit hashes verified present in git log.
