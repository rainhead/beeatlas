"""BeeAtlas auth + write API — Flask (WSGI) app (D-15).

This is BeeAtlas's app-level auth + write service, relocated from the
Phase-177 `data/notes_app/main.py` skeleton per D-15. On maderas the app is
served by Waitress (a persistent, pure-Python WSGI server, D-17) behind
Apache `mod_proxy_http` at `api.beeatlas.net` (Waitress serve entrypoint in
`api/serve.py`).

This plan (178-06) wires the full auth/write HTTP surface, composing the
already-tested `api/oauth.py`, `api/session.py`, `api/auth.py`, and
`api/users.py` modules:

  - `GET /auth/login`    — start the PKCE authorization-code flow.
  - `GET /auth/callback` — verify `state`, exchange the code server-side,
                            mint the session cookie, redirect back to
                            beeatlas.net.
  - `GET /auth/whoami`   — anonymous-friendly session introspection.
  - `POST /auth/logout`  — Origin-checked; clears the session cookie.
  - `POST /api/write-check` — a real `@require_author` no-op (the WRITE-03
                            authz/CSRF test target Phase 179's note CRUD
                            reuses).

Also applies `ProxyFix` (D-17, trusts exactly one Apache reverse-proxy hop),
`flask-cors` (scoped to beeatlas.net, credentials enabled, never
wildcard+credentials), and a generic error handler so no unhandled
exception ever leaks a traceback (Pitfall 3 restated for Waitress —
Waitress itself renders no cgitb page, but `app.debug=False` + this handler
are belt-and-suspenders).

Do NOT inline note CRUD here — that is Phase 179.
"""

import secrets as _secrets
import tomllib
from urllib.parse import urlsplit

from flask import Flask, abort, g, jsonify, redirect, request
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

import api.auth as auth
import api.config as config
import api.oauth as oauth
import api.session as session
import api.users as users
from notes_store import roles as roles_module
from notes_store.db import make_engine

app = Flask(__name__)

# D-17: trust exactly ONE reverse-proxy hop (Apache mod_proxy_http) so the
# app reads the real client IP + https scheme from X-Forwarded-*. Never
# trust more hops than the actual proxy chain (T-178-25) — a forged
# X-Forwarded-* header from the internet must not be trusted, which is why
# this is 1, not some larger/unbounded number.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# D-11/Pattern 3: explicit origin allow-list + credentials; NEVER wildcard
# combined with credentials (browsers reject that combination, and it would
# defeat the whole point of an allow-list) — T-178-16.
# DEV_MODE additionally admits loopback dev-server origins (regex — flask-cors
# treats patterned strings as regexes); can only be on with a localhost
# redirect_uri in the gitignored secrets.toml (see api/config.py).
_cors_origins: list[str] = list(auth.ALLOWED_ORIGINS)
if config.DEV_MODE:
    _cors_origins += [r"http://localhost:\d+", r"http://127\.0\.0\.1:\d+"]
CORS(app, resources={r"/*": {"origins": _cors_origins}}, supports_credentials=True)

# Cookies carry Secure in production; in DEV_MODE (plain-http loopback) the
# flag is dropped so Safari — which, unlike Chrome/Firefox, refuses Secure
# cookies over http://localhost — works locally too.
_COOKIE_SECURE = not config.DEV_MODE

app.config["DEBUG"] = False
app.debug = False


@app.errorhandler(Exception)
def _handle_unexpected_error(err: Exception):
    """T-178-15: never leak a traceback, whatever kind of failure occurs.

    `abort(4xx/5xx)`-raised HTTPExceptions already carry no traceback and
    their own correct status code — pass them through unchanged. Any other
    unhandled exception becomes a generic 500 with no exception detail in
    the response body (the real exception is still logged server-side).
    """
    if isinstance(err, HTTPException):
        return err
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "internal error"}), 500


# Module-level engine composing api/users.py's upsert_user (per the plan's
# action). Lazily opened on first query, never at import time
# (notes_store.db.make_engine's docstring) — importing this module is always
# safe even before the operator DB path exists. Tests monkeypatch this
# attribute with a tmp-path engine.
_ENGINE = make_engine()


# ---------------------------------------------------------------------------
# OAuth flow cookie — a SEPARATE, short-lived signed cookie (distinct
# name/salt from the long-lived session cookie in api/session.py) carrying
# the in-flight {state, verifier, return_to} for the /auth/login ->
# /auth/callback round trip (RFC 6749 §10.12 `state` CSRF protection,
# T-178-17).
# ---------------------------------------------------------------------------

FLOW_COOKIE_NAME = "beeatlas_oauth_flow"
FLOW_COOKIE_MAX_AGE = 600  # 10 minutes -- generous for a login round trip
_FLOW_SALT = "beeatlas-oauth-flow"

DEFAULT_RETURN_TO = "https://beeatlas.net"


def _flow_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(config.SESSION_SIGNING_KEY, salt=_FLOW_SALT)


def _return_to_allowed(url: str) -> bool:
    """T-178-18: only allow a post-login redirect back to an allowed origin."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    if not parts.scheme or not parts.netloc:
        return False
    return auth.origin_allowed(f"{parts.scheme}://{parts.netloc}")


def _fresh_role(login: str) -> str | None:
    """Re-read the committed allowlist fresh (D-05) rather than the
    import-time-cached `notes_store.roles.ROLES` snapshot, so whoami/login
    reflect the current allowlist without requiring an app restart."""
    with roles_module._ALLOWLIST.open("rb") as fh:
        cfg = tomllib.load(fh)
    return cfg.get("roles", {}).get(login)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict:
    """Return service health status. Unauthenticated; no DB access.

    Returning a dict makes Flask emit a JSON response at request time; the
    unit tests call this directly and assert the dict.
    """
    return {"status": "ok"}


@app.get("/auth/login")
def auth_login():
    """Start the PKCE authorization-code flow (D-01/D-02).

    Mints a fresh `state` + PKCE pair, stashes {state, verifier, return_to}
    in the short-lived signed flow cookie, and 302s to iNat's authorize URL.
    """
    config.require_real_secrets()

    return_to = request.args.get("return_to", DEFAULT_RETURN_TO)
    if not _return_to_allowed(return_to):
        return_to = DEFAULT_RETURN_TO

    state = _secrets.token_urlsafe(32)
    verifier, challenge = oauth.make_pkce_pair()
    flow_token = _flow_serializer().dumps(
        {"state": state, "verifier": verifier, "return_to": return_to}
    )

    resp = redirect(
        oauth.authorize_url(
            client_id=config.INAT_CLIENT_ID,
            redirect_uri=config.REDIRECT_URI,
            state=state,
            code_challenge=challenge,
        )
    )
    # SameSite=Lax — NOT Strict — is load-bearing here: /auth/callback arrives
    # as a top-level navigation FROM inaturalist.org (cross-site), and browsers
    # do not attach Strict cookies to cross-site navigations, which 400s every
    # real login (found live during the 178-08 go-live). Lax cookies ARE sent
    # on top-level GET navigations — exactly the legitimate callback shape.
    # CSRF on this hop is carried by the signed `state` + PKCE verifier
    # (RFC 6749 §10.12), not by SameSite; the long-lived session cookie
    # (api/session.py) stays Strict because beeatlas.net → api.beeatlas.net
    # is same-site.
    resp.set_cookie(
        FLOW_COOKIE_NAME,
        flow_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="Lax",
        max_age=FLOW_COOKIE_MAX_AGE,
    )
    return resp


@app.get("/auth/callback")
def auth_callback():
    """Verify `state`, exchange the code server-side, mint the session cookie.

    `state` verification happens BEFORE `require_real_secrets()` — it needs
    no secret at all, so a placeholder-secrets deployment still gets a
    correct 400 on a state mismatch rather than an opaque 500.
    """
    flow_token = request.cookies.get(FLOW_COOKIE_NAME)
    if not flow_token:
        abort(400)
    try:
        flow = _flow_serializer().loads(flow_token, max_age=FLOW_COOKIE_MAX_AGE)
    except BadSignature:
        abort(400)

    if request.args.get("state") != flow["state"]:
        abort(400)

    code = request.args.get("code")
    if not code:
        abort(400)

    # Only needed from here on (exchange_code needs the real client_secret;
    # mint_cookie needs the real signing key) — fails loudly, never at import.
    config.require_real_secrets()

    access_token = oauth.exchange_code(
        client_id=config.INAT_CLIENT_ID,
        client_secret=config.INAT_CLIENT_SECRET,
        code=code,
        redirect_uri=config.REDIRECT_URI,
        verifier=flow["verifier"],
    )
    identity = oauth.fetch_identity(access_token)
    access_token = None  # D-03: discard -- never returned, logged, or persisted

    login = identity["login"]
    inat_user_id = identity["id"]
    internal_id = users.upsert_user(_ENGINE, login, inat_user_id)
    role = _fresh_role(login)

    session_token = session.mint_cookie(
        session.make_serializer(config.SESSION_SIGNING_KEY),
        internal_id=internal_id,
        inat_login=login,
        role=role,
    )

    resp = redirect(flow["return_to"])
    resp.set_cookie(
        session.COOKIE_NAME,
        session_token,
        **{**session.COOKIE_KWARGS, "secure": _COOKIE_SECURE},
    )
    resp.delete_cookie(FLOW_COOKIE_NAME)
    return resp


@app.get("/auth/whoami")
def whoami():
    """Anonymous-friendly session introspection; CORS-enabled."""
    token = request.cookies.get(session.COOKIE_NAME)
    payload = None
    if token:
        payload = session.verify_cookie(
            session.make_serializer(config.SESSION_SIGNING_KEY), token, session.COOKIE_MAX_AGE
        )

    if payload is None:
        return jsonify({"authenticated": False})

    login = payload["login"]
    role = _fresh_role(login)
    return jsonify(
        {
            "authenticated": True,
            "login": login,
            "role": role,
            "is_author": role in ("author", "curator"),
        }
    )


@app.post("/auth/logout")
def logout():
    """Origin-checked; clears the session cookie (empty value, immediate expiry)."""
    if not auth.origin_allowed(request.headers.get("Origin")):
        abort(403)
    resp = jsonify({"logged_out": True})
    resp.delete_cookie(session.COOKIE_NAME)
    return resp


@app.post("/api/write-check")
@auth.require_author
def write_check():
    """WRITE-03 test target: a real `@require_author`-guarded no-op.

    Returns the server-derived identity only — any client-supplied author
    field in the request body is never consulted (D-07); `require_author`
    (api/auth.py) has already verified the session, re-read the allowlist
    fresh, checked Origin, and checked the WRITE-04 launch gate.
    """
    identity = g.identity
    return jsonify({"uid": identity["uid"], "login": identity["login"], "role": identity["role"]})
