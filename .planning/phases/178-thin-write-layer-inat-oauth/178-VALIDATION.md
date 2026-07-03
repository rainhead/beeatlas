---
phase: 178
slug: thin-write-layer-inat-oauth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 178 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `178-RESEARCH.md` § Validation Architecture. **Path note:** the research
> wrote test/code paths under `data/notes_app`/`data/tests`; per CONTEXT D-15 the service
> and its tests relocate to `api/` — the planner must place new files there
> (e.g. `api/tests/test_oauth.py`), not under `data/`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.3 (`data/pyproject.toml` dev group; `-m "not integration"` default) |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` (extend `testpaths` to cover `api/tests` if the service moves out of `data/`) |
| **Quick run command** | `cd data && uv run pytest -k "oauth or session or authz or app" -x` (adjust paths once `api/` layout is set) |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~15 seconds (unit; mocks `requests` at the "Pattern D" boundary, no live iNat calls) |

---

## Sampling Rate

- **After every task commit:** Run the quick command (new `test_oauth` / `test_session` / `test_authz` files).
- **After every plan wave:** Run the full suite. Also run `npm test` if any frontend files changed for the sign-in/whoami UI (per `feedback_run_tests_before_push`).
- **Before `/gsd-verify-work`:** Full suite green **AND** the manual browser CSRF/CORS UAT completed.
- **Max feedback latency:** ~15 seconds.

---

## Per-Requirement Verification Map

| Req | Behavior | Test Type | Automated Command | Wave 0? |
|-----|----------|-----------|-------------------|---------|
| WRITE-01 | Flask/WSGI app serves under the mod_fcgid shape; read path unaffected | unit (WSGI-level; `.fcgi`/vhost are operator smoke-test, not unit-testable) | extend the existing `test_notes_app.py` health/skeleton tests (relocated to `api/`) | ✅ (existing skeleton) |
| WRITE-02 | OAuth code exchange + PKCE; identity server-derived; own session minted; no secret in client bundle; no token in localStorage/URL | unit (mock `requests`) | `test_oauth.py` (code exchange, PKCE `code_verifier`, `state` verify, `/v1/users/me` identity, iNat-token discard) + `test_session.py` (cookie mint/verify round-trip, tamper + expiry rejection) | ❌ new |
| WRITE-02 | No secret ships to the client | static/CI grep | `grep -r "client_secret" src/ dist/ && exit 1 \|\| echo CLEAN` | ❌ new (CI-able grep) |
| WRITE-03 | Only allowlisted authors authorized; CSRF/origin protection; forged-author + cross-origin POST rejected | unit + manual browser UAT | `test_authz.py` (per-request allowlist recheck, forged-author-field rejection, Origin allow-list rejection); manual: real cross-origin `fetch()` from a browser console | ❌ new + manual |
| WRITE-04 | Public writes gated on demonstrated restore | manual, already satisfied | N/A — 177-07 restore drill PASSED 2026-07-03 (`docs/runbooks/notes-store-dr.md` Drill Log); 178 only *encodes* the gate | ✅ (evidence exists) |

---

## Wave 0 Requirements

- [ ] `api/tests/test_oauth.py` — WRITE-02 (code exchange, PKCE, `state`, identity fetch, token discard)
- [ ] `api/tests/test_session.py` — WRITE-02 (`itsdangerous` cookie mint/verify, tamper + expiry rejection)
- [ ] `api/tests/test_authz.py` — WRITE-03 (allowlist recheck, forged-author rejection, Origin rejection)
- [ ] `uv add flup6 flask-cors` — only new dependency install (pytest already configured)
- [ ] Extend the existing `test_notes_app.py` SCOPE-GUARD assertion (which currently asserts no write verbs exist) once real routes land — an intentional-scope-move signal.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-browser cross-origin CSRF/CORS: a cross-origin `fetch()` POST is rejected; a same-site call from `beeatlas.net` succeeds | WRITE-03 | pytest `test_client()` does not enforce real browser `SameSite`/CORS semantics | Run the dev service; from a foreign-origin page's console `fetch('https://api.beeatlas.net/…', {method:'POST', credentials:'include'})` → must be blocked; sign-in from `beeatlas.net` → succeeds |
| No OAuth token / secret leaks to the client (bundle, `localStorage`, URL, network tab) | WRITE-02 | Requires inspecting a live browser session | Sign in on a dev instance; confirm no `client_secret`, no iNat token, and no app-session contents readable from JS (`HttpOnly`), URL, or `localStorage` |
| Redirect URI exact-match pin holds | WRITE-02 | Depends on live iNat Doorkeeper | Confirm the OAuth exchange succeeds only with `https://api.beeatlas.net/auth/callback` (D-12/D-13) |
| Public-write launch gate | WRITE-04 | Operator checklist item | Verify the encoded gate references the demonstrated 177-07 restore before the endpoint accepts its first non-test write |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
