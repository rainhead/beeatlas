"""Tests for the Phase-177 Flask (WSGI) health skeleton."""


def test_health_direct():
    """health() returns {'status': 'ok'} when called directly."""
    from notes_app.main import health

    assert health() == {"status": "ok"}


def test_health_route_via_client():
    """GET /health returns 200 + JSON body through the WSGI app."""
    from notes_app.main import app

    resp = app.test_client().get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_no_write_routes():
    """SCOPE GUARD: the Phase-177 skeleton exposes no write verbs (those are Phase 178)."""
    from notes_app.main import app

    methods: set[str] = set()
    for rule in app.url_map.iter_rules():
        methods |= rule.methods or set()
    assert {"POST", "PUT", "PATCH", "DELETE"}.isdisjoint(methods), (
        f"health-only skeleton must expose no write verbs, got: {sorted(methods)}"
    )
