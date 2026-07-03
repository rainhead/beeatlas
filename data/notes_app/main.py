"""BeeAtlas notes-app — Phase 177 Flask (WSGI) skeleton.

Phase-177 groundwork only. Exposes a single health-check route to prove the
maderas app layer exists. On maderas the app is served behind Apache via
``mod_fcgid`` (WSGI/FastCGI, worker processes spawned on demand and reaped when
idle — no always-on daemon); the module-level ``app`` is the WSGI callable the
FastCGI wrapper hands to mod_fcgid. Write/identity/auth endpoints land in
Phase 178, along with the ``.fcgi`` wrapper and the ``api.beeatlas.net`` vhost.

SCOPE GUARD: No write routes, no identity, no CSRF, no DB, no CORS.
"""

from flask import Flask

app = Flask(__name__)


@app.get("/health")
def health() -> dict:
    """Return service health status. Unauthenticated; no DB access.

    Returning a dict makes Flask emit a JSON response at request time; the
    unit tests call this directly and assert the dict.
    """
    return {"status": "ok"}
