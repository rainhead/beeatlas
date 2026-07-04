"""BeeAtlas auth + write API — Flask (WSGI) app (D-15).

This is BeeAtlas's app-level auth + write service, relocated from the
Phase-177 `data/notes_app/main.py` skeleton per D-15. Notes are merely the
first feature to consume it (Phase 179); OAuth/session/write routes are
added by later Phase-178 plans. On maderas the app is served by Waitress
(a persistent, pure-Python WSGI server, D-17) behind Apache `mod_proxy_http`
at `api.beeatlas.net` — the Waitress serve entrypoint + `ProxyFix` land in
178-06.
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
