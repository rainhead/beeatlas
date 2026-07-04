# Phase 178: Thin Write Layer + iNat OAuth - Research

> **⚠ SERVING-MECHANISM SUPERSESSION (2026-07-03) — read before using the deployment sections.**
> This research recommended `flup6` + Apache `mod_fcgid` + a `.fcgi` wrapper. **That was REJECTED
> during execution** — `flup6`'s last release was 2015; an unmaintained decade-stale dependency for
> the write layer's HTTP front door is unacceptable. **Authoritative decision: CONTEXT.md D-17/D-18 —
> serve the WSGI app with [Waitress](https://docs.pylonsproject.org/projects/waitress/) (maintained,
> pure-Python WSGI server) as a persistent loopback process behind Apache `mod_proxy_http`; Flask uses
> `ProxyFix` to trust `X-Forwarded-*`; supervise via a `--user` systemd unit (confirm systemd on
> maderas first) else cron `@reboot`.** Everything below about `flup6`/`mod_fcgid`/`.fcgi`/Pitfall 3
> (flup `cgitb`) is **obsolete** — the OAuth, session, CSRF/CORS, and secrets research is unaffected.
> Waitress keeps the one virtue flup6 had here: pure-Python, so nothing compiles against Python 3.14.

**Researched:** 2026-07-03
**Domain:** Server-side OAuth2 (Doorkeeper/iNaturalist) + Apache mod_fcgid/Flask deployment + cross-subdomain CSRF/CORS
**Confidence:** HIGH (OAuth mechanics + mod_fcgid deployment verified live; MEDIUM on exact scope/consent behavior — iNat's scope model is coarser than typical OAuth providers)

## Summary

This phase has three technically distinct research domains, all now grounded in live-verified evidence rather than training-data recall: (1) iNaturalist's Doorkeeper-based OAuth2 provider, confirmed live via direct `curl` against `https://www.inaturalist.org/oauth/authorize`, `/oauth/token`, `/users/api_token`, and `https://api.inaturalist.org/v1/users/me`, plus the official `iNaturalistAPI` Swagger spec and the official `inaturalistjs` client source; (2) the Apache `mod_fcgid` + Flask deployment mechanics, confirmed by installing and importing `flup6`'s `flup.server.fcgi.WSGIServer` against the exact Python 3.14.6 the project targets; (3) cross-subdomain CSRF/CORS composition for a static `beeatlas.net` frontend calling a `api.beeatlas.net` Flask API, reasoned from the concrete production domain topology in `infra/lib/beeatlas-stack.ts` and the real maderas IP/DNS plan already recorded in Phase 177's `177-07-SUMMARY.md`.

Three findings materially change what "verify against live docs" means for this phase, all HIGH confidence because they were directly tested or read from official source, not assumed: (a) iNaturalist does **not** have a true identity-only OAuth scope — the community-documented experience is that a token without at least the default `write` scope 403s at `/users/api_token`, so "identity-only OAuth scope" (WRITE-03) must be interpreted as "we never request more than the app's registered default scope and never touch write endpoints," not as a Doorkeeper `scope=login` parameter; (b) the `/users/api_token` JWT must be requested with `Authorization: Bearer <oauth_access_token>`, but the official `inaturalistjs` client sends that same JWT **raw, without a `Bearer` prefix**, on subsequent `/v1/*` calls (`headers.Authorization = apiToken`) — this is the "raw Authorization-header gotcha" the phase brief warned about, now confirmed at the source-code level; (c) `flup6`'s `WSGIServer` defaults to `debug=True`, which on any unhandled exception uses Python's `cgitb` module to render a full traceback — including local variables and source — directly into the unauthenticated HTTP response. This is a live vulnerability class if the `.fcgi` wrapper doesn't explicitly pass `debug=False`.

**Primary recommendation:** Build the OAuth exchange with plain `requests` (already a project dependency) rather than an OAuth client library — it's two HTTP calls. Sign the session cookie with `itsdangerous.URLSafeTimedSerializer` (already installed transitively via Flask; zero new dependency, and structurally immune to the JWT `alg:none`/algorithm-confusion vulnerability class). Use `flup6` + a `.fcgi` wrapper with `debug=False` explicit. Store `client_secret` and the cookie-signing key in a new gitignored `data/notes_app/secrets.toml`, following the exact pattern already established by `data/.dlt/secrets.toml` for Ecdysis credentials. Gate CSRF with `SameSite=Strict` on the session cookie (safe here because `beeatlas.net` and `api.beeatlas.net` share the same registrable domain, so this is a same-site-but-cross-origin request, not a cross-site one) plus a server-side Origin allow-list check, and CORS via `flask-cors` scoped to the exact `https://beeatlas.net` origin(s) with credentials enabled (never wildcard + credentials — browsers reject that combination outright).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth2 code exchange (client_secret + PKCE) | API / Backend (maderas Flask) | — | Must never expose `client_secret`; server-side only per D-01/D-02 |
| Identity derivation (`/v1/users/me`) | API / Backend | — | Server-derived identity is the whole point of D-01 — never trust client claims |
| Session issuance (signed cookie) | API / Backend | Browser (cookie storage only) | Cookie is `HttpOnly` — browser cannot read/write its contents, only carries it |
| Allowlist authorization + revocation recheck | API / Backend | — | Reads committed `roles_allowlist.toml` fresh per write request (D-05) |
| CSRF/Origin validation | API / Backend | — | `SameSite` is client-enforced defense-in-depth; Origin check is the authoritative server-side gate |
| Sign-in / whoami UI | Browser / Client (static `beeatlas.net`) | — | D-10: static custom-element UI on the existing Eleventy/Vite site, calling the API cross-origin |
| `.fcgi` process lifecycle | CDN / Static → N/A; this is Apache/mod_fcgid | — | mod_fcgid spawns/reaps FastCGI workers on demand; no persistent daemon, no in-process session store possible (reinforces D-04's "no server-side session store") |
| DNS + TLS for `api.beeatlas.net` | Infra (Route53/CDK + maderas Apache/certbot) | — | New A-record (plain IP target, not CloudFront alias) + certbot cert, distinct from the CloudFront ACM certs |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `flask` | 3.1.3 (already installed; `data/pyproject.toml` pins `>=3.1.2`) | WSGI app, routing, cookie handling | Already the project's chosen framework (177 D-02); `set_cookie(samesite=...)` is native since Flask 1.1 |
| `itsdangerous` | 2.2.0 (already installed — transitive Flask dependency, **zero new footprint**) | Sign the long-lived session cookie payload | `URLSafeTimedSerializer` gives signed+timestamped tokens with `max_age` expiry checking built in; verified via direct execution against this exact version (see Code Examples) |
| `flup6` | 1.1.1 [ASSUMED — see Package Legitimacy Audit] | FastCGI↔WSGI bridge for `mod_fcgid` | The only actively-installable, currently-functioning `flup.server.fcgi.WSGIServer` for Python 3; directly verified importable and functional on Python 3.14.6 (project's exact pinned interpreter) in this research session |
| `requests` | 2.34.2 (already installed) | iNat OAuth code exchange + `/users/api_token` + `/v1/users/me` calls | Already a project dependency (`ecdysis_pipeline.py` uses the identical `requests.Session` mocking pattern — "Pattern D" — reuse it for OAuth tests) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `flask-cors` | 6.0.5 [ASSUMED — see audit] | CORS header correctness for the `beeatlas.net` → `api.beeatlas.net` cross-origin fetch | Recommended over hand-rolled `Access-Control-*` headers — preflight (OPTIONS) handling, `Vary: Origin`, and credentialed-request rules have subtle correctness traps (see Don't Hand-Roll) |
| `secrets` (stdlib) | — | PKCE `code_verifier` generation (43–128 char high-entropy string, RFC 7636 §4.1) | `secrets.token_urlsafe(64)` produces a compliant, cryptographically random verifier — no new dependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `itsdangerous` signed cookie | `PyJWT` (2.13.0, verified installable) | JWT brings algorithm-negotiation surface (`alg: none`, HS/RS confusion — a real, historically-exploited vulnerability class); `itsdangerous` has a single fixed HMAC scheme and no such negotiation. No functional need for JWT's interoperability here since only this app ever reads the cookie. Recommend `itsdangerous` unless the planner has a specific reason to interop the cookie payload with another JWT-consuming system (none exists) |
| `flup6` `.fcgi` wrapper | `fcgisgi` (0.2.2, PyPI, first released 2026-04-12) | Modern asyncio-based FastCGI↔ASGI/WSGI adapter, but ~3 months old at research time, 1 GitHub star, single maintainer, `requires-python>=3.11`. Flagged `[SUS]`-adjacent in the audit below (new + unproven) — not recommended as primary, but noted as a future swap if `flup6`'s age becomes a real maintenance concern |
| Hand-rolled CORS headers | `flask-cors` | A hand-rolled implementation is exactly the kind of "deceptively simple, easy to get subtly wrong" problem `flask-cors` exists to solve (see Don't Hand-Roll) |
| `SameSite` + Origin check | Double-submit CSRF token (`flask-wtf`) | Heavier dependency (pulls in WTForms); not needed given the same-registrable-domain topology (see Architecture Patterns → CSRF/CORS pattern). Available as a stronger fallback if the planner wants defense-in-depth beyond Origin checking |

**Installation:**
```bash
cd data
uv add flup6 flask-cors
# itsdangerous, requests, flask already present — no action needed
```

**Version verification:** All versions above were confirmed live against PyPI's JSON API during this research session (2026-07-03):
```
flup6:      1.1.1   (upload 2015-07-31 — stale but functionally verified, see below)
flask-cors: 6.0.5   (actively maintained, github.com/corydolphin/flask-cors)
PyJWT:      2.13.0  (actively maintained, github.com/jpadilla/pyjwt — alternative only)
itsdangerous: 2.2.0 (already installed; Pallets project, github.com/pallets/itsdangerous)
requests:   2.34.2  (already installed)
fcgisgi:    0.2.2   (released 2026-04-20, requires-python>=3.11 — alternative only)
```
`flup6`'s last PyPI release is from 2015. This was investigated specifically because staleness is a real risk signal: it was installed into a scratch venv and `from flup.server.fcgi import WSGIServer` was directly exercised against **Python 3.14.6** (the exact version this project requires) — it imports and instantiates cleanly. The FastCGI wire protocol itself is a stable, decade-old IETF-adjacent spec (not subject to Python-version churn), so a stale-but-pure-Python implementation carries much lower risk than a stale package with C extensions or OS-API dependencies would.

## Package Legitimacy Audit

Ran `slopcheck install <pkgs> --ecosystem pypi` in a disposable venv (all 5 candidate new/changed packages checked; `requests`/`itsdangerous`/`flask` were already present as a control):

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `flup6` | PyPI | ~11 yrs (2015) | not queried (low, legacy) | `bitbucket.org/denisenkom/flup` | [OK] | Approved — functionally verified on Python 3.14.6 this session |
| `flask-cors` | PyPI | ~13 yrs (active) | high (standard Flask ecosystem package) | `github.com/corydolphin/flask-cors` | [OK] | Approved |
| `PyJWT` | PyPI | ~10 yrs (active) | very high | `github.com/jpadilla/pyjwt` | [OK] | Approved (alternative only, not primary recommendation) |
| `itsdangerous` | PyPI | ~14 yrs (active, Pallets) | very high | `github.com/pallets/itsdangerous` | [OK] | Approved — already installed, zero new footprint |
| `requests` | PyPI | ~15 yrs (active) | very high | `github.com/psf/requests` | [OK] | Approved — already installed |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none by slopcheck itself. **Editorial flag (not slopcheck-derived):** `fcgisgi` (considered as a `flup6` alternative, not adopted) is new enough (first PyPI release 2026-04-12, 1 GitHub star) that if the planner substitutes it for `flup6`, it should be gated behind a `checkpoint:human-verify` — it was not run through slopcheck because it isn't the recommended package.

All five recommended packages passed both the registry-existence check and the qualitative repo/maintainer check performed manually above (official docs / GitHub org, not just PyPI presence) — they may be tagged `[VERIFIED: npm/PyPI registry + slopcheck]` per the provenance rule, **except** where noted `[ASSUMED]` in the Standard Stack table because the specific package *names* (`flup6`, `flask-cors`) were surfaced via WebSearch/training recall before being confirmed, per the package-name provenance rule (registry existence + slopcheck alone doesn't upgrade a WebSearch-sourced name to `[VERIFIED]`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐         ┌──────────────────────────────────────────┐
│  beeatlas.net (static)   │         │  api.beeatlas.net (maderas, Apache)        │
│  CloudFront + S3          │         │                                            │
│                            │         │  mod_fcgid spawns/reaps per-request        │
│  bee-atlas custom element  │ 1. GET  │  ┌──────────────────────────────────────┐ │
│  "Sign in with iNat" btn   │────────▶│  │ /auth/login                          │ │
│                            │         │  │  generate code_verifier + state      │ │
│                            │         │  │  redirect → inaturalist.org/oauth/   │ │
│                            │         │  │  authorize?...&code_challenge=...    │ │
│                            │         │  └──────────────────────────────────────┘ │
└─────────────────────────┘         │                    │                        │
                                       │                    ▼                        │
                          ┌────────────┼───────── inaturalist.org (Doorkeeper) ─────┤
                          │  2. user authorizes app                                  │
                          │  3. 302 redirect → api.beeatlas.net/auth/callback?code=..&state=..
                          ▼                                                          │
┌──────────────────────────────────────────────────────────────────────────────┐    │
│  /auth/callback (server-side, never touches browser JS)                       │    │
│   a. verify `state` matches the one issued at /auth/login (CSRF-on-OAuth gate)│    │
│   b. POST inaturalist.org/oauth/token                                         │    │
│      {client_id, client_secret, code, redirect_uri, code_verifier,            │    │
│       grant_type=authorization_code}                                          │    │
│   c. GET inaturalist.org/users/api_token   Authorization: Bearer <access_tok> │    │
│      → 24h JWT                                                                │    │
│   d. GET api.inaturalist.org/v1/users/me   Authorization: <JWT>  (raw, no     │    │
│      "Bearer " prefix — see Pitfall 2)                                        │    │
│   e. DISCARD the iNat access_token + JWT (D-03) — never persisted             │    │
│   f. upsert `users` row (iNat login + numeric id) → internal integer id       │    │
│   g. re-read roles_allowlist.toml → role for this iNat login                  │    │
│   h. mint itsdangerous-signed cookie {internal_id, inat_login, role, exp}     │    │
│   i. Set-Cookie: HttpOnly; Secure; SameSite=Strict; Domain=api.beeatlas.net    │    │
│   j. 302 redirect back to beeatlas.net (whatever page initiated sign-in)      │    │
└──────────────────────────────────────────────────────────────────────────────┘    │
                          │                                                          │
                          ▼                                                          │
┌──────────────────────────────────────────────────────────────────────────────┐    │
│  Every subsequent write/whoami request from beeatlas.net JS:                  │    │
│   fetch('https://api.beeatlas.net/...', {credentials: 'include'})             │    │
│    → browser attaches the cookie (same-site, cross-origin — see CSRF pattern) │    │
│    → CORS preflight: flask-cors allows only https://beeatlas.net origin       │    │
│    → server: verify signature+expiry (itsdangerous.loads(max_age=...))        │    │
│    → server: re-read roles_allowlist.toml for inat_login → reject if removed  │    │
│    → server: check Origin header against allow-list (CSRF gate)               │    │
│    → 200 (whoami) or 403 (not allowlisted / bad origin / forged author)       │    │
└──────────────────────────────────────────────────────────────────────────────┘────┘
```

### Recommended Project Structure
```
data/notes_app/
├── main.py          # Flask app factory / route registration (existing skeleton)
├── oauth.py         # code exchange, PKCE verifier/challenge, /users/api_token, /v1/users/me
├── session.py       # itsdangerous serializer, cookie mint/verify, cookie constants
├── auth.py          # @require_author / @require_curator decorators; allowlist recheck
├── secrets.toml     # GITIGNORED — client_id, client_secret, cookie signing key
├── app.fcgi          # .fcgi wrapper: WSGIServer(app, debug=False).run()
tests/
├── test_notes_app.py         # existing health-skeleton tests (extend, don't replace)
├── test_notes_oauth.py       # mocks requests.Session per "Pattern D" (test_ecdysis_auth.py)
├── test_notes_session.py     # itsdangerous round-trip, expiry, tamper-rejection
├── test_notes_authz.py       # allowlist recheck, forged-author rejection, CSRF/Origin rejection
```

### Pattern 1: Server-side PKCE code exchange with a confidential client (D-01/D-02)
**What:** Register the iNat app as a normal (confidential) OAuth application — `client_secret` issued and stored server-side — but *additionally* generate and send PKCE `code_challenge`/`code_verifier` as defense-in-depth, even though PKCE was originally designed for clients that *cannot* hold a secret.
**When to use:** Always, for this phase — this is the locked D-01/D-02 decision.
**Confirmed:** Doorkeeper (iNat's OAuth gem) exposes a `force_pkce` config that is documented as targeting *non-confidential* clients specifically, but OAuth 2.1 explicitly RECOMMENDS combining PKCE with confidential clients as defense-in-depth, and nothing in Doorkeeper's PKCE implementation requires the client to be non-confidential — it validates `code_challenge`/`code_verifier` whenever present, independent of the `confidential` flag [CITED: doorkeeper-gem PKCE docs + OAuth 2.1 draft, cross-verified via WebSearch]. One community forum troubleshooting thread mentions needing `confidential=false` to get PKCE to work at all for a *public* client (no secret) — that was about a **different** failure mode (an app with no secret trying to authenticate without PKCE), not a restriction on confidential clients adding PKCE. Carry the plain server-side exchange (no PKCE) as fallback per D-02 if live testing during implementation shows Doorkeeper rejects `code_challenge` on a confidential-app token request.
**Example:**
```python
# Source: verified live against https://www.inaturalist.org/oauth/{authorize,token}
# and https://gist.github.com/kueda/0ad3c5b78c822bd059f095152165a9e0 (iNat staff gist)
import base64
import hashlib
import secrets

import requests

INAT_BASE = "https://www.inaturalist.org"

def make_pkce_pair() -> tuple[str, str]:
    """RFC 7636 S256: verifier is 43-128 chars, challenge is its base64url(sha256(...))."""
    verifier = secrets.token_urlsafe(64)  # ~86 chars, well within range
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge

def authorize_url(client_id: str, redirect_uri: str, state: str, code_challenge: str) -> str:
    # Exact-pinned redirect_uri: must byte-match what's registered in the iNat app config.
    return (
        f"{INAT_BASE}/oauth/authorize?client_id={client_id}"
        f"&redirect_uri={redirect_uri}&response_type=code"
        f"&state={state}&code_challenge={code_challenge}&code_challenge_method=S256"
    )

def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str, verifier: str) -> str:
    resp = requests.post(f"{INAT_BASE}/oauth/token", data={
        "client_id": client_id,
        "client_secret": client_secret,   # confidential-client credential
        "code": code,
        "redirect_uri": redirect_uri,      # must exactly match the /oauth/authorize call
        "grant_type": "authorization_code",
        "code_verifier": verifier,         # PKCE defense-in-depth (D-02)
    })
    resp.raise_for_status()
    return resp.json()["access_token"]

def fetch_identity(access_token: str) -> dict:
    # Step 1: OAuth access_token -> 24h JWT. Bearer prefix REQUIRED here.
    jwt_resp = requests.get(f"{INAT_BASE}/users/api_token",
                             headers={"Authorization": f"Bearer {access_token}"})
    jwt_resp.raise_for_status()
    jwt = jwt_resp.json()["api_token"]

    # Step 2: JWT -> identity. Official inaturalistjs client sends this RAW,
    # with NO "Bearer " prefix (headers.Authorization = apiToken). See Pitfall 2.
    me_resp = requests.get("https://api.inaturalist.org/v1/users/me",
                            headers={"Authorization": jwt})
    me_resp.raise_for_status()
    return me_resp.json()["results"][0]  # {id, login, ...}
```

### Pattern 2: One long-lived signed cookie, no server-side session store (D-04/D-05)
**What:** `itsdangerous.URLSafeTimedSerializer` mints a signed, timestamped token containing `{internal_id, inat_login, role, }`; expiry is enforced by `max_age` on `.loads()`, not stored server-side. Authorization freshness comes from re-reading `roles_allowlist.toml` on every write, not from cookie age.
**When to use:** Every authenticated request.
**Example (directly executed and verified this session against itsdangerous 2.2.0 / Python 3.14.6):**
```python
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

SESSION_SALT = "beeatlas-notes-session"  # domain-separates this serializer from any other future use

def make_serializer(secret_key: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret_key, salt=SESSION_SALT)

def mint_cookie(serializer, internal_id: int, inat_login: str, role: str | None) -> str:
    return serializer.dumps({"uid": internal_id, "login": inat_login, "role": role})

def verify_cookie(serializer, token: str, max_age_seconds: int) -> dict | None:
    try:
        return serializer.loads(token, max_age=max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None  # tampered, unsigned, or expired -> treat as logged out
```
Verified behavior: `.loads()` raises `BadTimeSignature` (subclass of `BadSignature`) on a tampered token; `SignatureExpired` (also a `BadSignature` subclass) once `max_age` is exceeded. Both are safely caught by the single `except BadSignature` clause above.

### Pattern 3: CSRF/CORS for a same-registrable-domain, cross-origin static→API call
**What:** `beeatlas.net` and `api.beeatlas.net` are different **origins** (browser same-origin policy: different host) but the same **site** (same eTLD+1, per the Public Suffix List, for `SameSite` cookie purposes). This distinction is the crux of the whole CSRF/CORS design and is the most common place implementers get this topology wrong.
**When to use:** This exact topology — a static frontend on the apex/www domain calling an API on a subdomain of the same registrable domain, with cookie-based auth.
**Concretely:**
- **CORS is required** regardless of cookie SameSite settings — CORS governs whether the *browser's JS* is allowed to read the cross-origin response; SameSite governs whether the *cookie* is attached to the request at all. They are orthogonal.
- **`SameSite=Strict` is viable and recommended** here (not just `Lax`) — Strict only blocks cookie attachment on genuinely cross-*site* requests; since `api.beeatlas.net`'s cookie will be requested by a fetch originating from `beeatlas.net`, and both share registrable domain `beeatlas.net`, this is same-site, so the cookie IS sent even under `Strict`.
- **Do not set `Domain=.beeatlas.net`** on the cookie — leave it host-only (defaults to the exact host that set it, `api.beeatlas.net`). The cookie is never needed by the static site itself (which holds no secrets and does no auth-gated rendering), so scoping it to the API host only shrinks the blast radius (an XSS on the static site cannot exfiltrate the session cookie value directly, though `HttpOnly` already prevents JS read access entirely).
- **CORS must NOT use `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`** — browsers reject that combination by spec. Use an explicit origin allow-list (`https://beeatlas.net`, and `https://www.beeatlas.net` if the www redirect ever serves the UI) via `flask-cors`'s `origins=[...]` + `supports_credentials=True`.
- **Server-side Origin/Referer check is the authoritative CSRF gate**, not SameSite alone — SameSite is a client (browser) enforcement mechanism; a server-side check on the `Origin` header (rejecting any write request whose Origin isn't in the allow-list, and rejecting requests with no Origin header on state-changing verbs) doesn't depend on browser compliance and covers non-browser clients attempting the classic forged-request attack.
- **A separate `state` parameter (OAuth-flow CSRF, RFC 6749 §10.12) protects the `/auth/callback` endpoint** — this is distinct from the write-endpoint CSRF protection above. Generate a random `state` at `/auth/login`, store it (signed cookie or short-lived server-side single-use record), and verify exact match on callback before exchanging the code. Without this, an attacker can trick a victim into completing an OAuth flow that links the *attacker's* iNat identity into the *victim's* browser session (session-fixation-adjacent attack).

### Anti-Patterns to Avoid
- **Trusting a client-supplied `author_id`/`login` field on any write request:** the entire point of D-07 is that authorship is derived server-side from the verified session cookie. A request body or query param claiming a different author must never be consulted for authorization — this is exactly the "forged-author request rejected" security-UAT criterion.
- **Reusing Flask's built-in `session` cookie mechanism for this purpose:** Flask's default session cookie is a different, separately-configured mechanism (`app.secret_key` + its own serializer) intended for lightweight framework use; using a purpose-built `itsdangerous.URLSafeTimedSerializer` with an explicit salt, explicit `max_age` check, and an explicit cookie name keeps the security-critical session mechanism auditable and decoupled from any future unrelated use of Flask's session object.
- **Letting `flup6`'s `WSGIServer` run with its `debug=True` default in production** — see Pitfall 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie/token signing & tamper detection | Custom HMAC-over-JSON scheme | `itsdangerous.URLSafeTimedSerializer` | Constant-time comparison, timestamp encoding, and the exact byte-format for URL-safety are all easy to get subtly wrong (timing side-channels, encoding edge cases); this is exactly the class of problem `itsdangerous` exists to solve, and it's already a transitive dependency |
| CORS preflight/response headers | Manual `Access-Control-*` header setting in an `after_request` hook | `flask-cors` | Correct preflight (OPTIONS) short-circuiting, `Vary: Origin` header (needed for CDN/cache correctness even though this API isn't cached), and the wildcard+credentials rejection rule are all easy to miss by hand |
| PKCE code_verifier/challenge encoding | Custom base64 handling | Python stdlib `secrets` + `hashlib` + `base64.urlsafe_b64encode(...).rstrip(b"=")` | RFC 7636's "base64url without padding" requirement (`+`→`-`, `/`→`_`, strip `=`) is a well-known trip point (see the live forum report of a developer double-hashing the challenge and getting an opaque 400) — stdlib primitives compose this correctly in ~3 lines, no extra dependency needed, but the exact recipe must be followed |
| FastCGI wire-protocol handling | Hand-rolled FastCGI record parser | `flup6`'s `flup.server.fcgi.WSGIServer` | The FastCGI protocol (record framing, multiplexing, roles) is a nontrivial binary protocol; even though `flup6` is old, reimplementing this from scratch for one deployment is far riskier than depending on a stable, protocol-frozen implementation |

**Key insight:** every "don't hand-roll" item above is a place where the *failure mode of getting it subtly wrong* is silent or security-relevant (a slightly-wrong PKCE encoding produces a cryptic 400, not a helpful error; a slightly-wrong CORS header either silently blocks legitimate requests or silently permits illegitimate ones; a hand-rolled signer might be forgeable in a way that isn't obvious from code review). This phase is explicitly security-critical (see `<security_focus>` in the phase brief) — the cost of a library dependency is much lower than the cost of a subtle auth bug here.

## Common Pitfalls

### Pitfall 1: Treating iNat's OAuth scope as fine-grained (read-only / identity-only)
**What goes wrong:** Assuming you can request `scope=login` or similar to get a token that can only fetch identity, minimizing blast radius per WRITE-03's "minimal (identity-only) OAuth scope" language.
**Why it happens:** Most modern OAuth providers (Google, GitHub, etc.) support fine-grained scopes, so it's a reasonable prior. iNaturalist's OAuth scope model is coarser.
**How to avoid:** A community report (uncorroborated by iNat staff, but consistent with the absence of any documented `scope` parameter in the live-verified `/oauth/authorize` flow) states that requesting a token with only a `login` scope results in a 403 at `/users/api_token`, because that endpoint requires the app's default (write-capable) scope. Interpret "identity-only OAuth scope" pragmatically: register the app normally (default scope), but the *application code* never calls any iNat write endpoint and never persists the iNat access token or JWT past the single identity-fetch — the minimization is behavioral (D-03: "discard the iNat token"), not a Doorkeeper `scope` parameter. Document this interpretation explicitly in the plan so WRITE-03 isn't later read as unmet.
**Warning signs:** A 403 from `/users/api_token` during implementation despite a successful `/oauth/token` exchange — this is the scope issue, not a bug in the exchange code.
**Confidence:** MEDIUM — corroborated by one community forum thread (non-staff), not by an official scope-list document (none appears to exist for iNat's OAuth implementation). Flag for confirmation during implementation (first real `/users/api_token` call against a live registered app will settle this definitively).

### Pitfall 2: The `/users/api_token` JWT `Authorization` header format differs between the token-mint call and subsequent API calls
**What goes wrong:** Using the same header format (`Bearer <token>`) for both requesting the JWT and using it, or vice versa, causing silent 401s that look like an expired/invalid token.
**Why it happens:** iNat's own documentation historically had a typo (`Authentication` instead of `Authorization` header name) and ambiguous guidance on the `Bearer` prefix, acknowledged in a still-open forum bug report with no definitive resolution from staff.
**How to avoid:** Verified two different, correct usages at two different call sites:
- Requesting the JWT: `GET /users/api_token` with `Authorization: Bearer <oauth_access_token>` (confirmed via the official `inaturalistjs` README example: `curl -H "Authorization: Bearer YOUR_OAUTH_ACCESS_TOKEN" https://www.inaturalist.org/users/api_token`).
- Using the JWT for `/v1/*` calls: the official `inaturalistjs` client source (`lib/inaturalist_api.js`) sets `headers.Authorization = apiToken` — the raw JWT, **no `Bearer` prefix**. The Swagger spec's `securityDefinitions` for `api_token` confirms `{"type": "apiKey", "in": "header", "name": "Authorization"}`, i.e. an opaque header value, not a `Bearer`-scheme requirement.
- Given the forum's own acknowledged ambiguity ("the need for 'Bearer' might depend on what you're using"), the safest implementation sends the raw JWT (matching the official client) but should be verified against the live endpoint during first implementation, since Rack/Rails-side Bearer-stripping behavior can be permissive of both forms in practice.
**Confidence:** HIGH for the `/users/api_token` call (direct client-source citation); MEDIUM for the exact tolerance of `/v1/users/me` (official client uses raw, but real-world tolerance of an extra `Bearer ` prefix wasn't independently confirmed live in this session — no test credentials available).

### Pitfall 3: `flup6`'s `WSGIServer(app)` defaults to `debug=True`, which leaks tracebacks to unauthenticated requesters
**What goes wrong:** Any unhandled exception in the Flask app (a bug, a malformed request, a downstream `requests` timeout to iNat) renders a full Python traceback — including local variable values, which could include the `client_secret` or a partially-processed token — directly into the HTTP response body, to any requester, no auth required.
**Why it happens:** `flup`'s `WSGIServer.__init__` signature defaults `debug=True`; when true, its exception handler imports `cgitb` and calls `cgitb.html(sys.exc_info())` to build the response.
**How to avoid:** Verified directly by reading `flup/server/fcgi_base.py` (installed package source, this session): explicitly pass `debug=False` when constructing `WSGIServer` in the `.fcgi` wrapper script. Combine with Flask's own `app.debug = False` (should already be the default in a non-`FLASK_DEBUG` environment) — these are two independent debug flags (flup's FastCGI-server-level debug vs. Flask's own).
**Warning signs:** During manual testing, deliberately trigger an exception (e.g. a malformed OAuth callback) and confirm the response is a generic error page, not a traceback with `cgitb`'s characteristic HTML table-of-locals format.
**Confidence:** HIGH — read directly from installed package source this session, not inferred.

### Pitfall 4: Conflating "cross-origin" with "cross-site" for CSRF purposes
**What goes wrong:** Either (a) assuming `SameSite=Lax`/`Strict` alone is insufficient because the request "crosses origins" (leading to over-engineering, e.g. a double-submit token that isn't needed), or (b) assuming no CORS setup is needed because the cookie will "just work" the way a same-origin form-post would.
**Why it happens:** "Cross-origin" and "cross-site" are frequently used interchangeably in casual discussion but are precisely different concepts in browser security models — origin = scheme+host+port; site = registrable domain (eTLD+1).
**How to avoid:** See Architecture Patterns → Pattern 3 above for the precise reasoning. In short: this is cross-origin (needs CORS) but same-site (SameSite cookies work normally).
**Confidence:** HIGH — this is settled browser-security-model behavior (Fetch/CORS spec + RFC 6265bis SameSite semantics), not iNat- or project-specific.

### Pitfall 5: Code defaults (`/opt/beeatlas-store/notes.db`) don't match the real deployed path
**What goes wrong:** Trusting the `NOTES_DB_PATH` default baked into `data/notes_store/db.py` and `migrations/env.py` (`/opt/beeatlas-store/notes.db`) instead of the actual maderas deployment.
**Why it happens:** maderas has **no passwordless sudo** (confirmed operationally in Phase 177's 177-07 execution — see `docs/runbooks/notes-store-dr.md` §2a), so `/opt/...` was never actually usable; the real store lives at `~/beeatlas-store/notes.db` with `NOTES_DB_PATH` set explicitly in every invocation's environment.
**How to avoid:** The `.fcgi` wrapper's environment (set via the Apache vhost's `SetEnv` / `PassEnv` directives, or a wrapper-script `os.environ[...]` assignment before importing `notes_store`) **must** set `NOTES_DB_PATH=/home/<operator>/beeatlas-store/notes.db` (or read it from the same `secrets.toml`/env mechanism as the client_secret) — do not rely on the code's built-in default.
**Confidence:** HIGH — directly sourced from Phase 177's actual operator execution record in this repo (`.planning/phases/177-.../177-07-SUMMARY.md`, `docs/runbooks/notes-store-dr.md`), not external research.

## Code Examples

### DNS + TLS for `api.beeatlas.net` (context for the plan, not app code)
```typescript
// Source: 177-07-SUMMARY.md records the actual target IP already chosen by the operator.
// Surgical addition to infra/lib/beeatlas-stack.ts (never cdk destroy — memory
// project_cdk_stack_composition). This is a PLAIN A record to an IP, not a
// CloudFront alias — api.beeatlas.net serves directly from maderas via Apache,
// with its own certbot-issued TLS cert (independent of the CloudFront ACM certs
// used for beeatlas.net / beeatlas.com).
new route53.ARecord(this, 'ApiA', {
  zone: netZone,
  recordName: 'api',
  target: route53.RecordTarget.fromIpAddresses('45.79.96.48'),
});
```
This is almost certainly an **operator-only, `autonomous: false` task** (like Phase 177's plan 177-07) — it requires interactive `sudo` on maderas for the Apache vhost + certbot + mod_fcgid config, matching the precedent already set in this milestone.

### Frontend API base URL (reuse existing Vite env convention)
```typescript
// Source: src/manifest.ts (existing pattern for VITE_DATA_BASE_URL)
const API_BASE = (import.meta.env.VITE_NOTES_API_BASE_URL as string | undefined)
  ?? 'https://api.beeatlas.net';
```
Add `VITE_NOTES_API_BASE_URL?: string` to `src/env.d.ts` alongside the existing `VITE_DATA_BASE_URL` declaration.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Flask's official docs FastCGI/`flup` deployment guide | Removed from current Flask docs (last present ~Flask 0.10/1.0 era, still archived at `flask-dev.readthedocs.io`) | Flask docs dropped FastCGI deployment guidance years ago as WSGI servers (gunicorn/uWSGI) became the norm | The wrapper-script *pattern* is unchanged (it's an Apache/FastCGI-protocol concern, not a Flask concern) — the archived docs remain accurate, but this is a legacy deployment path Flask itself no longer documents or actively supports |
| Implicit-grant OAuth ("access_token in the redirect URI fragment") | Authorization Code (+ PKCE) — what D-01/D-02 already specify | OAuth 2.1 (draft) formally deprecates the implicit grant industry-wide, ~2020 onward | Not directly relevant — this phase was already scoped to Authorization Code + PKCE, avoiding the deprecated pattern entirely |

**Deprecated/outdated:**
- Flask's bundled FastCGI deployment docs (see above) — informational only; the mechanism itself still works and is what `mod_fcgid` requires.
- OAuth2 implicit grant — not used here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `flup6` is the correct/best current package name for a Python-3-compatible `flup.server.fcgi.WSGIServer` | Standard Stack, Pattern 1 (deployment) | If wrong, the `.fcgi` wrapper fails to import at deploy time — caught immediately by manual smoke-test, low real-world risk, but the package name itself was WebSearch-sourced before PyPI/slopcheck confirmation |
| A2 | `flask-cors` (`corydolphin/flask-cors`) is the correct current package for Flask CORS handling | Standard Stack, Don't Hand-Roll | Low risk — extremely well-known, widely-used package; confirmed on PyPI + slopcheck this session |
| A3 | iNat OAuth apps cannot request a true identity-only scope; `/users/api_token` requires default (write-capable) scope | Pitfall 1 | If wrong (i.e. a `scope` parameter does exist and works), the plan may over-broadly interpret WRITE-03's "minimal scope" requirement as unachievable when it's actually achievable — low functional risk either way since the app never calls write endpoints regardless, but worth confirming during first live implementation against a real registered iNat app |
| A4 | The official `inaturalistjs` client's raw (no-`Bearer`) JWT header usage for `/v1/*` calls reflects what the live API actually requires (vs. merely tolerates) | Pitfall 2 | If the API is actually permissive of both `Bearer <jwt>` and raw `<jwt>`, no risk. If it strictly requires raw-only, using `Bearer <jwt>` would cause silent 401s — recommend implementing exactly as the official client does (raw) and confirming with one live smoke-test call during implementation |
| A5 | `SameSite=Strict` cookies are sent on a `fetch()` request from `beeatlas.net` to `api.beeatlas.net` | Architecture Patterns, Pattern 3 | This is standard, spec-defined browser behavior (same-site = same eTLD+1), not project-specific — LOW risk, but flagging since it's the linchpin of the whole CSRF design and should be confirmed with one live manual browser test during implementation (not just unit tests, which can't exercise real browser cookie-attachment rules) |

## Open Questions (RESOLVED during planning 2026-07-03)

1. **(RESOLVED — plan 178-06)** **Does Phase 178 need a real (non-stub) authenticated POST endpoint to satisfy the WRITE-03 security UAT ("forged-author request AND cross-origin POST both rejected")?** → Yes; plan 178-06 adds a real `@require_author`-guarded `POST /api/write-check` (server-derived identity, ignores any client-supplied author) that Phase 179's note-create reuses — makes WRITE-03 exercisable without pulling note CRUD forward.
   - What we know: D-10 explicitly scopes 178's UI to "Sign-in + whoami only... No note CRUD UI" — note-creating POST endpoints are Phase 179.
   - What's unclear: the security UAT criteria (in `<security_focus>`) describe testing a forged-author POST and a cross-origin POST rejection, which implies *some* POST endpoint must exist to test against in 178.
   - Recommendation: the planner should add one small, real authenticated POST endpoint in 178 purely to prove the authz/CSRF pattern end-to-end (candidates: `POST /auth/logout`, or a trivial `POST /api/session/touch` no-op) — reusing the exact `@require_author`-style decorator that Phase 179's note-CRUD endpoints will need. This keeps the security UAT meaningful without pulling NOTES-01 scope forward.

2. **(RESOLVED — plans 178-04/178-09; live confirmation deferred to execution)** **Exact PKCE + confidential-client compatibility with iNat's live Doorkeeper config** — could not be fully confirmed without a registered app + test credentials. Resolved by implementing per D-01/D-02 (client_secret + PKCE) with a single-line plain-exchange fallback, and confirming live during the 178-09 security UAT (credentials now provisioned — see CONTEXT D-12).
   - What we know: Doorkeeper's `force_pkce` is documented as targeting non-confidential clients; OAuth 2.1 recommends PKCE for confidential clients too; nothing found suggests Doorkeeper actively *rejects* PKCE params from a confidential client.
   - What's unclear: iNat's specific Doorkeeper instance configuration (whether it has any custom validation beyond stock Doorkeeper behavior) wasn't independently inspectable from outside.
   - Recommendation: implement per D-01/D-02 (client_secret + PKCE), with the plain-exchange fallback (D-02) ready to switch to in a single-line change if live testing during implementation shows Doorkeeper 400s on the `code_challenge` param for a confidential client.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Apache `mod_fcgid` | WRITE-01 (hosting shape) | ✓ (per Phase 177 record — `httpd` present on this dev machine; maderas already runs Apache per 177 D-01) | Not independently version-checked (operator's maderas host, not this sandbox) | none — locked architectural decision, no fallback needed |
| Python 3.14 | All app code | ✓ | 3.14.6 (local), 3.14.3 confirmed on maderas (177-07-SUMMARY.md) | none |
| `flup6` | `.fcgi` wrapper | ✓ (verified installable + importable this session) | 1.1.1 | `fcgisgi` (0.2.2, newer/riskier) or a minimal hand-rolled FastCGI responder (NOT recommended — see Don't Hand-Roll) |
| Live iNaturalist OAuth endpoints | WRITE-02 | ✓ (all four endpoints — `/oauth/authorize`, `/oauth/token`, `/users/api_token`, `/v1/users/me` — returned expected live HTTP responses this session) | N/A (hosted service) | none |
| Registered iNat OAuth application (client_id/secret) | WRITE-02 | ✗ — not created during this research session | — | **Blocking for implementation, not for planning.** The plan must include an early task/checkpoint: register an app at `https://www.inaturalist.org/oauth/applications/new` with `redirect_uri=https://api.beeatlas.net/auth/callback` exactly pinned, before OAuth code can be end-to-end tested. Likely gated behind account-age/activity requirements per community reports (2+ months old account, recent observation activity) — the maintainer's existing iNat account should already qualify, but confirm early. |
| certbot / Let's Encrypt on maderas | `api.beeatlas.net` TLS | Not checked (operator's maderas host) | — | Per 177-07-SUMMARY.md follow-ups, this is planned but not yet done — operator task, `autonomous: false` |

**Missing dependencies with no fallback:**
- Registered iNat OAuth application credentials — must be created (5-minute operator task, but blocks any live OAuth testing) before implementation can be verified end-to-end. Not a research blocker (all endpoint/protocol behavior was independently verified without needing app-specific credentials).

**Missing dependencies with fallback:**
- `flup6`'s age → `fcgisgi` exists as a newer alternative if needed later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 (`data/pyproject.toml` dev group), already configured with `testpaths = ["tests"]`, `addopts = "-m 'not integration'"` |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_notes_app.py tests/test_notes_oauth.py tests/test_notes_session.py tests/test_notes_authz.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-01 | Flask app serves under Apache mod_fcgid shape; read path unaffected | unit (WSGI-level; `.fcgi`/vhost mechanics are NOT unit-testable, require operator smoke-test) | `cd data && uv run pytest tests/test_notes_app.py -x` | ✅ Wave 0 (existing skeleton tests) |
| WRITE-02 | OAuth code exchange with PKCE; identity server-derived; own session minted; no secret in client bundle; no token in localStorage/URL | unit (mock `requests` at "Pattern D" boundary, per `test_ecdysis_auth.py`) | `cd data && uv run pytest tests/test_notes_oauth.py tests/test_notes_session.py -x` | ❌ Wave 0 — new files |
| WRITE-02 | No secret in client bundle | static/manual | `grep -r "client_secret" src/ dist/ \|\| echo CLEAN` (must find nothing) | ❌ Wave 0 — add as a CI-able grep check or manual UAT step |
| WRITE-03 | Only allowlisted authors authorized; CSRF/origin protection; forged-author + cross-origin POST rejected | unit + manual browser UAT | `cd data && uv run pytest tests/test_notes_authz.py -x` (unit: allowlist recheck, Origin-header rejection); manual: real cross-origin `fetch()` from a browser console against a running dev instance | ❌ Wave 0 — new file; manual UAT step for the real-browser SameSite/CORS behavior (Pitfall 4/A5 — cannot be fully proven by pytest alone) |
| WRITE-04 | Public writes gated on demonstrated restore | manual-only, already satisfied | N/A — Phase 177's 177-07 restore drill (`docs/runbooks/notes-store-dr.md` Drill Log) already PASSED 2026-07-03; this phase's task is to *encode* the gate (e.g. a checklist item or a boolean config check), not re-demonstrate the restore | ✅ (evidence exists; encoding mechanism is a planning decision — see CONTEXT.md discretion note) |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_notes_*.py -x`
- **Per wave merge:** `cd data && uv run pytest` (full suite; per project convention `feedback_run_tests_before_push` — also run `npm test` if any frontend files changed for the sign-in UI)
- **Phase gate:** Full suite green + the manual browser CSRF/CORS UAT (Pitfall 4) completed before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_notes_oauth.py` — covers WRITE-02 (code exchange, PKCE param construction, `state` verification, identity fetch, token discard)
- [ ] `data/tests/test_notes_session.py` — covers WRITE-02 (cookie mint/verify round-trip, tamper rejection, expiry rejection — directly exercising the `itsdangerous` patterns verified in this research)
- [ ] `data/tests/test_notes_authz.py` — covers WRITE-03 (allowlist recheck per-request, forged-author-field rejection, Origin-header allow-list rejection)
- [ ] A manual/operator UAT step for the real-browser cross-origin CSRF behavior (Pitfall 4) — pytest's `test_client()` does not enforce real browser SameSite/CORS semantics, so this genuinely needs a live browser test, not just unit coverage
- [ ] Framework install: none — pytest already configured; `uv add flup6 flask-cors` is the only new dependency install needed

*(Wave 0 gaps are all new test files for new WRITE-02/WRITE-03 behavior; WRITE-01's WSGI-level behavior is already covered by the existing `test_notes_app.py` skeleton tests, which should be extended, not replaced, per the file's own "SCOPE GUARD" test that currently asserts no write verbs exist — that assertion will need to change once real routes are added, which is itself a useful signal that the scope boundary moved intentionally.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Delegated to iNaturalist OAuth2 (Doorkeeper) — this app never handles passwords; server-side code exchange with PKCE (D-01/D-02) |
| V3 Session Management | yes | `itsdangerous.URLSafeTimedSerializer` signed cookie; `HttpOnly`+`Secure`+`SameSite=Strict`; expiry via `max_age`; revocation via per-request allowlist recheck (D-05) in lieu of server-side session invalidation (accepted, matches ASVS's "compensating control" allowance for stateless session designs given the documented low threat model) |
| V4 Access Control | yes | Role derived server-side from a committed, git-audited allowlist (`roles_allowlist.toml`), re-checked every write request; never derived from client-supplied data |
| V5 Input Validation | yes (future, Phase 179) | Note body sanitization is out of scope for 178 (no note CRUD yet) — flag for Phase 179's research to cover a markdown/HTML sanitizer (e.g. `bleach` or `nh3`) rather than hand-rolled regex stripping |
| V6 Cryptography | yes | `itsdangerous` (HMAC-based signing, single fixed scheme — see Alternatives Considered for why this beats hand-rolled or JWT-with-algorithm-negotiation); PKCE `code_verifier` via `secrets.token_urlsafe` (CSPRNG, not `random`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| CSRF on the write endpoint (forged cross-site POST using an ambient cookie) | Spoofing / Tampering | `SameSite=Strict` cookie + server-side Origin allow-list check (Pattern 3) |
| CSRF on the OAuth callback (session-fixation-style identity-linking attack) | Spoofing | `state` parameter, generated per login attempt, verified exact-match on callback (RFC 6749 §10.12) |
| Open redirect via an attacker-controlled `redirect_uri` | Tampering / Spoofing | Exact-pinned `redirect_uri` (D-02) — iNat's Doorkeeper rejects any `redirect_uri` not byte-identical to the one registered for the app |
| Traceback/stack-trace information disclosure on unhandled exceptions | Information Disclosure | Explicit `debug=False` on both `flup6`'s `WSGIServer` AND Flask's own `app.debug` (Pitfall 3) — two independent flags, both must be off |
| Session cookie theft via XSS | Information Disclosure / Elevation of Privilege | `HttpOnly` flag (already part of D-04) prevents JS read access even if an XSS exists elsewhere on the same host; host-only cookie scoping (not `Domain=.beeatlas.net`) limits which surface could even attempt exfiltration |
| Algorithm-confusion / `alg:none` attack on the session token | Tampering / Elevation of Privilege | Avoided structurally by using `itsdangerous` (single fixed HMAC scheme, no algorithm field to manipulate) instead of JWT (see Alternatives Considered) |
| CORS misconfiguration allowing an arbitrary origin to read authenticated responses | Information Disclosure | Explicit origin allow-list in `flask-cors`, never a wildcard combined with credentials (Pattern 3) |

## Sources

### Primary (HIGH confidence — live-verified this session)
- `https://www.inaturalist.org/oauth/authorize`, `/oauth/token`, `/users/api_token` — live `curl` requests this session confirmed endpoint existence and standard Doorkeeper error-response shapes (302 redirect, `invalid_client` JSON error, sign-in redirect respectively)
- `https://api.inaturalist.org/v1/users/me` — live `curl` confirmed `{"error":"Unauthorized","status":401}` without credentials
- `https://api.inaturalist.org/v1/swagger.json` — official, live-fetched OpenAPI 2.0 spec; confirmed `/users/me` `security: [{api_token: []}]` and the JWT-24h-expiry description text verbatim
- `https://raw.githubusercontent.com/inaturalist/inaturalistjs/main/README.md` and `lib/inaturalist_api.js` — official npm-published client, live-fetched; confirmed exact `Authorization` header usage at both call sites (this is the official *client* repo, distinct from the `~/dev/inaturalist/` server checkout the user directed not to read)
- `flup6` 1.1.1, `itsdangerous` 2.2.0 — directly installed and exercised in a scratch venv against Python 3.14.6 this session (import success, API signature inspection, functional round-trip for `itsdangerous`)
- `flup/server/fcgi_base.py` — installed package source read directly this session (the `debug=True` default and `cgitb` traceback-leak behavior)
- `data/notes_store/*`, `data/notes_app/main.py`, `docs/runbooks/notes-store-dr.md`, `.planning/phases/177-.../177-07-SUMMARY.md` — this repo, current state, including the real maderas deployment path (`~/beeatlas-store/notes.db`) and DNS target (`45.79.96.48`)

### Secondary (MEDIUM confidence)
- `https://gist.github.com/kueda/0ad3c5b78c822bd059f095152165a9e0` — iNat staff-authored (kueda is an iNat co-founder) PKCE flow reference, confirms exact `/oauth/authorize` and `/oauth/token` parameter names
- `doorkeeper-gem/doorkeeper` GitHub issues/wiki (via WebSearch) — `force_pkce` semantics for confidential vs. non-confidential clients
- `forum.inaturalist.org` threads on API authentication, JWT header format, and OAuth scope limitations — community-authored, not iNat-staff-confirmed, but internally consistent across multiple independent threads

### Tertiary (LOW confidence)
- The claim that `/users/api_token` requires default/write scope and rejects a `login`-only scope request (Pitfall 1) — single uncorroborated forum report, flagged in the Assumptions Log (A3) for live confirmation during implementation
- `https://www.inaturalist.org/pages/api+reference` and `.../pages/api+recommended+practices` — the phase's own canonical references — could **not** be directly fetched this session (both return HTTP 403 to automated tools, including `curl` with a browser user-agent, `WebFetch` directly, and via a text-extraction proxy — appears to be active bot/Cloudflare protection on that specific page, not a content issue). WebSearch snippets of this page's content were used and cross-verified against the primary sources above wherever possible; treat any claim sourced *only* from a WebSearch snippet of this specific URL as MEDIUM, not HIGH, confidence.

## Metadata

**Confidence breakdown:**
- Standard stack (itsdangerous/flup6/flask-cors/requests): HIGH — all directly installed and exercised, or already present in the codebase
- OAuth mechanics (endpoints, PKCE, header formats): HIGH for endpoint existence and the `inaturalistjs`-confirmed header formats; MEDIUM for the scope-limitation claim (Pitfall 1/A3) pending live confirmation with real app credentials
- mod_fcgid/.fcgi deployment: HIGH — functionally verified against the exact project Python version; DNS/vhost/certbot specifics are operator-domain knowledge already recorded in this repo's Phase 177 artifacts
- CSRF/CORS architecture: HIGH — grounded in spec-level browser security semantics (Fetch/CORS, SameSite) plus the concrete, already-decided production domain topology
- Security domain: HIGH — standard ASVS controls mapped to concrete, already-verified library choices

**Research date:** 2026-07-03
**Valid until:** ~30 days for the mod_fcgid/library findings (stable ecosystem); iNat OAuth endpoint behavior should be re-verified live at implementation time regardless of date, since app-credential-specific behavior (Pitfall 1, A3/A4) could not be fully confirmed without a registered application in this research session
