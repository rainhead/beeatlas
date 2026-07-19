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

import datetime
import os
import secrets as _secrets
import subprocess
import tomllib
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, abort, g, jsonify, redirect, request
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import Session
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

import api.auth as auth
import api.config as config
import api.oauth as oauth
import api.session as session
import api.users as users
from notes_store import roles as roles_module
from notes_store.db import make_engine
from notes_store.models import Note, NoteRevision, User
from notes_store.render import render_note_markdown

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
# The `$` end-anchors are load-bearing (WR-04): flask-cors matches origin
# patterns with re.match, which anchors only at the START — without `$`,
# `http://localhost:\d+` also grants credentialed CORS to lookalikes such
# as http://localhost:1234.evil.com.
_DEV_CORS_ORIGIN_PATTERNS = [r"http://localhost:\d+$", r"http://127\.0\.0\.1:\d+$"]
_cors_origins: list[str] = list(auth.ALLOWED_ORIGINS)
if config.DEV_MODE:
    _cors_origins += _DEV_CORS_ORIGIN_PATTERNS
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
        icon_url=identity.get("icon_url"),
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
            "icon_url": payload.get("icon_url"),
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

    The echoed role is re-read fresh from the allowlist (same D-05 read
    `require_author` and whoami perform), NOT the role baked into the
    session cookie at login time — a user promoted/demoted since their
    last login must be reported with their current role, or Phase 179
    curator-only actions keyed off this field would go stale.
    """
    identity = g.identity
    role = _fresh_role(identity["login"])
    return jsonify({"uid": identity["uid"], "login": identity["login"], "role": role})


# ---------------------------------------------------------------------------
# Note CRUD routes (179-02; NOTES-01, NOTES-02 — the NOTES-04 live read died with st-vjd)
#
# author_id is ALWAYS g.identity["uid"] (the server-derived session identity)
# -- a client-supplied author_id/author field in the request body is never
# consulted (D-08, T-179-AUTHZ). Ownership on PATCH/DELETE is a plain
# `note.author_id != g.identity["uid"]` comparison -- the one genuinely new
# authz check this phase adds on top of the already-hardened
# `require_author` (session verify + fresh allowlist recheck + Origin check
# + WRITE-04 launch gate).
# ---------------------------------------------------------------------------

# D-03/Pitfall (markdown-based DoS defense-in-depth): a generous but bounded
# cap on note length; not a locked requirement, planner's discretion.
_NOTE_BODY_MAX_LENGTH = 5000

# ---------------------------------------------------------------------------
# st-nee: synchronous burned-in publish (stelis ADR 0007). After a write
# route commits, it calls _publish_notes(); the response's "publish" field
# distinguishes "live" (the note is baked into the served pages) from
# "pending" (saved, not yet baked — the nightly repairs). Slow POSTs are
# accepted with eyes open (ADR: the old "never couple write latency to the
# build" constraint was revoked).
# ---------------------------------------------------------------------------

_PUBLISH_SCRIPT = Path(__file__).resolve().parent.parent / "data" / "publish-notes.sh"
# Bounded so a wedged build can't hold a request forever; generous because a
# legitimate publish takes ~30s+ (scoped stelis + full 11ty render + rsync,
# behind up to PUBLISH_LOCK_WAIT of flock wait).
_PUBLISH_TIMEOUT = int(os.environ.get("NOTE_PUBLISH_TIMEOUT", "300"))
_PUBLISH_LOCK_BUSY = 75  # EX_TEMPFAIL from publish-notes.sh: the nightly holds the flock


def _publish_notes(canonical_name: str) -> str:
    """Republish the site after a committed note write; never raises.

    Returns "live" or "pending". Commit-first (ADR 0007): the caller has
    already committed, and nothing here may unwind that — every failure
    path degrades to "pending" with a loud log, never an exception. The
    changed canonical_name is for the log only; stelis derives the keys to
    re-harvest from the notes-store digest itself (st-2k9/st-pd1).
    """
    if not config.NOTE_PUBLISH_ENABLED:
        return "pending"
    try:
        proc = subprocess.run(
            ["bash", str(_PUBLISH_SCRIPT)],
            capture_output=True,
            text=True,
            timeout=_PUBLISH_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        app.logger.error(
            "note publish TIMED OUT after %ss (%s) — publish pending, nightly repairs",
            _PUBLISH_TIMEOUT,
            canonical_name,
        )
        return "pending"
    except OSError:
        app.logger.exception("note publish failed to launch (%s)", canonical_name)
        return "pending"
    if proc.returncode == 0:
        app.logger.info("note publish live (%s)", canonical_name)
        return "live"
    if proc.returncode == _PUBLISH_LOCK_BUSY:
        app.logger.warning(
            "note publish deferred (%s): publish lock busy — the holder bakes the committed note",
            canonical_name,
        )
    else:
        app.logger.error(
            "note publish FAILED rc=%s (%s) — publish pending, nightly repairs\n"
            "stdout tail: %s\nstderr tail: %s",
            proc.returncode,
            canonical_name,
            proc.stdout[-2000:],
            proc.stderr[-2000:],
        )
    return "pending"


@app.post("/api/notes")
@auth.require_author
def create_note():
    """POST /api/notes: an allowlisted author creates a note (NOTES-01).

    Stores both the raw markdown (`body`, for future editing) and the
    server-rendered+sanitized HTML (`body_html`, D-04/D-06) -- rendered
    exactly once, here, via the shared `render_note_markdown`. Appends a
    `note_revisions` row (`action='create'`, D-07's audit ledger).
    """
    identity = g.identity
    payload = request.get_json(silent=True) or {}
    canonical_name = (payload.get("canonical_name") or "").strip()
    body_md = (payload.get("body_md") or "").strip()

    if not canonical_name or not body_md:
        abort(400)
    if len(body_md) > _NOTE_BODY_MAX_LENGTH:
        abort(400)

    body_html = render_note_markdown(body_md)
    now = datetime.datetime.now(datetime.UTC)

    with Session(_ENGINE) as db_session:
        note = Note(
            canonical_name=canonical_name,
            author_id=identity["uid"],
            body=body_md,
            body_html=body_html,
            status="approved",
            created_at=now,
            updated_at=now,
        )
        db_session.add(note)
        db_session.flush()  # assigns note.id for the revision FK below
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=body_md,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="create",
            )
        )
        db_session.commit()
        note_id = note.id

    # st-nee: publish AFTER the session block — the commit is durable and no
    # DB handle is held open across the ~30s build.
    publish = _publish_notes(canonical_name)
    return jsonify({"id": note_id, "publish": publish}), 201


@app.patch("/api/notes/<int:note_id>")
@auth.require_author
def edit_note(note_id):
    """PATCH /api/notes/<id>: the note's owner edits it (NOTES-02).

    Ownership (D-08 -- an author acts only on their own notes; curator
    override is Phase 180) is a server-derived `note.author_id ==
    g.identity["uid"]` comparison; abort(404) if the note doesn't exist at
    all, abort(403) if it exists but belongs to someone else -- the load
    happens BEFORE the ownership check so a guessed/enumerated id belonging
    to another author never mutates (T-179-IDOR).
    """
    identity = g.identity
    payload = request.get_json(silent=True) or {}
    body_md = (payload.get("body_md") or "").strip()

    if not body_md:
        abort(400)
    if len(body_md) > _NOTE_BODY_MAX_LENGTH:
        abort(400)

    now = datetime.datetime.now(datetime.UTC)
    with Session(_ENGINE) as db_session:
        note = db_session.get(Note, note_id)
        if note is None:
            abort(404)
        if note.author_id != identity["uid"]:
            abort(403)

        note.body = body_md
        note.body_html = render_note_markdown(body_md)
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=body_md,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="edit",
            )
        )
        db_session.commit()
        note_id = note.id
        canonical_name = note.canonical_name

    publish = _publish_notes(canonical_name)
    return jsonify({"id": note_id, "publish": publish}), 200


@app.delete("/api/notes/<int:note_id>")
@auth.require_author
def delete_note(note_id):
    """DELETE /api/notes/<id>: the note's owner soft-deletes it (NOTES-02).

    Soft-delete (D-07): sets `status='removed'` and appends a
    `note_revisions` row (`action='remove'`) -- the note row and its full
    history survive. Harvest/read scoping (D-10) excludes non-'approved'
    notes, so a removed note simply disappears from every read surface
    without destroying the audit trail. Same ownership-then-load-first
    shape as edit_note (T-179-IDOR).
    """
    identity = g.identity
    now = datetime.datetime.now(datetime.UTC)
    with Session(_ENGINE) as db_session:
        note = db_session.get(Note, note_id)
        if note is None:
            abort(404)
        if note.author_id != identity["uid"]:
            abort(403)

        note.status = "removed"
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="remove",
            )
        )
        db_session.commit()
        note_id = note.id
        canonical_name = note.canonical_name

    # st-nee: a delete must also republish — the note has to LEAVE the baked
    # pages, not just the live endpoint.
    publish = _publish_notes(canonical_name)
    return jsonify({"id": note_id, "publish": publish}), 200


@app.post("/api/notes/<int:note_id>/takedown")
@auth.require_author
def takedown_note(note_id):
    """POST /api/notes/<id>/takedown: a curator hides ANY note (MOD-02/D-04).

    Distinct from the owner-only `edit_note`/`delete_note` routes above --
    those stay untouched. `@auth.require_author` already verifies the
    session, re-reads the allowlist fresh, checks Origin, and checks the
    WRITE-04 launch gate; this view additionally requires the fresh-reread
    `_is_curator_fresh` curator role (D-05 revocation -- a demoted curator
    loses this power on the very next request).

    The curator check runs BEFORE the note load: "are you a curator at
    all" is an identity-level gate that leaks nothing note-specific (unlike
    an ownership check, whose very existence as a check depends on which
    note is targeted) -- see 180-RESEARCH.md Pattern 2 / Open Question #1.
    A missing note id still correctly 404s for a real curator.

    Sets `status='hidden'` (D-06 -- distinct from author-delete 'removed'
    so the two moderation paths stay auditable-distinguishable) and appends
    a `note_revisions` row with `action='takedown'` and `editor_id` = the
    CURATOR's uid (D-08 -- the ledger must show a curator acted, not the
    author). Attribution lives ONLY in this ledger row -- no
    `moderated_by`/`moderated_at` column is added to `notes` (D-10).
    `hidden` is a new non-'approved' value, so `list_notes_for_species`
    below and the nightly harvest already exclude it with zero new code
    (MOD-04, by construction).
    """
    identity = g.identity
    if not auth._is_curator_fresh(identity["login"]):
        abort(403)

    payload = request.get_json(silent=True) or {}
    raw_reason = payload.get("reason")
    if raw_reason is not None and not isinstance(raw_reason, str):
        abort(400)
    reason = (raw_reason or "").strip() or None
    if reason is not None and len(reason) > _NOTE_BODY_MAX_LENGTH:
        abort(400)

    now = datetime.datetime.now(datetime.UTC)
    with Session(_ENGINE) as db_session:
        note = db_session.get(Note, note_id)
        if note is None:
            abort(404)

        # Guard the current status: takedown acts only on a live (public)
        # note. 'approved' is the sole publicly-visible state, so a 'hidden'
        # (already taken down), 'removed' (author-deleted -- D-06), or
        # 'pending' note is not a valid takedown target. 409 rather than a
        # silent reclassification that would collapse the author-delete vs
        # curator-takedown distinction D-06 preserves.
        if note.status != "approved":
            abort(409)

        note.status = "hidden"
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="takedown",
                reason=reason,
            )
        )
        db_session.commit()
        note_id = note.id
        canonical_name = note.canonical_name

    # st-nee: a takedown must republish so the hidden note leaves the baked
    # pages immediately, not at the next nightly.
    publish = _publish_notes(canonical_name)
    return jsonify({"id": note_id, "publish": publish}), 200


@app.post("/api/notes/<int:note_id>/restore")
@auth.require_author
def restore_note(note_id):
    """POST /api/notes/<id>/restore: a curator un-hides a note (MOD-02/D-07).

    Curl-only -- deliberately NOT wired to any UI (D-07): the read endpoint
    below must never return non-approved content, so there is no inline
    surface from which a curator could discover a hidden note to restore
    it. Structurally identical to `takedown_note` above (same
    require_author + pre-load `_is_curator_fresh` gate, same
    NoteRevision-append shape) but flips `status` back to 'approved' and
    records `action='restore'`.
    """
    identity = g.identity
    if not auth._is_curator_fresh(identity["login"]):
        abort(403)

    payload = request.get_json(silent=True) or {}
    raw_reason = payload.get("reason")
    if raw_reason is not None and not isinstance(raw_reason, str):
        abort(400)
    reason = (raw_reason or "").strip() or None
    if reason is not None and len(reason) > _NOTE_BODY_MAX_LENGTH:
        abort(400)

    now = datetime.datetime.now(datetime.UTC)
    with Session(_ENGINE) as db_session:
        note = db_session.get(Note, note_id)
        if note is None:
            abort(404)

        # Guard the current status: restore only ever reverses a curator
        # takedown ('hidden' -> 'approved'). It must NOT resurrect an
        # author-deleted note ('removed' -- D-06), which would republish
        # content the author intentionally removed. 409 on any non-'hidden'
        # note.
        if note.status != "hidden":
            abort(409)

        note.status = "approved"
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="restore",
                reason=reason,
            )
        )
        db_session.commit()
        note_id = note.id
        canonical_name = note.canonical_name

    publish = _publish_notes(canonical_name)
    return jsonify({"id": note_id, "publish": publish}), 200


# The public live-read route (GET /api/notes?species=) died with st-vjd:
# the baked page is the only read path (reload-sees-it, stelis ADR 0007).
