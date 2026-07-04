# Notes Write Layer — Go-Live Runbook + WRITE-04 Launch Gate

**Covers:** WRITE-01 (served on real infra via Waitress + Apache `mod_proxy_http`) +
WRITE-04 (public writes gated on the proven restore)
**Phase:** 178 (Thin Write Layer + iNat OAuth)
**Related:** [Notes Store DR Runbook](./notes-store-dr.md) (the 177-07 restore Drill Log this
gate references), `api/config.py`, `api/serve.py`, `api/secrets.example.toml`

**Serving pivot (D-17/D-18):** the vhost reverse-proxies a persistent Waitress loopback
process via `mod_proxy_http`. The previously-considered FastCGI-bridge deployment shape
(a decade-stale, unmaintained CGI bridge package + a wrapper script) was rejected
2026-07-03 — see CONTEXT.md D-17 for the rationale. Do not reintroduce it.

---

## Part A — Apache go-live (mod_proxy_http vhost)

Run on maderas. Requires interactive `sudo` (maderas has no passwordless sudo).

### A1. Enable the required Apache modules

```bash
sudo a2enmod proxy proxy_http headers
sudo systemctl restart apache2   # or: sudo apachectl graceful
```

### A2. Obtain the TLS certificate (certbot)

```bash
sudo certbot certonly --apache -d api.beeatlas.net
```

Confirms the `api.beeatlas.net` A-record (added by this plan's CDK change, `ApiA` →
`45.79.96.48`) resolves before issuing.

### A3. Create the `api.beeatlas.net` vhost

The Waitress loopback port is `api.config.SERVE_PORT` (default `8080`; overridable via
`[serve] port` in `api/secrets.toml` or a `SERVE_PORT` env var — confirm the actual value
in use before writing the vhost).

```apache
<VirtualHost *:443>
    ServerName api.beeatlas.net

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/api.beeatlas.net/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/api.beeatlas.net/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/

    # Waitress/Flask trusts exactly one Apache hop via ProxyFix (api/main.py).
    # Without this header, ProxyFix cannot tell Flask the original request was HTTPS,
    # breaking Secure-cookie and redirect-URI logic (T-178-22/T-178-25).
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>

<VirtualHost *:80>
    ServerName api.beeatlas.net
    RewriteEngine On
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>
```

Replace the port in both `ProxyPass`/`ProxyPassReverse` lines if `SERVE_PORT` differs
from the `8080` default.

Save this block to `/etc/apache2/sites-available/api.beeatlas.net.conf` (maderas runs the
Debian/Ubuntu Apache layout — same as the `a2enmod` calls above), then enable the site
(symlinks it into `sites-enabled/`) and reload. `certbot certonly --apache` only issues the
cert; it does **not** write this vhost, so A3 is manual — and it must run **after** A2 (the
vhost references `/etc/letsencrypt/live/api.beeatlas.net/…`, which A2 creates).

```bash
sudo nano /etc/apache2/sites-available/api.beeatlas.net.conf   # paste the <VirtualHost> block above
sudo a2ensite api.beeatlas.net
sudo apachectl configtest
sudo systemctl reload apache2
```

### A4. Deploy the `api/` tree + set the store path

```bash
cd ~/dev/beeatlas
git pull
export NOTES_DB_PATH=$HOME/beeatlas-store/notes.db   # matches notes-store-dr.md §2
```

Confirm `api/secrets.toml` exists (copy from `api/secrets.example.toml` if this is the
first deploy) and fill in the real `client_secret` (iNat → Account → Applications → the
registered BeeAtlas app) and `signing_key`
(`python -c "import secrets; print(secrets.token_urlsafe(64))"`). Leave
`[launch] writes_enabled = false` for now — Part C below governs when that flips.

---

## Part B — Waitress supervisor (D-18)

Waitress (`api/serve.py`) is a **persistent** process — it needs a supervisor to start on
boot and restart on crash. **First confirm whether maderas has systemd** (the "no
systemd" assumption behind the original, now-superseded deployment plan was never
verified):

```bash
systemctl --version   # present -> use Branch B1
pidof systemd          # PID 1 is systemd -> use Branch B1; otherwise -> Branch B2
```

Record which branch was used in the plan's SUMMARY.

### B1. systemd present — `--user` unit

Launch through `uv run` (not the venv python directly) so the environment is synced
against the committed `uv.lock` before every start — a `git pull` that adds dependencies
can never crash-loop the service on `ModuleNotFoundError`. `--frozen` asserts the
lockfile instead of re-resolving, so boot-time starts are deterministic. systemd user
units don't inherit your shell PATH: use the absolute `uv` path (`which uv`; shown here
as `%h/.local/bin/uv` — adjust if yours differs).

```ini
# ~/.config/systemd/user/beeatlas-api.service
[Unit]
Description=BeeAtlas auth+write API (Waitress)
After=network.target

[Service]
WorkingDirectory=%h/dev/beeatlas
Environment=NOTES_DB_PATH=%h/beeatlas-store/notes.db
ExecStart=%h/.local/bin/uv run --frozen --project %h/dev/beeatlas/data python -m api.serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
loginctl enable-linger $USER        # keeps the user unit running without an active login session
systemctl --user daemon-reload
systemctl --user enable --now beeatlas-api
systemctl --user status beeatlas-api
```

Restart to pick up code/secrets changes:

```bash
systemctl --user restart beeatlas-api
```

### B2. No systemd — cron `@reboot` (+ optional keepalive)

Same `uv run --frozen` rationale as B1 (cron's PATH is minimal too — absolute `uv` path):

```cron
# crontab -e
@reboot NOTES_DB_PATH=$HOME/beeatlas-store/notes.db $HOME/.local/bin/uv run --frozen --project $HOME/dev/beeatlas/data python -m api.serve >> $HOME/beeatlas-api.log 2>&1

# Optional: per-minute keepalive so a crashed process restarts without a full reboot.
# flock prevents overlapping launches if the process is already running.
* * * * * flock -n $HOME/.beeatlas-api.lock -c 'pgrep -f "api.serve" > /dev/null || (NOTES_DB_PATH=$HOME/beeatlas-store/notes.db $HOME/.local/bin/uv run --frozen --project $HOME/dev/beeatlas/data python -m api.serve >> $HOME/beeatlas-api.log 2>&1 &)'
```

Restart to pick up code/secrets changes (no service manager to ask, so kill and let the
keepalive/next reboot relaunch it — or manually re-run the serve command in the
background after killing the old PID):

```bash
pkill -f "api.serve"
# then either wait for the keepalive cron (<=1 min) or relaunch manually:
NOTES_DB_PATH=$HOME/beeatlas-store/notes.db $HOME/.local/bin/uv run --frozen --project $HOME/dev/beeatlas/data python -m api.serve >> $HOME/beeatlas-api.log 2>&1 &
```

### B3. Confirm loopback binding + apply migration

```bash
# Must be listening on 127.0.0.1 only, never 0.0.0.0 (T-178-25)
ss -tlnp | grep 8080

cd ~/dev/beeatlas/data
NOTES_DB_PATH=$HOME/beeatlas-store/notes.db \
  uv run alembic -c notes_store/migrations/alembic.ini upgrade head
uv run alembic -c notes_store/migrations/alembic.ini current   # expect 0002
```

### B4. Smoke test

```bash
curl https://api.beeatlas.net/health
# expect: {"status": "ok"} over TLS

# Forced error must NOT leak a traceback (app.debug=False + generic handler;
# the debug-traceback footgun of the rejected deployment shape is gone under
# Waitress) — T-178-15
curl -i https://api.beeatlas.net/auth/callback   # malformed request, no code param

# Simulate a crash and confirm the supervisor restarts it
pkill -f "api.serve"; sleep 5; curl https://api.beeatlas.net/health
```

---

## Part C — WRITE-04 launch checklist (public-writes gate)

Writes are **never truly "public"** — the allowlist (`data/roles_allowlist.toml`) gates
every write regardless of the flag below. WRITE-04's gate is: the allowlist +
the demonstrated restore + the `writes_enabled` flag, in this order:

1. **Confirm the 177-07 restore Drill Log shows PASS** —
   [`notes-store-dr.md` § Drill Log](./notes-store-dr.md#drill-log). As of 2026-07-03 the
   log shows `PASS ✅` (note count 3==3, schema version 0001==0001). Do not proceed past
   this step without a PASS row.
2. **`writes_enabled` defaults false** in `api/secrets.toml` `[launch]` and MUST stay
   false until step 1 is confirmed on *this* deployment. While false, `POST
   /api/write-check` (and any real write route) returns `503`.
3. **Go-live order:**
   1. Fill `api/secrets.toml` real secrets (Part A4).
   2. Deploy the vhost + start Waitress under the chosen supervisor (Parts A/B).
   3. Apply migration `0002` (Part B3) — the `users` table (D-08) must exist before
      login can mint the first internal user id.
   4. Flip `writes_enabled = true` in `api/secrets.toml [launch]` (or set the
      `WRITES_ENABLED` env var, which always overrides the toml value) and restart/reload
      the Waitress process (Part B1/B2 restart commands) so the new value takes effect.
   5. Add the first real author's iNat login to `data/roles_allowlist.toml` and commit —
      git history is the audit trail (D-07).
4. **The gate, restated:** writes are gated by three independent layers — the committed
   allowlist (who), the demonstrated restore (recoverability), and the `writes_enabled`
   flag (a kill switch). All three must be satisfied; flipping the flag alone does not
   make writes "public" because no one outside the allowlist can ever write.

Record the `503` → `200` transition and the restore confirmation in the plan's SUMMARY
when this checklist is executed (178-08 Task 3).
