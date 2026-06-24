# Phase 163: Ecdysis download requires an authenticated session — Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Operator decisions (AskUserQuestion) + `163-FINDINGS.md` fix design

<domain>
## Phase Boundary

Ecdysis/Symbiota's bulk-download endpoint (`downloadhandler.php`) now returns
`401 {"error":"Unauthorized access"}` to anonymous `publicsearch=1` requests
(reproduced via curl 2026-06-24). The pipeline's Ecdysis ingestion was **always
anonymous** — this is an **upstream breaking change**, not an expired credential.
`ecdysis` is `run.py` STEP 1, so **every nightly fails at the start** until fixed,
and production data (S3) goes stale.

**This phase delivers:** an authenticated Symbiota session for the Ecdysis
download so the nightly pipeline can fetch dataset 44 again, plus cache-fallback
resilience so a future Ecdysis outage degrades gracefully instead of zeroing out
the nightly.

**In scope:**
- Authenticated login flow in `data/ecdysis_pipeline.py` (`_download_zip`).
- Credential storage in `data/.dlt/secrets.toml` (gitignored) on maderas.
- Loud failure when the download returns JSON instead of a ZIP.
- Cache-fallback resilience (reuse a valid cached ZIP on download failure).
- Unit tests (mocked session).

**Out of scope:**
- Contacting Ecdysis for restored public access / a sanctioned API (deferred —
  see Deferred Ideas; the scraper is the chosen unblock).
- Any change to `ecdysis_links` HTML scraping (separate, still-public path).
- CI/deploy changes — `.github/workflows/deploy.yml` only pulls finished
  artifacts from S3 and never calls Ecdysis.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Account / credentials (D-1)
- **An Ecdysis/Symbiota account with dataset-44 download rights is available**
  (operator confirmed). The hard blocker from `163-FINDINGS.md` Q1 is cleared.
- Credentials live in `data/.dlt/secrets.toml` under `[sources.ecdysis]`
  (`username` / `password`), alongside the existing `data/.dlt/config.toml`
  `[sources.ecdysis] dataset_id = 44`. The operator places the real secrets on
  maderas; they are NEVER committed.
- **BLOCKING PREREQUISITE (security):** `data/.dlt/secrets.toml` is currently
  **NOT gitignored** (`git check-ignore` returns nothing). A gitignore entry
  covering `data/.dlt/secrets.toml` (or `**/.dlt/secrets.toml`) MUST be added
  **before** any credentials land on disk. Verify with `git check-ignore -v`.

### Approach (D-2)
- **Authenticated-session scraper** (operator choice). Implement the Symbiota
  login → `PHPSESSID` → reuse-for-download flow per `163-FINDINGS.md`:
  1. Build a `requests.Session()`.
  2. GET `https://ecdysis.org/profile/index.php` first if `loginForm` carries a
     hidden CSRF/anti-forgery token (verify against the live form — research).
  3. POST to `/profile/index.php` with `login` / `password` (+ correct submit
     field name — `loginButton` vs `submitlogin`, verify live).
  4. Reuse the **same session** for the existing `downloadhandler.php` POST
     (move `requests.post(...)` → `session.post(...)`).
  5. Guard the response: assert it is a ZIP (not `application/json`); on a JSON
     `{"error":…}` body, raise loudly so failures aren't silently cached as a
     corrupt ZIP.
- Accept the brittleness risk of screen-scraping a login (field names, CSRF,
  redirects). Mitigate with the loud-failure guard above.

### Resilience (D-3)
- **Cache-fallback on download failure.** On any Ecdysis login/download failure,
  if a valid (non-empty, parseable) cached ZIP exists at
  `data/.ecdysis_cache/<dataset_id>.zip`, **warn and reuse it** rather than
  aborting the nightly. Only hard-fail when there is no usable cache.
- This is independent of the existing TTL fast-path (which reuses the cache
  when fresh). The new path is the *failure* fallback: TTL expired → attempt
  authenticated download → on failure, fall back to the stale cache with a
  warning instead of raising.

### Credential reading (Claude's Discretion)
- `_download_zip` is a plain helper (not a `@dlt.resource`), so it can't use
  `dlt.config.value` injection directly. Read creds via `dlt.secrets[...]`
  (e.g. `dlt.secrets["sources.ecdysis.username"]`) or `os.environ`, whichever is
  cleanest and testable. Planner/executor decide.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline code
- `data/ecdysis_pipeline.py` — `_download_zip()` (lines ~32-79) is the anonymous
  POST to patch; `ECDYSIS_CACHE_DIR` / `ECDYSIS_CACHE_TTL_SECONDS` (lines ~25-29)
  define the cache; `ecdysis_source()` / `load_ecdysis` is the entry point.
- `data/run.py` — `STEPS` list; `("ecdysis", load_ecdysis)` is STEP 1 (line ~89).
- `data/.dlt/config.toml` — `[sources.ecdysis] dataset_id = 44`; secrets.toml is
  the sibling file dlt auto-loads `[sources.ecdysis]` secrets from.
- `data/nightly.sh` — the sole nightly entry point on maderas (NVM, git pull,
  S3 pull/push, runs `run.py`). The `ECDYSIS_CACHE_TTL_SECONDS=99999999` unblock
  is run through this.

### Design / requirements
- `163-FINDINGS.md` (this phase dir) — full fix design, login-form probe results,
  validation plan, and the decoupled immediate-unblock recipe.

### Tests
- `data/tests/test_transforms.py` — existing ecdysis unit test pattern
  (imports `_extract_inat_id` from `ecdysis_pipeline`). New tests for the auth
  flow + cache fallback should follow the two-tier pytest convention (fast tier;
  network mocked — see CLAUDE.md "Known State" on the v4.8 test tiers).
</canonical_refs>

<specifics>
## Specific Ideas

- The 401 returns a fresh `Set-Cookie: PHPSESSID` + a clean JSON body — that
  combination is the tell that a logged-in session is now expected.
- Keep `User-Agent` and the existing `params` payload unchanged on the download
  POST; only the session/auth wrapper and response-type guard are new.
- The download guard should distinguish three outcomes: ZIP (success), JSON error
  (auth/permission failure → raise unless cache-fallback applies), network error
  (→ cache-fallback).
</specifics>

<deferred>
## Deferred Ideas

- **Contact Ecdysis** about whether public download was intentionally removed and
  whether they can restore it or provide an API key / sanctioned DwC-A endpoint
  for dataset 44. Preferred long-term (retires the scraper) but NOT this phase —
  operator chose the scraper as the immediate unblock.
- Nightly-pipeline automation of credential rotation / login-failure alerting.
</deferred>

<validation>
## Validation (for the plan)

- **Unit (fast tier, network mocked):** (a) login POST is sent with the right
  fields; (b) the download reuses the authenticated session; (c) a JSON 401
  body raises; (d) cache-fallback reuses a valid cached ZIP on download failure
  with no network; (e) hard-fail when download fails AND no usable cache.
- **Security:** `git check-ignore -v data/.dlt/secrets.toml` resolves to a
  gitignore rule (secrets cannot be committed).
- **Integration (maderas, manual):** one real authenticated download yields a
  valid ZIP and the pipeline completes through `generate-sqlite`.
</validation>

---

*Phase: 163-ecdysis-download-requires-authenticated-session*
*Context gathered: 2026-06-23 via operator decisions + 163-FINDINGS.md*
