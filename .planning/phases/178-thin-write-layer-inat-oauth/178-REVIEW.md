---
phase: 178-thin-write-layer-inat-oauth
reviewed: 2026-07-04T16:50:48Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - api/__init__.py
  - api/auth.py
  - api/config.py
  - api/main.py
  - api/oauth.py
  - api/secrets.example.toml
  - api/serve.py
  - api/session.py
  - api/users.py
  - api/tests/conftest.py
  - api/tests/test_app.py
  - api/tests/test_authz.py
  - api/tests/test_dev_mode.py
  - api/tests/test_main_wiring.py
  - api/tests/test_oauth.py
  - api/tests/test_routes.py
  - api/tests/test_session.py
  - api/tests/test_users.py
  - data/notes_store/migrations/versions/0002_add_users_table.py
  - data/notes_store/models.py
  - data/pyproject.toml
  - data/roles_allowlist.toml
  - data/tests/test_notes_migrations.py
  - data/tests/test_notes_users.py
  - infra/lib/beeatlas-stack.ts
  - src/auth-client.ts
  - src/bee-atlas.ts
  - src/bee-header.ts
  - src/entries/bee-header.ts
  - src/env.d.ts
  - src/tests/auth-client.test.ts
  - src/tests/bee-atlas-auth.test.ts
  - src/tests/bee-header.test.ts
  - .env.development
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 178: Code Review Report

**Reviewed:** 2026-07-04T16:50:48Z
**Depth:** standard
**Files Reviewed:** 28 (+ traced dependencies: `data/notes_store/roles.py`, `data/notes_store/db.py`)
**Status:** issues_found

## Summary

Reviewed the Phase 178 thin write layer: iNat OAuth2 PKCE (server-side exchange), itsdangerous session/flow cookies, allowlist authz gate, the Flask app (`api/main.py`), Waitress serve entry, the `users` migration, the sign-in UI, and the CDK A-record.

The security-critical core is well-constructed and the adversarial pass found **no BLOCKER-tier auth bypass**: the session cookie is HMAC-signed (no `alg:none` surface — itsdangerous not PyJWT), the allowlist is re-read fresh from disk on every write (revocation works, cookie-baked role is never trusted for the authz decision), the Origin/CSRF gate fails closed on a missing header, author identity is always server-derived, and `require_real_secrets()` gates the secret-consuming routes. `ProxyFix` trusts exactly one hop, CORS is exact-match (verified: `https://beeatlas.net` contains no `flask-cors` regex-hint chars, so it is treated as a literal, never a pattern) and never wildcard+credentials. Traceback leakage is covered by `app.debug=False` plus the catch-all handler.

The 5 WARNINGs are robustness/consistency defects rather than exploitable holes: unbounded external HTTP calls (worker-thread exhaustion), a stale role echoed in the write-check response, an unhandled first-login race, over-permissive DEV_MODE origin matching (dev-scoped), and a config-validation gap for `client_id`. None block the already-live deployment, but WR-01 and WR-03 should be fixed before Phase 179 note CRUD builds real write traffic on this surface.

## Warnings

### WR-01: iNat OAuth HTTP calls have no timeout — a hung upstream ties up a Waitress worker

**File:** `api/oauth.py:72`, `api/oauth.py:99`, `api/oauth.py:106`
**Issue:** `exchange_code()` (`requests.post`) and `fetch_identity()` (two `requests.get` calls) omit a `timeout=`. Python `requests` defaults to *no timeout* — a slow or hung inaturalist.org response blocks the handling thread indefinitely. Waitress runs a small fixed thread pool (default 4); a handful of stuck callbacks can exhaust it and wedge the entire write API (including `/health` and `/auth/whoami`). This is an availability/robustness defect, not a pure-performance one — the external dependency is fully outside BeeAtlas's control.
**Fix:** Add an explicit connect+read timeout to every outbound call, e.g.:
```python
resp = requests.post(f"{INAT_BASE}/oauth/token", data={...}, timeout=(5, 15))
...
jwt_resp = requests.get(f"{INAT_BASE}/users/api_token", headers={...}, timeout=(5, 15))
me_resp  = requests.get(f"{INAT_API_BASE}/v1/users/me", headers={...}, timeout=(5, 15))
```
A `requests.exceptions.Timeout` then surfaces through the existing generic error handler as a clean 500 instead of a pinned thread.

### WR-02: `/api/write-check` echoes the stale cookie-baked role, not the freshly-read allowlist role

**File:** `api/main.py:308-309`
**Issue:** The authz *decision* correctly uses `_is_author_fresh()` (fresh disk read), but the response body returns `g.identity["role"]`, which is the role baked into the session cookie at login time. `/auth/whoami` (line 277) deliberately re-reads the fresh role for exactly this reason; `write-check` is inconsistent. A user promoted `author → curator` (or demoted) after their last login will be authorized correctly but reported with the *old* role until they re-authenticate. Phase 179's curator-takedown CRUD is explicitly slated to reuse this `require_author` surface — if it keys a curator-only action off a returned/`g.identity` role, the staleness becomes a correctness bug in that phase.
**Fix:** Derive the reported role from the fresh allowlist read that `require_author` already performs, rather than the cookie payload. Either expose the fresh role on `g` from `_is_author_fresh`/`_current_roles`, or re-read it in the view:
```python
role = main._fresh_role(identity["login"])  # or thread the fresh role through g
return jsonify({"uid": identity["uid"], "login": identity["login"], "role": role})
```

### WR-03: `upsert_user` first-login race raises IntegrityError → 500 instead of returning the existing id

**File:** `api/users.py:24-38`
**Issue:** The check-then-insert (`query(...).one_or_none()` → `if user is None: add`) is not atomic. Under Waitress's multi-threaded serving, two concurrent first-time callbacks for the same iNat login (e.g. a user double-submitting the callback, or two tabs) both see `None`, both `INSERT`, and the second `commit()` hits the `ix_users_inat_login` unique index → `sqlalchemy.exc.IntegrityError`. The losing request 500s mid-login instead of resolving to the already-created row. Data integrity is preserved by the unique index, but the login is spuriously rejected.
**Fix:** Catch the unique-violation and re-query, or use an upsert. Minimal patch:
```python
from sqlalchemy.exc import IntegrityError
...
        try:
            session.add(user)
            session.commit()
        except IntegrityError:
            session.rollback()
            user = session.query(User).filter_by(inat_login=inat_login).one()
            user.inat_user_id = inat_user_id
            user.updated_at = now
            session.commit()
        return user.id
```
(SQLite `INSERT ... ON CONFLICT(inat_login) DO UPDATE` is the tighter alternative.)

### WR-04: DEV_MODE origin matching is over-permissive (unanchored regex + prefix `startswith`)

**File:** `api/auth.py:42-58`, `api/main.py:66-69`
**Issue:** Two dev-only origin checks admit more than intended:
1. `origin_allowed()` uses `origin.startswith(("http://localhost:", "http://127.0.0.1:"))`. `http://localhost:80.evil.com` and `http://127.0.0.1:80@attacker.test` both satisfy the prefix and pass the CSRF gate.
2. The flask-cors dev origins `r"http://localhost:\d+"` / `r"http://127\.0\.0\.1:\d+"` are matched by flask-cors with `re.match`, which anchors only at the *start*. `http://localhost:1234.evil.com` matches `http://localhost:\d+` and is granted CORS credentials.

Both paths are reachable only when `config.DEV_MODE` is on (a loopback `redirect_uri` in the gitignored `secrets.toml`), which per D-12/D-13 cannot occur in production, so real-world exposure is limited to a developer's laptop. It remains a genuine matching defect worth tightening.
**Fix:** Anchor both. For the CSRF helper, parse and compare host/scheme exactly:
```python
from urllib.parse import urlsplit
def _is_loopback_origin(origin: str) -> bool:
    p = urlsplit(origin)
    return p.scheme == "http" and p.hostname in ("localhost", "127.0.0.1") and p.port is not None
```
For flask-cors, use end-anchored patterns: `r"http://localhost:\d+$"` and `r"http://127\.0\.0\.1:\d+$"`.

### WR-05: `require_real_secrets()` does not validate `INAT_CLIENT_ID`

**File:** `api/config.py:33`, `api/config.py:129-149`
**Issue:** `INAT_CLIENT_ID` defaults to `""` (empty string, not the `REPLACE_ME` sentinel) when `secrets.toml` is absent or the key is unset, and `require_real_secrets()` only inspects `INAT_CLIENT_SECRET` and `SESSION_SIGNING_KEY`. A deployment that fills the secret + signing key but omits `client_id` passes the gate, and `/auth/login` builds a `redirect` to iNat with `client_id=` empty — an opaque iNat-side error rather than the intended loud fail-fast this function exists to provide.
**Fix:** Include `client_id` in the validation. Since it is not a placeholder-style value, check for emptiness:
```python
if not INAT_CLIENT_ID:
    raise RuntimeError("api/secrets.toml is missing inaturalist_oauth.client_id ...")
```

## Info

### IN-01: `verify_cookie` catches only `BadSignature`, not the broader `BadData`

**File:** `api/session.py:71-74`
**Issue:** `URLSafeTimedSerializer.loads` can raise `BadPayload` (a `BadData` subclass that is *not* a `BadSignature` subclass — confirmed). It only fires after a valid HMAC on a corrupt payload, so it is not attacker-reachable given a fixed key, and the current tests pass. Still, an uncaught `BadPayload` would escape as a 500 rather than the intended `None`/401. Defensive-only.
**Fix:** Broaden to `except BadData:` (import from `itsdangerous`), which subsumes both signature and payload failures.

### IN-02: `authorize_url` hand-builds the query string without URL-encoding

**File:** `api/oauth.py:57-61`
**Issue:** Parameters are concatenated directly. Today every value is server-controlled and URL-safe (`state` = `token_urlsafe`, `code_challenge` = base64url no-pad, `redirect_uri` pinned, `client_id` from config), so there is no injection. It is fragile: any future value carrying `&`, `=`, or spaces would silently corrupt the redirect.
**Fix:** Build with `urllib.parse.urlencode({...})` and append to `f"{INAT_BASE}/oauth/authorize?"`.

### IN-03: `fetch_identity` indexes `results[0]` without checking for an empty list

**File:** `api/oauth.py:111`
**Issue:** `me_resp.json()["results"][0]` raises `IndexError`/`KeyError` if iNat ever returns an empty or reshaped `/v1/users/me` body. It degrades to a generic 500 via the error handler (no leak), so impact is low, but the failure mode is opaque.
**Fix:** Guard explicitly and `abort(502)` or raise a clear error when `results` is empty, so operator logs distinguish "iNat returned no identity" from a real bug.

### IN-04: `secrets.example.toml` serve port (8080) contradicts the documented DEV_MODE port (8081)

**File:** `api/secrets.example.toml:37`, `.env.development:8`, `api/config.py:120-126`
**Issue:** The template ships `[serve] port = 8080`, but `.env.development` points the client at `:8081` and `config.py`'s DEV_MODE guard requires `redirect_uri` port == `SERVE_PORT`, with its own error text steering the operator to 8081 (8080 being the Eleventy dev server). A developer copying the template verbatim and setting a `:8081` loopback `redirect_uri` trips the import-time `AssertionError`. Prod default (8080) is fine; this is purely a first-run DEV ergonomics snag.
**Fix:** Add an inline comment on the `port` line noting the DEV_MODE loopback case wants 8081, or ship the example commented so the operator must choose deliberately.

---

_Reviewed: 2026-07-04T16:50:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
