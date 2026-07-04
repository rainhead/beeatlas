"""Wiring-level tests for api/main.py (178-06 Task 1): the auth/write route
surface + CORS + ProxyFix + debug-off + generic error handler + launch/serve
config exist and are configured correctly. Behavioral route tests (whoami,
logout, write-check matrix, callback state-mismatch, forced-error body) live
in api/tests/test_routes.py (178-06 Task 3).
"""

from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

import api.config as config


def test_all_expected_routes_are_registered():
    from api.main import app

    rules = {r.rule for r in app.url_map.iter_rules()}
    assert {
        "/health",
        "/auth/login",
        "/auth/callback",
        "/auth/whoami",
        "/auth/logout",
        "/api/write-check",
    } <= rules


def test_debug_is_off():
    from api.main import app

    assert app.debug is False
    assert app.config["DEBUG"] is False


def test_wsgi_app_is_proxyfix_trusting_one_hop():
    from api.main import app

    assert isinstance(app.wsgi_app, ProxyFix)
    # ProxyFix stores the trusted-hop counts on these private attrs.
    assert app.wsgi_app.x_for == 1
    assert app.wsgi_app.x_proto == 1
    assert app.wsgi_app.x_host == 1


def test_write_check_is_require_author_guarded():
    from api.main import app

    rule = next(r for r in app.url_map.iter_rules() if r.rule == "/api/write-check")
    assert "POST" in (rule.methods or set())
    view = app.view_functions[rule.endpoint]
    # require_author wraps require_session which wraps the view; functools.wraps
    # preserves __name__ back to the innermost view for identification.
    assert view.__name__ == "write_check"


def test_generic_error_handler_registered_for_unhandled_exceptions():
    from api.main import app

    handler = app.error_handler_spec[None][None].get(Exception)
    assert handler is not None


def test_generic_error_handler_passes_through_http_exceptions():
    """The catch-all Exception handler must not swallow abort()'d HTTPExceptions
    (they should keep their own status code, not become a generic 500)."""
    from api.main import _handle_unexpected_error

    err = HTTPException(description="nope")
    err.code = 403
    result = _handle_unexpected_error(err)
    assert result is err


def test_config_exposes_writes_enabled_and_serve_port():
    assert hasattr(config, "WRITES_ENABLED")
    assert isinstance(config.WRITES_ENABLED, bool)
    assert hasattr(config, "SERVE_PORT")
    assert isinstance(config.SERVE_PORT, int)
    # The import-time SERVE_PORT legitimately varies with the developer's
    # gitignored secrets.toml (the dev loop uses 8081) — assert the
    # resolution logic, not the machine-dependent snapshot.
    assert config.resolve_serve_port(None, None) == 8080  # documented default
    assert config.resolve_serve_port(None, 8081) == 8081  # toml key
    assert config.resolve_serve_port("9090", 8081) == 9090  # env wins
