"""Tests for the Phase-177 FastAPI health skeleton.

Calls the route function directly (no TestClient / no httpx dependency).
"""


def test_health():
    """health() returns {'status': 'ok'}."""
    from notes_app.main import health

    assert health() == {"status": "ok"}


def test_app_has_health_route():
    """FastAPI app has the /health route registered."""
    from notes_app.main import app

    routes = {r.path for r in app.routes}  # type: ignore[attr-defined]
    assert "/health" in routes, f"Expected /health in routes, got: {routes}"


def test_app_root_path_default():
    """App root_path defaults to /notes-api (Apache proxy shape)."""
    from notes_app.main import app

    assert app.root_path == "/notes-api"
