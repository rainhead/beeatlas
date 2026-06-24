# Phase 163: Ecdysis download requires an authenticated session — Research

**Researched:** 2026-06-23
**Domain:** Symbiota login screen-scraping (`requests.Session`), dlt secrets, response-type guarding, cache-fallback resilience
**Confidence:** HIGH (login form, 401 shape, and dlt-secrets resolution all verified live this session)

## Summary

The fix design in `163-FINDINGS.md` and the locked decisions in `163-CONTEXT.md` are sound. This research **verifies the open unknowns live** so the planner can write concrete tasks without guessing. Every claim below tagged `[VERIFIED]` was reproduced against `https://ecdysis.org` or the local `dlt` install on 2026-06-23/24.

Three findings sharpen the design:
1. **There is NO CSRF/nonce token.** The login form's only hidden fields are `refurl` and `resetpwd` (both empty). The pre-GET-for-token step (FINDINGS step 2) is **NOT required**. A single `session.post` suffices. `[VERIFIED: live form fetch]`
2. **The correct submit field is `action=login`, NOT `loginButton`.** The page has *two* forms: a header decoy (`name="loginForm"`, button `loginButton`, no credential inputs) and the real credential form (`id="loginform"`, submit `<button name="action" value="login">`). Post `action=login` with the credentials. `[VERIFIED: live form fetch]`
3. **The download failure is a true HTTP 401** (not a 200-with-error-body), so the existing `response.raise_for_status()` already catches the current anonymous case. But the guard is still needed defensively (a future 200+JSON path is plausible), so keep the magic-bytes / Content-Type check. `[VERIFIED: live curl reproduction]`

**Primary recommendation:** Patch `_download_zip` to: (1) read creds via `dlt.secrets["sources.ecdysis.username"/".password"]`; (2) `session.post` the login form with `login`/`password`/`remember=0`/`action=login` (no pre-GET, no CSRF); (3) reuse the session for the existing download POST; (4) guard the response with magic-bytes + Content-Type; (5) on ANY login/download/guard failure, fall back to a valid cached ZIP if one exists, else re-raise. Mirror `test_resolve_taxon_ids.py`'s `patch("...requests...", side_effect=[...])` "Pattern D" boundary-mock for tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Symbiota login + session | Data pipeline (`ecdysis_pipeline._download_zip`) | — | Single helper owns the auth+download; no other tier touches Ecdysis |
| Credential storage | `data/.dlt/secrets.toml` (maderas, gitignored) | dlt secrets provider | dlt auto-loads `[sources.ecdysis]` from the sibling of `config.toml` |
| Cache fallback | `_download_zip` / `ECDYSIS_CACHE_DIR` | — | Failure resilience layers onto the existing TTL fast-path |
| CI/deploy | none | — | `deploy.yml` pulls finished artifacts from S3; never calls Ecdysis |

## Project Constraints (from CLAUDE.md)

- **Static hosting / no server runtime** — does NOT apply to the data pipeline (Python 3.14, runs on maderas via `data/nightly.sh`). This phase is entirely server-side data-pipeline code.
- **Two-tier pytest convention** — fast tier mocks network. ALL new tests for this phase must mock `requests`/`requests.Session` (no live Ecdysis calls in the fast tier). The one real authenticated download is a **manual integration** step on maderas, not an automated test.
- **`data/nightly.sh` is the sole nightly entry point** — owns NVM, git pull, S3 pull/push, CloudFront invalidation, and `run.py`. No nightly.sh change is needed for this phase (creds are read from disk; the script already runs `run.py` which calls STEP 1 `ecdysis`).
- **`run.py` knows nothing about S3/git** — it's the pure orchestrator. No `run.py` change needed; `load_ecdysis` is STEP 1 and stays in place.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-1 Account/credentials:** An Ecdysis/Symbiota account with dataset-44 download rights is available. Credentials live in `data/.dlt/secrets.toml` under `[sources.ecdysis]` (`username`/`password`), alongside the existing `config.toml` `[sources.ecdysis] dataset_id = 44`. Operator places real secrets on maderas; never committed.
  - **BLOCKING PREREQUISITE (security):** `data/.dlt/secrets.toml` is currently NOT gitignored. A gitignore entry (e.g. `data/.dlt/secrets.toml` or `**/.dlt/secrets.toml`) MUST be added BEFORE any credentials land on disk. Verify with `git check-ignore -v`. **[VERIFIED this session: still NOT ignored — `git check-ignore` returns nothing; secrets.toml does not yet exist on disk.]**
- **D-2 Approach:** Authenticated-session scraper. Symbiota login → `PHPSESSID` → reuse-for-download. Build `requests.Session()`; (GET first if CSRF token present — **research says NOT present, skip**); POST login with `login`/`password`/correct-submit-field; reuse same session for `downloadhandler.php` POST; guard the response (raise loudly on JSON `{"error":…}`). Accept the brittleness; mitigate with the loud-failure guard.
- **D-3 Resilience:** Cache-fallback on download failure. On any login/download failure, if a valid (non-empty, parseable) cached ZIP exists at `data/.ecdysis_cache/<dataset_id>.zip`, warn and reuse it rather than aborting. Hard-fail only when no usable cache. Independent of the existing TTL fast-path.

### Claude's Discretion
- **Credential reading:** `_download_zip` is a plain helper (not a `@dlt.resource`), so `dlt.config.value` injection is unavailable. Read creds via `dlt.secrets[...]` or `os.environ`, whichever is cleanest/testable. Planner/executor decide. **[Research recommends `dlt.secrets["sources.ecdysis.username"]` — verified working.]**

### Deferred Ideas (OUT OF SCOPE)
- Contacting Ecdysis about restored public access / sanctioned API / DwC-A endpoint for dataset 44 (preferred long-term, but the scraper is the chosen unblock).
- Nightly automation of credential rotation / login-failure alerting.
- Any change to `ecdysis_links` HTML scraping (separate, still-public path).
- CI/deploy changes (`deploy.yml` only pulls from S3).
</user_constraints>

## Answers to the Open Technical Unknowns

### Q1 — Live Symbiota login form `[VERIFIED: GET https://ecdysis.org/profile/index.php, 2026-06-24, HTTP 200]`

The page contains **two** `<form>`s relevant to login:

**Decoy header form (DO NOT USE):**
```html
<form name="loginForm" method="post" action="/profile/index.php">
  <input name="refurl" type="hidden" value="/profile/index.php?">
  <button name="loginButton" type="submit">Sign In</button>
</form>
```
This has NO username/password inputs — it just navigates to the login page. `loginButton` is a red herring.

**Real credential form (USE THIS):**
```html
<form id="loginform" name="loginform" action="index.php" onsubmit="return checkCreds(this);" method="post">
  <input id="portal-login" name="login" value="" required />
  <input type="password" id="password" name="password" autocomplete="off" />
  <input type="checkbox" value='1' name="remember" id="remember" checked >
  <input type="hidden" name="refurl" value="" />
  <input type="hidden" id="resetpwd" name="resetpwd" value="">
  <button name="action" type="submit" value="login">Sign In</button>
</form>
```

| Field | Value to POST | Notes |
|-------|---------------|-------|
| `login` | username (from secrets) | Required. Field name is `login`, not `username`. |
| `password` | password (from secrets) | |
| `action` | `login` | **This is the submit control.** `<button name="action" value="login">`. |
| `remember` | `0` (or omit) | Checkbox; checked by default in HTML (`value='1'`). Send `0` to avoid a long-lived cookie; harmless either way. |
| `refurl` | `""` | Hidden, empty. Optional. |
| `resetpwd` | `""` | Hidden, empty. Optional. |

- **Action URL:** `action="index.php"` is relative to `/profile/`, i.e. POST to `https://ecdysis.org/profile/index.php`. `[VERIFIED]`
- **CSRF / nonce / anti-forgery token: NONE.** `grep -iE "csrf|token|nonce|authenticity"` across the page found nothing. The only hidden inputs are `refurl` and `resetpwd`, both empty. **The pre-GET-for-token step is NOT required.** `[VERIFIED: live form fetch]`

### Q2 — Auth/session mechanics `[VERIFIED: live]`

- **PHPSESSID cookie:** The login GET returns `Set-Cookie: PHPSESSID=…; secure; HttpOnly`. `[VERIFIED]` A successful Symbiota login binds rights to that session cookie. `requests.Session()` carries the cookie automatically across the login POST and the subsequent download POST — **this is the entire mechanism; no manual cookie handling needed.** `[VERIFIED: requests.Session cookie jar behavior; CITED: requests docs]`
- **Success/failure signal:** Symbiota's login handler on success typically issues a redirect (302) back to `refurl`/profile; on failure it re-renders the login page (HTTP 200) containing the login form again. The **reliable assertion is on the *download* outcome, not the login response** — i.e. don't try to parse the login HTML for a brittle success string. Instead: do the login POST, then do the download POST, and let the **response-type guard (Q4)** be the single source of truth. If login failed, the download returns the 401 JSON, which the guard turns into a loud raise. This collapses two brittle checks into one robust one.
  - *Optional belt-and-suspenders:* after login, you MAY assert `"Sign In" not in resp.text` or that a logout link is present, but treat this as a soft warning — the download guard is authoritative. **[ASSUMED: exact success-HTML markers not verified without real creds — see Assumptions Log A1.]**

### Q3 — Reading dlt secrets from a plain helper `[VERIFIED: dlt 1.27.2 local]`

`dlt.secrets["sources.ecdysis.username"]` reads from `data/.dlt/secrets.toml` and returns the value. **Verified this session** by creating a temp `.dlt/secrets.toml` and reading it back:
```python
import dlt
username = dlt.secrets["sources.ecdysis.username"]   # -> "testuser"  [VERIFIED]
password = dlt.secrets.get("sources.ecdysis.password")  # -> "testpass" [VERIFIED]
```
- **Recommended call:** `dlt.secrets["sources.ecdysis.username"]` / `dlt.secrets["sources.ecdysis.password"]`. Bracket access raises a clear `KeyError`/`ConfigFieldMissingException` if the key is absent — good loud failure when creds aren't provisioned.
- **`dlt.secrets.value` does NOT apply here** — that sentinel only works as a default for an argument of a `@dlt.source`/`@dlt.resource`-decorated function (injection). `_download_zip` is plain, so use bracket access. `dlt.config.value` likewise unavailable. `[VERIFIED]`
- **Resolution path:** dlt resolves `[sources.ecdysis]` from the `.dlt/` directory adjacent to the run cwd (the pipeline runs from `data/`, so `data/.dlt/secrets.toml`). The existing `dataset_id` already loads from `data/.dlt/config.toml` `[sources.ecdysis]`, confirming dlt finds that directory. `[VERIFIED: config.toml already in use]`
- **Test injection options (all viable):**
  1. **Env override (simplest):** dlt secrets honor env vars `SOURCES__ECDYSIS__USERNAME` / `SOURCES__ECDYSIS__PASSWORD`. `monkeypatch.setenv("SOURCES__ECDYSIS__USERNAME", "u")`. **[ASSUMED: env-var double-underscore convention is dlt-standard but not re-verified live — A2.]**
  2. **monkeypatch the read site:** `monkeypatch.setattr(ecdysis_pipeline.dlt.secrets, "__getitem__", lambda self, k: {...}[k])` — brittle.
  3. **Recommended:** wrap the cred read in a tiny helper `_get_credentials() -> tuple[str, str]` so tests `monkeypatch.setattr(ecdysis_pipeline, "_get_credentials", lambda: ("u", "p"))`. Cleanest, no dlt coupling in tests. **[Recommendation]**

### Q4 — Response-type guard `[VERIFIED: live 401 reproduction]`

Reproduced the anonymous download POST this session:
```
POST https://ecdysis.org/collections/download/downloadhandler.php  (publicsearch=1, no session)
→ HTTP/1.1 401 Unauthorized
   Content-Type: application/json
   Body: {"error":"Unauthorized access"}   (31 bytes)
```
`[VERIFIED]` — and with a garbage `PHPSESSID` cookie the result is identical (401 JSON). So **the current failure IS a real HTTP 401**, which `response.raise_for_status()` already raises on. The existing code would technically already fail loudly today — but it fails as a bare `HTTPError`, and a future Symbiota change could return **200 + JSON error** (common Symbiota pattern for permission/param errors). Keep the guard defensive:

**Guard logic (raise on anything that isn't a real ZIP):**
1. `response.raise_for_status()` — catches the 401 (existing).
2. `content_type = response.headers.get("Content-Type", "")` — if it contains `application/json` or `text/html`, raise (covers 200+JSON). 
3. **Magic bytes (authoritative):** `if not response.content.startswith(b"PK\x03\x04"): raise RuntimeError(...)`. A real ZIP always starts with `PK\x03\x04`. This catches a 200+JSON body even if Content-Type lies. Include the first ~200 bytes of the body in the error message for diagnosis.
4. (Optional) round-trip parse: `zipfile.ZipFile(io.BytesIO(response.content))` succeeds — but magic-bytes is cheaper and sufficient as the gate; reserve full-parse for the *cache-validity* check (Q5).

`[VERIFIED: PK\x03\x04 is the ZIP local-file-header magic — CITED: PKWARE APPNOTE / zipfile docs]`

### Q5 — Cache-fallback wiring (D-3) `[design recommendation, HIGH confidence on existing code behavior]`

The current `_download_zip` (lines 32-79):
- **TTL fast-path** (lines 34-41): if `ECDYSIS_CACHE_TTL_SECONDS > 0` and a fresh cache exists, return it. **Leave this UNCHANGED** — it preserves `ECDYSIS_CACHE_TTL_SECONDS=0` force-refresh and the nightly's TTL semantics.
- **Atomic write** (lines 75-78): tmp-write + `replace`. **Leave UNCHANGED.**

**Add a try/except around the network+guard block**, falling back to a *valid* cache on failure:

```
def _is_valid_cached_zip(path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            return zf.testzip() is None   # None = no corrupt members
    except zipfile.BadZipFile:
        return False
```

Recommended structure:
```
def _download_zip(dataset_id):
    cache_path = ECDYSIS_CACHE_DIR / f"{dataset_id}.zip"
    # 1. TTL fast-path — UNCHANGED
    if TTL > 0 and cache_path.exists() and fresh: return cache_path.read_bytes()
    # 2. attempt authenticated download
    try:
        session = requests.Session()
        _login(session)                       # POST login form
        content = _download(session, dataset_id)  # POST downloadhandler + GUARD (Q4)
    except Exception as e:                     # network OR guard OR login failure
        if _is_valid_cached_zip(cache_path):
            print(f"  WARNING: Ecdysis download failed ({e}); reusing cached ZIP")  # noqa: T201
            return cache_path.read_bytes()
        raise                                  # no usable cache -> hard fail
    # 3. atomic-write cache — UNCHANGED
    ...write content...
    return content
```

- **"Valid" cached ZIP = exists + non-empty + opens as a zipfile with no corrupt members** (`testzip() is None`). This is stricter than the FINDINGS "non-empty, parseable" and guarantees the fallback never feeds a half-written file downstream.
- The guard (Q4) runs *inside* the try, so a JSON-error body raises and is caught by the same fallback — exactly the desired "JSON error → reuse cache (if any) else raise" behavior from CONTEXT specifics.
- **Three outcomes preserved** (CONTEXT `<specifics>`): ZIP → success; JSON error → guard raises → cache-fallback-or-raise; network error → exception → cache-fallback-or-raise.

### Q6 — Mocking strategy (fast tier) `[VERIFIED: existing test patterns inventoried]`

Canonical project pattern is **"Pattern D" — patch at the `requests` boundary with `unittest.mock.patch(..., side_effect=[...])`**, as in `tests/test_resolve_taxon_ids.py` (lines 13-32, 141+). Mirror it:

- Build `MagicMock` responses with `.status_code`, `.headers`, `.content`, `.raise_for_status`.
- For `requests.Session`: patch `ecdysis_pipeline.requests.Session` to return a `MagicMock` whose `.post` has `side_effect=[login_resp, download_resp]` so the test asserts call order (login first, download second) and that the SAME session object is reused.
- Inject creds via the `_get_credentials` helper monkeypatch (Q3 option 3) — no real secrets.toml needed.
- No conftest fixture currently mocks HTTP for ecdysis; add per-test mocks in a new `tests/test_ecdysis_auth.py` (the existing `tests/conftest.py` is a DuckDB fixture, irrelevant here). `test_transforms.py` already imports from `ecdysis_pipeline` — extend the same import style.

**Helper to build a fake ZIP for the happy path:** `io.BytesIO()` + `zipfile.ZipFile(...,'w')` writing minimal `occurrences.tab`/`identifications.tab`, then `.getvalue()` (starts with `PK\x03\x04`, passes the guard and `_is_valid_cached_zip`).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `requests` | already a dep | `Session()` for login+download | Already used in `ecdysis_pipeline.py` |
| `dlt` | 1.27.2 `[VERIFIED]` | secrets resolution from `.dlt/secrets.toml` | Already the pipeline framework |
| `zipfile` (stdlib) | — | magic-bytes guard + cache validity | Already imported |
| `pytest` | >=9.0.2 `[VERIFIED: pyproject]` | fast-tier tests | Project standard |
| `unittest.mock` (stdlib) | — | boundary-mock `requests` | Project "Pattern D" |

**No new packages required.** No `## Package Legitimacy Audit` needed — this phase installs nothing.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dlt.secrets[...]` | `os.environ["ECDYSIS_USERNAME"]` | Simpler but splits cred storage away from the existing `[sources.ecdysis]` block; CONTEXT D-1 locks secrets.toml. Use dlt.secrets. |
| magic-bytes guard | Content-Type only | Content-Type can lie on a misconfigured 200; magic-bytes is authoritative. Use both, magic-bytes decisive. |

## Architecture Patterns

### Data Flow
```
load_ecdysis() [run.py STEP 1]
  -> ecdysis_source(dataset_id=44)            # dlt.config.value from config.toml
       -> _download_zip(44)
            |- TTL fast-path? --yes--> return cached bytes
            |- requests.Session()
            |     -> POST /profile/index.php  {login, password, action=login, remember=0}
            |          (PHPSESSID cookie now carries auth rights)
            |     -> POST /collections/download/downloadhandler.php  (existing params, session reused)
            |          -> GUARD: raise_for_status + Content-Type + PK\x03\x04 magic bytes
            |- success: atomic-write cache, return bytes
            |- failure (login/download/guard/network):
                 -> valid cached ZIP? --yes--> WARN + return cached bytes
                                       --no---> raise (hard fail)
  -> occurrences() / identifications() dlt.resource yield from ZIP
```

### Anti-Patterns to Avoid
- **Posting `loginButton`** — that's the decoy header form with no creds. Post `action=login`.
- **Pre-GET for a CSRF token** — there is none; an extra GET is wasted work and a new failure surface.
- **Parsing login HTML for a success string as the primary gate** — brittle. Let the download guard be authoritative.
- **Caching the response before guarding** — would persist a corrupt/JSON "ZIP". Guard BEFORE the atomic write (the recommended structure already does).
- **Catching `Exception` so broadly it swallows the no-cache hard-fail** — re-raise when `_is_valid_cached_zip` is False.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie/session persistence | Manual `Set-Cookie` parsing | `requests.Session()` | Carries PHPSESSID automatically across POSTs |
| ZIP validity check | byte-length heuristics | `zipfile.ZipFile(...).testzip()` | Detects truncated/corrupt members the magic-bytes check misses |
| Secret loading/parsing | hand-roll TOML read | `dlt.secrets["sources.ecdysis.username"]` | Already wired; consistent with `dataset_id` |

## Common Pitfalls

### Pitfall 1: Asserting login success on the wrong response
**What goes wrong:** Test/code parses login HTML for a marker that changes between Symbiota versions → false failures.
**How to avoid:** Make the download response-guard the single source of truth; treat login HTML markers as optional soft checks.

### Pitfall 2: The TTL fast-path masks the new fallback in tests
**What goes wrong:** A test sets up a fresh cache and never exercises the network/fallback path.
**How to avoid:** In fallback tests, set `ECDYSIS_CACHE_TTL_SECONDS=0` (force past the fast-path) so the download is attempted, then make the mocked download fail and assert the stale cache is reused. Monkeypatch `ECDYSIS_CACHE_DIR` to `tmp_path`.

### Pitfall 3: Secrets committed
**What goes wrong:** `data/.dlt/secrets.toml` is NOT gitignored today `[VERIFIED]`; a careless `git add data/.dlt` would commit real creds.
**How to avoid:** Add the gitignore entry as the FIRST task (before any secrets land). Verify `git check-ignore -v data/.dlt/secrets.toml` resolves to a rule.

## Runtime State Inventory

> This is a code-change phase (auth wrapper + guard + fallback), not a rename/migration. But it does introduce on-disk secret state, so:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `data/.ecdysis_cache/44.zip` on maderas (last good ZIP) — the fallback relies on it | None — fallback reuses it; verify it's a valid zipfile |
| Live service config | Symbiota account with dataset-44 rights (operator-held; lives in Ecdysis, not git) | Operator provisions creds into secrets.toml on maderas |
| OS-registered state | None — `data/nightly.sh` cron unchanged | None |
| Secrets/env vars | NEW: `[sources.ecdysis] username/password` in `data/.dlt/secrets.toml` (maderas only). Optional test env: `SOURCES__ECDYSIS__USERNAME/PASSWORD` | Add gitignore entry FIRST; operator writes secrets on maderas |
| Build artifacts | None | None |

## Validation Architecture

> nyquist_validation not explicitly disabled — including.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest >=9.0.2 (+ pytest-randomly) `[VERIFIED: pyproject.toml]` |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_ecdysis_auth.py` |
| Full suite command | `cd data && uv run pytest` |

### Requirements → Test Map (from CONTEXT validation section)
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| (a) login POST sends `login`/`password`/`action=login`/`remember=0` to `/profile/index.php` | unit | `pytest tests/test_ecdysis_auth.py -k login_fields` | ❌ Wave 0 |
| (b) download reuses the authenticated `Session` (same object, login-then-download order) | unit | `pytest ... -k session_reuse` | ❌ Wave 0 |
| (c) JSON/401 body raises (guard: bad magic bytes / json content-type) | unit | `pytest ... -k json_error_raises` | ❌ Wave 0 |
| (d) cache-fallback reuses a valid cached ZIP on download failure, NO network | unit | `pytest ... -k cache_fallback` | ❌ Wave 0 |
| (e) hard-fail when download fails AND no usable cache | unit | `pytest ... -k no_cache_hard_fail` | ❌ Wave 0 |
| Security: secrets.toml gitignored | manual/CI grep | `git check-ignore -v data/.dlt/secrets.toml` | n/a |
| Integration: one real authenticated download → valid ZIP → pipeline through generate-sqlite | manual (maderas) | run `data/nightly.sh` / `uv run python run.py` | n/a |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_ecdysis_auth.py`
- **Per phase gate:** `cd data && uv run pytest` green; `git check-ignore` passes; one manual authenticated download on maderas.

### Wave 0 Gaps
- [ ] `data/tests/test_ecdysis_auth.py` — new file, all 5 unit behaviors above. No conftest change needed (HTTP mocked per-test, Pattern D).
- [ ] Optional `_get_credentials()` helper in `ecdysis_pipeline.py` to make cred injection monkeypatch-clean.

## Security Domain

> `security_enforcement` not disabled — including. This phase handles credentials.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Credentials in gitignored `secrets.toml`; never committed; never logged |
| V6 Cryptography / Secret Mgmt | yes | `dlt.secrets` (no hand-rolled secret parsing); HTTPS-only (`https://ecdysis.org`) |
| V7 Error Handling / Logging | yes | Login failure raises with the server error body but MUST NOT echo the password; ensure the credential value never appears in any `print`/traceback |
| V5 Input Validation | partial | Magic-bytes guard validates the download is a real ZIP, not attacker-controllable content |

### Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Credential leak via commit | Information Disclosure | gitignore secrets.toml BEFORE creds land; `git check-ignore` gate |
| Credential leak via logs/traceback | Information Disclosure | Never include `password` in error strings/prints; log username at most |
| Corrupt/poisoned ZIP cached | Tampering | Guard (magic-bytes + Content-Type) before atomic write; `testzip()` on fallback |
| MITM | Spoofing | HTTPS enforced by the hardcoded `https://` URLs (HSTS header present `[VERIFIED]`) |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `dlt` | secrets read | ✓ | 1.27.2 `[VERIFIED]` | — |
| `requests` | login+download | ✓ | (existing dep) | — |
| pytest + uv | tests | ✓ | pytest 9.x `[VERIFIED]` | — |
| Ecdysis account w/ dataset-44 rights | real download (maderas) | operator-held (D-1) | — | cache-fallback (D-3) covers transient outages, NOT a permanently invalid account |
| Existing `data/.ecdysis_cache/44.zip` on maderas | fallback path | unknown (not on this machine) | — | hard-fail if absent + download fails |

**Missing/at-risk:** the real Ecdysis credentials are not on this research machine, so the *successful* login and the *exact 302-redirect / authenticated-HTML markers* could NOT be verified live (only the anonymous 401 was). See Assumptions Log.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A successful login 302-redirects / the authenticated page lacks the "Sign In" form; download guard is the authoritative success signal | Q2 | LOW — design deliberately does NOT depend on login-HTML markers; the download guard catches a failed login as a 401. Worst case: a soft post-login assertion needs tuning during maderas integration. |
| A2 | dlt env-var override is `SOURCES__ECDYSIS__USERNAME` (double-underscore) | Q3 | LOW — only affects an optional test-injection path; the recommended `_get_credentials` monkeypatch avoids it entirely. |
| A3 | The existing maderas `44.zip` cache is a valid zipfile usable as fallback | Q5 / Env | MEDIUM — if absent/corrupt AND the first real login fails, the nightly hard-fails (acceptable, loud). `_is_valid_cached_zip` detects corruption. |
| A4 | Symbiota honors `action=login` (vs `submitlogin`) as the submit param | Q1 | LOW — the live HTML shows `<button name="action" value="login">` as the real form's submit; `submitlogin`/`loginButton` are not in the credential form. Defensive option: include both `action=login` and a harmless `loginButton=` if integration fails. |

## Open Questions

1. **Exact post-login success markers** — resolvable only with real creds on maderas during the manual integration step. Recommendation: don't gate code on it; rely on the download guard.
2. **Does the account permit automated download under Symbiota ToS?** (FINDINGS Q3) — operator/policy question, not a code unknown. Out of scope to resolve here; flagged for operator.

## Sources

### Primary (HIGH confidence)
- `GET https://ecdysis.org/profile/index.php` (2026-06-24, HTTP 200) — login form structure, fields, no-CSRF, PHPSESSID Set-Cookie
- `POST https://ecdysis.org/collections/download/downloadhandler.php` (2026-06-24, HTTP 401) — confirmed real-401 + `{"error":"Unauthorized access"}` + application/json
- Local `dlt` 1.27.2 — `dlt.secrets["sources.ecdysis.username"]` resolution verified against a temp `.dlt/secrets.toml`
- Codebase: `data/ecdysis_pipeline.py`, `data/run.py`, `data/.dlt/config.toml`, `data/tests/test_resolve_taxon_ids.py` (Pattern D mock), `data/tests/conftest.py`, `data/pyproject.toml`
- `git check-ignore -v data/.dlt/secrets.toml` → no rule (NOT ignored) — confirms the blocking prerequisite is still open

### Secondary (MEDIUM confidence)
- requests `Session` cookie-jar behavior (standard library knowledge, consistent with the live PHPSESSID Set-Cookie)
- ZIP magic bytes `PK\x03\x04` (PKWARE APPNOTE / Python `zipfile`)

## Metadata

**Confidence breakdown:**
- Login form / no-CSRF / submit field: HIGH — fetched live, exact HTML inspected
- 401 shape / guard design: HIGH — reproduced live
- dlt.secrets read: HIGH — executed against dlt 1.27.2
- Post-login success markers: LOW — not verifiable without real creds (design avoids depending on them)
- Cache-fallback / test patterns: HIGH — existing code + Pattern D inventoried

**Research date:** 2026-06-23/24
**Valid until:** ~7 days for the login form (screen-scraping a third-party site is volatile); re-verify the form before implementing if more than a week elapses.
