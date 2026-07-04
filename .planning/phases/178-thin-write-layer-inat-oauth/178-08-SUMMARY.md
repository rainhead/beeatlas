---
phase: 178-thin-write-layer-inat-oauth
plan: 08
status: complete
completed: 2026-07-04
requirements: [WRITE-01, WRITE-04]
---

# 178-08 SUMMARY — Write layer live on maderas + WRITE-04 launch gate

## Outcome

**api.beeatlas.net is live and writes are open.** Apache `mod_proxy_http` + certbot TLS
reverse-proxying Waitress on `127.0.0.1:8080` (systemd `--user` unit, D-18 branch B1);
migration `0002` applied on the live store; the WRITE-04 gate was closed in order
(restore re-confirmed on this deployment → 503 observed while gated → flag flipped →
first author committed → 200). Real iNat OAuth sign-in works end-to-end from beeatlas.net.

## Task record

**Task 1 (auto, `b7b44941`):** surgical additive `ApiA` Route53 A-record
(`api.beeatlas.net → 45.79.96.48`, plain IP per D-11) + `docs/runbooks/notes-write-launch-gate.md`
(mod_proxy_http vhost, both D-18 supervisor branches, WRITE-04 checklist). `cdk diff` purely
additive; infra `tsc --noEmit` + CDK assertion tests green. No flup6/mod_fcgid references.

**Task 2 (operator deploy, resume signal "deployed" — completed 2026-07-04):**
- CDK deployed; `api.beeatlas.net` resolves to 45.79.96.48; certbot TLS at Apache.
- Vhost at `/etc/apache2/sites-available/api.beeatlas.net.conf` (ProxyPass/ProxyPassReverse →
  `127.0.0.1:8080`, `X-Forwarded-Proto https`).
- **Supervisor branch used: B1 (systemd `--user` unit `beeatlas-api.service` + enable-linger).**
- Real `client_secret` + `signing_key` filled in on-host `api/secrets.toml` (never committed).
- Migration `0002` applied on the live store (`users` table present — proven live by the
  sign-in upsert and `whoami` reporting the internal identity).
- `/health` green over TLS; supervisor restart verified (kill → systemd respawn; the initial
  "503 after kill" was Apache's `retry=60` worker error-state, not a failed restart).
- Forced-error behavior proven live: a malformed `/auth/callback` returned a generic 400 page,
  no traceback (`app.debug=False` + generic handler).

**Task 3 (WRITE-04 gate, resume signal "writes open" — completed 2026-07-04):**
- 177-07 restore **re-run by the operator on this live deployment 2026-07-04 → PASS**
  (original Drill Log PASS 2026-07-03 also present in `notes-store-dr.md`).
- With `writes_enabled=false`: authenticated, allowlisted `POST /api/write-check` from
  beeatlas.net → **503** (gate closed).
- Flag flipped true on maderas + service restart.
- Same request → **200** with server-derived identity. **503→200 transition observed.**
- First real contributor committed: `rainhead = "curator"` (`b5ac9ff5`; curator implies
  author — pre-stages Phase 180 moderation). Signed in on prod as rainhead (Author).

## Deviations / live findings (all fixed + committed during the go-live)

| Finding | Fix |
|---------|-----|
| Crash-loop on first start: venv missing waitress (pull didn't sync deps) | `ExecStart` → `uv run --frozen --project data python -m api.serve`; runbook updated |
| Kill-test read as failure: Apache `retry=60` served 503 after backend refusal | `ProxyPass ... retry=0` + runbook B4 timing note |
| **OAuth callback 400 on every real login: flow cookie was `SameSite=Strict`, not sent on the cross-site top-level navigation from inaturalist.org** | Flow cookie → `SameSite=Lax` (`b4ba0005`) + Set-Cookie regression test; session cookie stays Strict (same-site) |
| Runbook A3 lacked the vhost file path/enable step | `/etc/apache2/sites-available/api.beeatlas.net.conf` + `a2ensite` documented |
| `NOTES_BACKUP_BUCKET` unset → misleading ListAllMyBuckets AccessDenied | Bucket name recovered from stack outputs; operator persisting the env var |

Follow-on hardening shipped alongside (same session): DEV_MODE local OAuth loop
(`4e76e10c`), serve startup banner + dev port guard + secrets-hermetic tests (`d2dd738c`).

## Verification evidence

- `curl https://api.beeatlas.net/health` → `{"status":"ok"}` over TLS (Apache → Waitress).
- Waitress loopback-only (`127.0.0.1:8080`); reachable exclusively via Apache.
- Live OAuth PKCE round trip: sign-in from beeatlas.net → iNat → callback → session cookie →
  `whoami` shows rainhead (Author).
- WRITE-04: 503 (gated) → flip + restart → 200 (open), restore confirmed first.
- Suites at close: 419 Python passed / 9 skipped; 923 JS passed.

## Key files
- created: `docs/runbooks/notes-write-launch-gate.md`
- modified: `infra/lib/beeatlas-stack.ts` (ApiA A-record), `data/roles_allowlist.toml` (first contributor)
- live (on-host, not committed): Apache vhost, systemd user unit, `api/secrets.toml`

## Self-Check: PASSED
