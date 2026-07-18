"""Tests for the itsdangerous-signed app session cookie (WRITE-02, D-04).

Covers:
  - make_serializer / mint_cookie / verify_cookie round-trip.
  - Tamper rejection (byte-flipped token -> None).
  - Expiry rejection (max_age=0 -> None).
  - Cookie policy constants (HttpOnly, Secure, SameSite=Strict, host-only,
    non-default cookie name).
  - itsdangerous is the signing mechanism, never PyJWT.
"""

import api.session as session


# ---------------------------------------------------------------------------
# mint_cookie / verify_cookie round-trip
# ---------------------------------------------------------------------------


def test_mint_and_verify_round_trips_payload():
    serializer = session.make_serializer("throwaway-test-key")
    token = session.mint_cookie(
        serializer, internal_id=7, inat_login="beeperson", role="author",
        icon_url="https://static.inaturalist.org/attachments/users/icons/7/x-medium.jpeg",
    )

    payload = session.verify_cookie(serializer, token, max_age_seconds=session.COOKIE_MAX_AGE)

    assert payload == {
        "uid": 7, "login": "beeperson", "role": "author",
        "icon_url": "https://static.inaturalist.org/attachments/users/icons/7/x-medium.jpeg",
    }


def test_mint_cookie_icon_url_defaults_none():
    serializer = session.make_serializer("throwaway-test-key")
    token = session.mint_cookie(serializer, internal_id=7, inat_login="beeperson", role="author")
    payload = session.verify_cookie(serializer, token, max_age_seconds=session.COOKIE_MAX_AGE)
    assert payload["icon_url"] is None


def test_verify_cookie_rejects_tampered_token():
    serializer = session.make_serializer("throwaway-test-key")
    token = session.mint_cookie(serializer, internal_id=7, inat_login="beeperson", role="author")

    # Mutate the FIRST character, never the last. The token's final character
    # encodes the tail of the base64url'd HMAC, where 20 signature bytes (160
    # bits) span 27 characters (162 bits) — the 2 leftover bits are ignored by
    # the decoder, so {Y, Z, a, b} all decode to the same byte. Substituting
    # "a" for a signature ending in "Y" therefore yields a *different string
    # that verifies fine*, failing this assertion 1-in-16 runs (beeatlas-2pi).
    # Position 0 always carries 6 significant bits, so any swap there is a real
    # mutation. The payload segment has the same slack-bit hazard at its own
    # boundary, so tampering with its last character is not a safe alternative.
    tampered = ("a" if token[0] != "a" else "b") + token[1:]

    assert session.verify_cookie(serializer, tampered, max_age_seconds=session.COOKIE_MAX_AGE) is None


def test_verify_cookie_rejects_expired_token():
    serializer = session.make_serializer("throwaway-test-key")
    token = session.mint_cookie(serializer, internal_id=7, inat_login="beeperson", role="author")

    assert session.verify_cookie(serializer, token, max_age_seconds=-1) is None


def test_verify_cookie_rejects_token_signed_with_a_different_key():
    serializer_a = session.make_serializer("key-a")
    serializer_b = session.make_serializer("key-b")
    token = session.mint_cookie(serializer_a, internal_id=1, inat_login="x", role=None)

    assert session.verify_cookie(serializer_b, token, max_age_seconds=session.COOKIE_MAX_AGE) is None


def test_verify_cookie_rejects_garbage_token():
    serializer = session.make_serializer("throwaway-test-key")

    assert session.verify_cookie(serializer, "not-a-real-token", max_age_seconds=session.COOKIE_MAX_AGE) is None


# ---------------------------------------------------------------------------
# Cookie policy constants
# ---------------------------------------------------------------------------


def test_cookie_name_is_not_flask_default():
    assert session.COOKIE_NAME != "session"
    assert session.COOKIE_NAME


def test_cookie_kwargs_encode_strict_policy():
    kwargs = session.COOKIE_KWARGS

    assert kwargs["httponly"] is True
    assert kwargs["secure"] is True
    assert kwargs["samesite"] == "Strict"
    # Host-only: no Domain attribute set on the cookie.
    assert "domain" not in kwargs


def test_cookie_max_age_is_long_lived():
    # D-04: weeks-long session, not a short-lived token.
    assert session.COOKIE_MAX_AGE >= 60 * 60 * 24 * 7


def test_uses_itsdangerous_not_pyjwt():
    from itsdangerous import URLSafeTimedSerializer

    serializer = session.make_serializer("throwaway-test-key")
    assert isinstance(serializer, URLSafeTimedSerializer)
    assert "jwt" not in vars(session)
