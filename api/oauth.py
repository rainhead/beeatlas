"""Server-side iNaturalist OAuth2 authorization-code exchange, WITH PKCE (D-01/D-02).

The browser only ever carries the one-time `code` back to `/auth/callback`
(wired in 178-06); this module holds the pure, unit-testable functions that
do the actual exchange:

  - make_pkce_pair()   RFC 7636 S256 verifier/challenge pair.
  - authorize_url()    builds the /oauth/authorize redirect URL.
  - exchange_code()    POSTs the authorization code + PKCE verifier + the
                       confidential client's client_secret to /oauth/token.
  - fetch_identity()   exchanges the OAuth access_token for the 24h
                       /users/api_token JWT, then calls /v1/users/me to get
                       the iNat identity ({id, login, ...}).

PKCE-with-confidential-client rationale (D-01/D-02): iNat's OAuth app is
registered as a normal confidential client (client_secret issued), but PKCE
is added as defense-in-depth per OAuth 2.1's recommendation — nothing in
Doorkeeper's PKCE support requires the client to be non-confidential. If
live testing (178-08/09) shows Doorkeeper rejects `code_challenge` for a
confidential client, the fallback is a one-line change: drop the
`code_challenge`/`code_verifier` params from `authorize_url`/`exchange_code`
and perform the plain (no-PKCE) authorization-code exchange instead — the
rest of the flow (client_secret, redirect_uri, identity fetch, token
discard) is unchanged.

D-03 (token discard): the OAuth access_token and the 24h JWT returned by
`/users/api_token` exist only as local variables within `fetch_identity` —
they are never returned, logged, or persisted. Route code (178-06) discards
them immediately after calling `fetch_identity()`.
"""

import base64
import hashlib
import secrets

import requests

INAT_BASE = "https://www.inaturalist.org"
INAT_API_BASE = "https://api.inaturalist.org"


def make_pkce_pair() -> tuple[str, str]:
    """RFC 7636 S256: verifier is 43-128 chars, challenge is its base64url(sha256(...))."""
    verifier = secrets.token_urlsafe(64)  # ~86 chars, well within range
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def authorize_url(client_id: str, redirect_uri: str, state: str, code_challenge: str) -> str:
    """Build the `/oauth/authorize` redirect URL.

    redirect_uri must be byte-identical to the value registered for the iNat
    app (D-12/D-13's pinned `https://api.beeatlas.net/auth/callback`) — the
    caller is responsible for supplying `api.config.REDIRECT_URI` here.
    """
    return (
        f"{INAT_BASE}/oauth/authorize?client_id={client_id}"
        f"&redirect_uri={redirect_uri}&response_type=code"
        f"&state={state}&code_challenge={code_challenge}&code_challenge_method=S256"
    )


def exchange_code(
    client_id: str, client_secret: str, code: str, redirect_uri: str, verifier: str
) -> str:
    """POST the authorization code + PKCE verifier to `/oauth/token`.

    Returns the OAuth access_token. Raises `requests.exceptions.HTTPError`
    on any non-2xx response (e.g. `invalid_grant` on a bad/expired code).
    """
    resp = requests.post(
        f"{INAT_BASE}/oauth/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,  # confidential-client credential
            "code": code,
            "redirect_uri": redirect_uri,  # must exactly match the /oauth/authorize call
            "grant_type": "authorization_code",
            "code_verifier": verifier,  # PKCE defense-in-depth (D-02)
        },
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_identity(access_token: str) -> dict:
    """Exchange the OAuth access_token for identity, discarding both tokens.

    Two HTTP calls with two DIFFERENT header formats (RESEARCH.md Pitfall 2):
      1. `/users/api_token` — Bearer-prefixed access_token -> 24h JWT.
      2. `/v1/users/me` — the JWT sent RAW (no "Bearer " prefix), matching
         the official `inaturalistjs` client (`headers.Authorization = apiToken`).

    Returns the identity dict from `results[0]` (`{id, login, ...}`). Neither
    the access_token nor the JWT is returned, stored, or logged (D-03) — they
    exist only as local variables in this function's frame.
    """
    jwt_resp = requests.get(
        f"{INAT_BASE}/users/api_token",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    jwt_resp.raise_for_status()
    jwt = jwt_resp.json()["api_token"]

    me_resp = requests.get(
        f"{INAT_API_BASE}/v1/users/me",
        headers={"Authorization": jwt},
    )
    me_resp.raise_for_status()
    return me_resp.json()["results"][0]  # {id, login, ...}
