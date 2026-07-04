"""Tests for the auth + write API's Flask (WSGI) skeleton (relocated from
data/notes_app in Phase 178, D-15)."""


def test_health_direct():
    """health() returns {'status': 'ok'} when called directly."""
    from api.main import health

    assert health() == {"status": "ok"}


def test_health_route_via_client():
    """GET /health returns 200 + JSON body through the WSGI app."""
    from api.main import app

    resp = app.test_client().get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_health_route_registered():
    """Smoke check that /health is registered on the app's url map.

    The Phase-177 "no write routes" scope guard is intentionally obsolete
    here: write routes (OAuth callback, session, notes write endpoint) are
    now in-scope for Phase 178 and land in later plans (178-04..08). This
    test only confirms the health skeleton itself is intact post-relocation.
    """
    from api.main import app

    rules_by_path = {rule.rule: rule for rule in app.url_map.iter_rules()}
    assert "/health" in rules_by_path
    assert "GET" in (rules_by_path["/health"].methods or set())
