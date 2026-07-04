# BeeAtlas auth + write API

The one deliberate exception to BeeAtlas's static-hosting-only rule: a small
Flask/WSGI service owning identity (iNat OAuth2 PKCE, server-side exchange)
and authenticated writes to the authoritative store. In production it runs on
maderas — Waitress on loopback behind Apache `mod_proxy_http` at
`api.beeatlas.net` (see
[docs/runbooks/notes-write-launch-gate.md](../docs/runbooks/notes-write-launch-gate.md)).
The read path (the entire public site) stays 100% static and never talks to
this service except for the optional signed-in header state.

## Layout

- [`main.py`](main.py) — routes (`/auth/*`, `/api/write-check`, `/health`), ProxyFix, CORS, error handler
- [`oauth.py`](oauth.py) — PKCE pair, authorize URL, code exchange, identity fetch
- [`session.py`](session.py) — itsdangerous-signed session cookie mint/verify
- [`auth.py`](auth.py) — `require_session` / `require_author` (origin gate + allowlist + WRITE-04 flag)
- [`users.py`](users.py) — internal-id upsert against the store's `users` table
- [`config.py`](config.py) — secrets loader (`secrets.toml`, gitignored), redirect-URI pin, `DEV_MODE`
- [`serve.py`](serve.py) — Waitress entrypoint (loopback-only)

Tests live in [`tests/`](tests/) and run with the store suite:
`cd data && uv run pytest`.

## Local development (full OAuth loop, no maderas round-trip)

One-time setup:

1. **Register a dev iNat app** (separate from the production app):
   <https://www.inaturalist.org/oauth/applications/new> with redirect URI
   exactly `http://localhost:8081/auth/callback`.
2. **Create `api/secrets.toml`** (gitignored) from
   [`secrets.example.toml`](secrets.example.toml) with the dev app's
   `client_id`/`client_secret`, `redirect_uri = "http://localhost:8081/auth/callback"`,
   any non-placeholder `signing_key`, and `[serve] port = 8081`
   (8080 collides with the Eleventy dev server). The loopback redirect is what
   switches on `DEV_MODE` (loopback origins pass the CSRF gate; cookies drop
   `Secure` so Safari works over plain http).
3. **Create a local store** and apply migrations:

   ```bash
   cd data
   NOTES_DB_PATH=$PWD/notes-dev.db uv run alembic -c notes_store/migrations/alembic.ini upgrade head
   ```

   Add yourself to `data/roles_allowlist.toml` if you aren't already listed
   (do not commit test-only entries).

Run it (two terminals):

```bash
# 1 — the API on :8081 (from the repo root: `-m api.serve` needs the repo
#     root on sys.path before the module loads, same as production)
NOTES_DB_PATH=$PWD/data/notes-dev.db WRITES_ENABLED=true \
  uv run --project data python -m api.serve

# 2 — the site on :8080 (`.env.development` points auth at :8081)
npm run dev
```

Then sign in from `http://localhost:8080` — the full PKCE round trip runs
against the dev iNat app, and `POST /api/write-check` exercises the authz
stack end-to-end.

`DEV_MODE` cannot engage in production: it requires a loopback `redirect_uri`
in `secrets.toml`, which the production iNat app would refuse — and any other
deviation from the pinned redirect URI fails loudly at import
(`config.resolve_redirect_uri`).
