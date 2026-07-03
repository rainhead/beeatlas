"""BeeAtlas notes-app — Phase 177 FastAPI skeleton.

Phase-177 groundwork only. Exposes a single health-check route to prove
the maderas app layer exists and is shaped for Apache reverse proxy.
Write/identity/auth endpoints land in Phase 178.

Run with:
    uvicorn notes_app.main:app --host 127.0.0.1 --port 8001

Apache proxies /notes-api/* here. The ``root_path`` setting tells FastAPI
its externally-visible prefix so generated OpenAPI URLs are correct
(RESEARCH.md Pattern 6).

SCOPE GUARD: No write routes, no identity, no CSRF, no DB, no CORS.
"""

import os

from fastapi import FastAPI

app = FastAPI(root_path=os.environ.get("NOTES_APP_ROOT_PATH", "/notes-api"),
              title="BeeAtlas Notes API",
              description="Phase-177 skeleton. Write/identity endpoints in Phase 178.",
              version="0.1.0")


@app.get("/health")
def health() -> dict:
    """Return service health status. Unauthenticated; no DB access."""
    return {"status": "ok"}
