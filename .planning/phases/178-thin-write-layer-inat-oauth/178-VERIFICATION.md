---
phase: 178-thin-write-layer-inat-oauth
verified: 2026-07-04T17:10:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 178: Thin Write Layer + iNat OAuth Verification Report

**Phase Goal:** A thin managed write app — a maderas-hosted Flask (WSGI) service served by
Waitress behind Apache `mod_proxy_http` — accepts authenticated, authorized writes while the
read path stays fully static. iNat OAuth2 server-side code exchange with PKCE, server-derived
identity, minted long-lived app session (per-write allowlist recheck); allowlist + CSRF/origin
gate writes; public writes gated on the demonstrated Phase-177 restore.

**Verified:** 2026-07-04
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, verified against live + code evidence)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Thin write app (Waitress behind Apache `mod_proxy_http` on maderas) accepts authenticated writes; read path fully static, no runtime dependency added to species-page loads | ✓ VERIFIED | Live: `dig api.beeatlas.net` → `45.79.96.48`; `curl https://api.beeatlas.net/health` → `200 {"status":"ok"}`. Code: `api/serve.py` hardcodes `waitress.serve(app, host="127.0.0.1", ...)`; `infra/lib/beeatlas-stack.ts` adds a plain `ARecord` (`ApiA`) to `45.79.96.48`, surgical/additive only. Frontend `fetchWhoami()` in `src/auth-client.ts` is fire-and-forget/non-blocking (never throws, swallows errors) so species/map page render is never gated on the API — confirmed by reading the function body and 178-07's plan/tests. No `flup6`/`mod_fcgid` reference remains anywhere in `api/`, `infra/`, or the runbook (`grep -rniE "flup|mod_fcgid|\.fcgi"` clean except a historical-context comment in `api/session.py` docstring explaining *why* Waitress was chosen over the old approach). |
| 2 | iNat OAuth2 server-side exchange w/ PKCE; server-derived identity; long-lived app session; no secret in client bundle; no token in localStorage/URL; identity-only scope; exact-pinned redirect URI | ✓ VERIFIED | Code: `api/oauth.py` (`make_pkce_pair`, `authorize_url`, `exchange_code`, `fetch_identity`) implements server-side PKCE exchange with mocked-HTTP tests (`api/tests/test_oauth.py`, 11 tests). `api/config.py` asserts `REDIRECT_URI == "https://api.beeatlas.net/auth/callback"` at import (D-12/D-13 exact-match pin) via `resolve_redirect_uri()`. `api/session.py` mints a 30-day itsdangerous-signed cookie (`COOKIE_MAX_AGE = 60*60*24*30`), HttpOnly/Secure/SameSite=Strict, host-only (no Domain). `grep -rn "client_secret" src/` returns nothing. Live UAT (`docs/runbooks/notes-write-launch-gate.md` § Security UAT 2026-07-04, items 2/5/6) independently confirms: no token/secret observed in bundle/network/storage; `beeatlas_session` cookie HttpOnly+Secure+SameSite=Strict confirmed live in DevTools; redirect_uri pin holds (tampered value rejected by Doorkeeper); PKCE `code_challenge_method=S256` used live, no fallback needed. |
| 3 | Only allowlisted experts can write; server-side authz with CSRF/origin protection; forged-author and cross-origin POSTs both rejected | ✓ VERIFIED | Code: `api/auth.py require_author` re-reads `data/roles_allowlist.toml` fresh from disk every request (D-05 revocation, not the cookie's baked role), enforces a server-side Origin allow-list on state-changing verbs (`origin_allowed`, exact match against `https://beeatlas.net`/`https://www.beeatlas.net`), derives the author solely from `flask.g.identity` (never from request body — `api/main.py write_check` never reads `request.json` for identity). Unit tests (`api/tests/test_authz.py`, `test_routes.py`) cover the 401/403/503/200 matrix + forged-author. Live UAT confirms both: forged `{"author_id":999999}` → 200 with the real derived identity (999999 nowhere in response); a same POST from `https://example.com` died at CORS preflight (never sent) — the second-layer server-side Origin 403 is unit-tested. Live smoke: unauthenticated `POST /api/write-check` → `401` (confirmed directly against production during this verification). |
| 4 | Public writes not enabled until the Phase-177 restore was demonstrated — explicit launch-gate, verified before first non-test write | ✓ VERIFIED | `api/config.py WRITES_ENABLED` defaults `False`; `api/auth.py require_author` returns `503` when off. `docs/runbooks/notes-store-dr.md` § Drill Log records two PASS rows (2026-07-03 initial, 2026-07-04 re-run on the live 178-08 deployment immediately before flipping the gate). `178-08-SUMMARY.md` records the observed `503 → 200` transition after the flag flip + a real author (`rainhead = "curator"`) committed to `data/roles_allowlist.toml`. Order of operations in the runbook (restore confirmed → flag flipped → first author committed) matches the D-14/WRITE-04 requirement exactly. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/main.py` | Flask app: 5 auth/write routes + CORS + ProxyFix + error handler | ✓ VERIFIED | All routes present (`/auth/login`, `/auth/callback`, `/auth/whoami`, `/auth/logout`, `/api/write-check`, `/health`); `flask-cors` scoped to `ALLOWED_ORIGINS` with credentials; `ProxyFix(x_for=1,x_proto=1,x_host=1)`; generic `@app.errorhandler(Exception)` passes `HTTPException` through, else generic 500 body |
| `api/oauth.py` | PKCE pair, authorize_url, exchange_code, fetch_identity | ✓ VERIFIED | All four functions present, hermetic (args not module config), Bearer-vs-raw header distinction implemented correctly per Pitfall 2 |
| `api/session.py` | itsdangerous cookie mint/verify + constants | ✓ VERIFIED | `URLSafeTimedSerializer`, single `except BadSignature` catches tamper+expiry, `COOKIE_KWARGS` = HttpOnly/Secure/SameSite=Strict, no Domain |
| `api/auth.py` | require_author/require_session decorators, Origin check, allowlist recheck, launch gate | ✓ VERIFIED | Re-reads TOML from disk per-request; Origin gate on state-changing verbs; 503 launch gate; author always from `g.identity` |
| `api/users.py` | upsert_user(login, inat_user_id) -> internal id | ✓ VERIFIED | Idempotent upsert against `notes_store.models.User`, tested in `api/tests/test_users.py` |
| `api/serve.py` | Waitress entrypoint, loopback-only | ✓ VERIFIED | `waitress.serve(app, host="127.0.0.1", port=...)` hardcoded literal; sets `NOTES_DB_PATH`; forces `app.debug=False`; no flup/WSGIServer/mod_fcgid reference |
| `data/notes_store/models.py` | User ORM model | ✓ VERIFIED | `class User(Base)`: id PK, inat_user_id, unique inat_login, timestamps |
| `data/notes_store/migrations/versions/0002_add_users_table.py` | Forward-only migration | ✓ VERIFIED | `down_revision="0001"`, `downgrade()` raises `NotImplementedError`, unique index `ix_users_inat_login` |
| `data/roles_allowlist.toml` | Committed allowlist, first real author | ✓ VERIFIED | `rainhead = "curator"` committed 178-08 (`b5ac9ff5`), plus fixture entries for tests |
| `src/auth-client.ts` | fetchWhoami/startSignIn/signOut | ✓ VERIFIED | All three exported, `credentials:'include'` throughout, no secret/token literal |
| `src/bee-header.ts` | sign-in/whoami/sign-out presenter | ✓ VERIFIED | `authState` property, pure presenter (no fetch/window.location inside), dispatches `sign-in`/`sign-out` events |
| `src/entries/bee-header.ts` | whoami controller for standalone pages | ✓ VERIFIED | Fire-and-forget `fetchWhoami()`, event listeners wired |
| `src/bee-atlas.ts` | auth wiring for the map page's own `<bee-header>` instance | ✓ VERIFIED | Confirmed present (commit `e137418c`, closing a gap self-flagged by 178-07's executor): `_authState`, `fetchWhoami` on connect, `sign-in`/`sign-out` listeners added/removed in connected/disconnectedCallback |
| `infra/lib/beeatlas-stack.ts` | api.beeatlas.net A-record | ✓ VERIFIED | `ARecord(this, 'ApiA', ...)` → `45.79.96.48`; surgical/additive; live DNS confirms |
| `docs/runbooks/notes-write-launch-gate.md` | go-live + WRITE-04 launch checklist + Security UAT results | ✓ VERIFIED | Contains ProxyPass config, both D-18 supervisor branches, WRITE-04 checklist, and a dated 2026-07-04 7-item PASS UAT results table |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `api/main.py POST /api/write-check` | `api/auth.py require_author` | decorator | ✓ WIRED | `@auth.require_author` applied; live smoke test (unauthenticated → 401) confirms |
| `api/main.py /auth/callback` | `api/oauth.py` + `api/session.py` + `api/users.py` | exchange → identity → upsert → mint cookie | ✓ WIRED | Sequential calls confirmed in source; live UAT exercised the full round trip (item 1, PASS) |
| `api/serve.py waitress.serve` | `api/main.py app` (via ProxyFix) | loopback bind, reverse-proxied by Apache | ✓ WIRED | Live: DNS + TLS + `/health` 200 confirms the full chain is live and reachable |
| `src/entries/bee-header.ts` / `src/bee-atlas.ts` | `src/auth-client.ts` | fetchWhoami on load, sign-in/sign-out event handlers | ✓ WIRED | Both standalone-page and map-page headers wired (map page fixed by follow-up commit `e137418c`); live UAT item 1 explicitly exercised the map-page header |
| `writes_enabled` launch flag | `docs/runbooks/notes-store-dr.md` Drill Log | operator confirms restore before flipping | ✓ WIRED | Drill Log has two PASS rows, the second explicitly dated the same day as the flag flip |
| Apache `mod_proxy_http` vhost | Waitress on `127.0.0.1:<port>` | ProxyPass + ProxyPassReverse + X-Forwarded-Proto | ✓ WIRED | Live: `/health` reachable over TLS at the public domain, unreachable on 0.0.0.0 by design (code-level; not independently port-scanned from outside during this verification, but consistent with documented config and 178-08's live smoke test) |

### Behavioral Spot-Checks (live, non-mutating)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| DNS resolves to maderas | `dig +short api.beeatlas.net A` | `45.79.96.48` | ✓ PASS |
| Health endpoint live over TLS | `curl https://api.beeatlas.net/health` | `200 {"status":"ok"}` | ✓ PASS |
| Anonymous whoami | `curl https://api.beeatlas.net/auth/whoami` | `{"authenticated":false}` | ✓ PASS |
| Unauthenticated write-check rejected | `curl -X POST https://api.beeatlas.net/api/write-check` | `401` | ✓ PASS |
| Full Python test suite | `cd data && uv run pytest -m "not integration"` | 419 passed, 9 skipped | ✓ PASS (matches SUMMARY claim) |
| Full JS test suite | `npm test` | 923 passed (36 files) | ✓ PASS (matches SUMMARY claim) |
| `api/tests/` alone | `cd data && uv run pytest ../api/tests/ -q` | 77 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| WRITE-01 | 178-01, 178-03, 178-06, 178-08 | Thin managed write app (Waitress + mod_proxy_http), read path static | ✓ SATISFIED | Live deployment confirmed; code matches D-15/D-17 exactly |
| WRITE-02 | 178-02, 178-04, 178-05, 178-06, 178-07, 178-09 | iNat OAuth2 PKCE, server-derived identity, long-lived session, no secret/token leak | ✓ SATISFIED | Code + live UAT both confirm; redirect_uri pin, PKCE, cookie flags all verified |
| WRITE-03 | 178-05, 178-06, 178-07, 178-09 | Allowlist authz + CSRF/origin protection, forged-author + cross-origin rejection | ✓ SATISFIED | Code + live UAT both confirm (forged-author 200-with-real-identity; cross-origin CORS-blocked) |
| WRITE-04 | 178-05, 178-08, 178-09 | Public writes gated on demonstrated 177 restore | ✓ SATISFIED | Drill Log PASS x2; 503→200 transition recorded and consistent with the runbook's documented order of operations |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps only WRITE-01..04 to Phase 178, and all four are claimed and satisfied across the nine plans.

### Reconciliation Note (per verification brief)

178-02-SUMMARY and 178-03-SUMMARY flagged their own requirement completion as "mechanically marked complete" ahead of full delivery (WRITE-02's identity model was only store-side in 178-02; WRITE-01's "accepts authenticated writes" wasn't true until 178-06's routes landed). By phase close, both gaps are closed: 178-06 wires the full route surface exercising `require_author`, and 178-08/09 demonstrate the live, authenticated, gated write path end-to-end. This verification confirms the self-flagged interim gaps were resolved by later plans in the same phase, not left open.

### Anti-Patterns Found

None. Scanned all phase-modified files (`api/*.py`, `data/notes_store/models.py`, `data/notes_store/migrations/versions/0002_add_users_table.py`, `src/auth-client.ts`, `src/bee-header.ts`, `src/entries/bee-header.ts`, `src/bee-atlas.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub patterns. The only hits were the intentional `_PLACEHOLDER = "REPLACE_ME"` sentinel-detection code in `api/config.py` (load-bearing, not a stub) and a historical-context mention of `mod_fcgid` in a docstring explaining why it was rejected (not a live reference). No debt markers, no empty stub implementations, no hardcoded-empty data flowing to render.

### Human Verification Required

None. All security-critical items that require a live browser (SameSite/CORS/localStorage/HttpOnly/PKCE/redirect-pin/traceback-guard) were already executed as the mandatory 178-09 human UAT gate and recorded with a dated PASS table in `docs/runbooks/notes-write-launch-gate.md`, cross-checked against this verification's own live non-mutating smoke tests (DNS, `/health`, anonymous `whoami`, unauthenticated `write-check` 401) which are consistent with the recorded results.

### Gaps Summary

No gaps. All four ROADMAP success criteria are independently verified via a combination of static code inspection, unit test execution (419 Python + 923 JS passing, matching claimed counts), and live non-mutating checks against the deployed api.beeatlas.net (DNS, TLS, /health, whoami, write-check auth gate) performed during this verification pass. The one real gap self-flagged during execution (178-07's map-page `<bee-header>` instance not wired to auth-client) was fixed within the same phase by commit `e137418c` and was live-verified by the 178-09 UAT (explicitly noted: "exercised from the MAP page header"). Deliberate, documented deviations (flow-cookie `SameSite=Lax` vs the session cookie's `Strict`; the `DEV_MODE` local-dev loopback loop) are consistent with the verification brief's noted allowances and do not weaken any of the four ROADMAP success criteria — the production session cookie remains `Strict`, and `DEV_MODE` is loopback-gated and provably inert in production (asserted redirect_uri pin + CORS origin list).

---

*Verified: 2026-07-04*
*Verifier: Claude (gsd-verifier)*
