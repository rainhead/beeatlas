"""BeeAtlas app session cookie: itsdangerous signed cookie mint/verify (D-04).

One long-lived, stateless signed cookie replaces a server-side session store
(originally motivated by mod_fcgid's ephemeral workers; still the right call
under Waitress — no per-process session affinity, trivially restartable, see
D-17). Revocation is handled by re-reading the committed allowlist on every
write request (D-05, see api/auth.py), NOT by cookie age or a server-side
session table.

Uses `itsdangerous.URLSafeTimedSerializer`, never PyJWT — a single fixed HMAC
scheme with no algorithm-negotiation surface, so there is no `alg:none` /
algorithm-confusion attack class to defend against (T-178-10).

The signing key is always passed in by the caller (never read from
api.config here) so tests can inject a throwaway key without touching real
secrets.
"""

from itsdangerous import BadSignature, URLSafeTimedSerializer

# Domain-separates this serializer from any other future itsdangerous use.
_SESSION_SALT = "beeatlas-notes-session"

# Purpose-built cookie name — never Flask's default 'session' (avoids
# colliding with, or being confused for, Flask's own unrelated session
# mechanism; see RESEARCH.md Anti-Patterns).
COOKIE_NAME = "beeatlas_session"

# D-04: long-lived — weeks, not a short session. 30 days.
COOKIE_MAX_AGE = 60 * 60 * 24 * 30

# Cookie flags for Set-Cookie (Flask's response.set_cookie(**COOKIE_KWARGS)):
# HttpOnly (no JS read access, mitigates XSS token theft, T-178-13),
# Secure (HTTPS only), SameSite=Strict (defense-in-depth CSRF mitigation,
# viable because beeatlas.net -> api.beeatlas.net is same-site), and
# deliberately NO "domain" key so the cookie is host-only (defaults to the
# exact host that set it) rather than scoped to the whole registrable
# domain.
COOKIE_KWARGS = {
    "httponly": True,
    "secure": True,
    "samesite": "Strict",
    "max_age": COOKIE_MAX_AGE,
}


def make_serializer(secret_key: str) -> URLSafeTimedSerializer:
    """Return a URLSafeTimedSerializer bound to *secret_key* with an explicit salt."""
    return URLSafeTimedSerializer(secret_key, salt=_SESSION_SALT)


def mint_cookie(
    serializer: URLSafeTimedSerializer,
    internal_id: int,
    inat_login: str,
    role: str | None,
) -> str:
    """Return a signed, timestamped token embedding {uid, login, role}."""
    return serializer.dumps({"uid": internal_id, "login": inat_login, "role": role})


def verify_cookie(
    serializer: URLSafeTimedSerializer, token: str, max_age_seconds: int
) -> dict | None:
    """Return the payload dict on success, or None on a tampered/expired token.

    `SignatureExpired` is a subclass of `BadSignature`, so the single
    `except BadSignature` clause below catches both a tampered/unsigned
    token and an expired-but-validly-signed one.
    """
    try:
        return serializer.loads(token, max_age=max_age_seconds)
    except BadSignature:
        return None
