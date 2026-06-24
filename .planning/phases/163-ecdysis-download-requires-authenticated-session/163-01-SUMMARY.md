---
phase: 163-ecdysis-download-requires-authenticated-session
plan: 01
subsystem: data-pipeline
tags: [ecdysis, symbiota, requests-session, dlt, authentication, zip-guard, cache-fallback]

# Dependency graph
requires:
  - phase: prior-ecdysis-ingestion
    provides: "data/ecdysis_pipeline.py _download_zip with TTL fast-path + atomic write + .ecdysis_cache"
provides:
  - "Authenticated Symbiota session login for the nightly Ecdysis dataset-44 download (D-2)"
  - "Response guard (PK magic-bytes + Content-Type) that refuses to cache a JSON/401 body as a corrupt ZIP (D-2)"
  - "Cache-fallback resilience: a valid cached ZIP is reused (warn) on any failure; hard-fail only with no usable cache (D-3)"
  - "data/.dlt/secrets.toml gitignore rule so credentials cannot be committed (D-1)"
affects: [nightly-pipeline, ecdysis-ingestion, run.py-step-1]

# Tech tracking
tech-stack:
  added: []  # no new deps — requests/dlt/zipfile/pytest all already present
  patterns:
    - "Authenticated requests.Session reused across login + download POSTs (PHPSESSID carried)"
    - "Untrusted-response guard runs INSIDE try, BEFORE the atomic write"
    - "Standalone _get_credentials() seam for test monkeypatching instead of touching dlt.secrets"

key-files:
  created:
    - "data/tests/test_ecdysis_auth.py"
  modified:
    - "data/.gitignore"
    - "data/ecdysis_pipeline.py"

key-decisions:
  - "Login form is action=login with field `login` for username (NOT loginButton/username decoy); NO CSRF token, NO pre-GET — live-verified in RESEARCH"
  - "Download-response guard, not login-HTML parsing, is the authoritative auth-success signal (RESEARCH Q2)"
  - "publicsearch=1 download params left UNCHANGED; only the session is now authenticated"
  - "Password never interpolated into any print/exception/traceback (V7); password_not_logged test enforces it"

patterns-established:
  - "Pattern: magic-bytes (PK\\x03\\x04) + Content-Type guard as the gate before any cache write"
  - "Pattern: _is_valid_cached_zip via zipfile.ZipFile(path).testzip() is None for fallback validation"

requirements-completed: [D-1, D-2, D-3]

# Metrics
duration: ~2min impl + manual maderas UAT
completed: 2026-06-24
---

# Phase 163: Ecdysis Download Requires Authenticated Session — Summary

**The nightly Ecdysis dataset-44 download now authenticates a Symbiota session, guards the response against JSON/401 bodies, and degrades to a valid cached ZIP on failure — restoring `run.py` STEP 1, which had been 401-ing and staleness-blocking every nightly.**

## Performance

- **Duration:** ~2 min implementation (Tasks 1–2); manual maderas integration (Task 3) spanned a credential reset
- **Started:** 2026-06-23 22:37 PDT
- **Completed:** 2026-06-24 (Task 3 approved after fresh authenticated download verified on maderas)
- **Tasks:** 3 (2 automated + 1 human-action checkpoint)
- **Files modified:** 3

## Accomplishments
- **D-2 (auth):** `_download_zip` builds a `requests.Session()`, POSTs the real credential login form to `/profile/index.php` (`login`/`password`/`action=login`/`remember`), and reuses the same PHPSESSID-bearing session for the `downloadhandler.php` POST.
- **D-2 (guard):** `_assert_zip_response` runs `raise_for_status` → Content-Type check → `PK\x03\x04` magic-bytes inside the try, before the atomic write, so a 401/JSON body is never cached as a corrupt ZIP.
- **D-3 (resilience):** `_is_valid_cached_zip` + try/except fall back to a warn-and-reuse of a valid cached ZIP on any login/download/guard/network failure; re-raise (hard-fail) only when no usable cache exists. **This fired correctly in production** during the UAT — the 401 from a dead password degraded gracefully instead of aborting the nightly.
- **D-1 (security):** `data/.gitignore:4` (`.dlt/secrets.toml`) lands before any credential touches disk; `git check-ignore -v data/.dlt/secrets.toml` resolves to it (exit 0).
- **V7:** the password value never appears in any print/exception/traceback (`password_not_logged` test enforces it).
- TTL fast-path, atomic tmp-write+replace, and `ECDYSIS_CACHE_TTL_SECONDS=0` force-refresh semantics preserved unchanged.

## Task Commits

1. **Task 1: Wave-0 security prereq + 6 RED fast-tier tests** — `2539287d` (test)
2. **Task 2: Implement auth login + response guard + cache-fallback (GREEN)** — `968cc34f` (feat)
3. **Task 3: Manual maderas integration** — human-action checkpoint, approved after live verification (no code commit)

TDD gate sequence intact: `test(163-01)` RED → `feat(163-01)` GREEN; REFACTOR not needed.

## Files Created/Modified
- `data/.gitignore` — added `.dlt/secrets.toml` rule (D-1 credential-commit guard)
- `data/ecdysis_pipeline.py` — four new helpers (`_get_credentials`, `_login_session`, `_assert_zip_response`, `_is_valid_cached_zip`) + rewired `_download_zip`
- `data/tests/test_ecdysis_auth.py` — 6 fast-tier behaviors (`login_fields`, `session_reuse`, `json_error_raises`, `cache_fallback`, `no_cache_hard_fail`, `password_not_logged`), HTTP mocked per Pattern D

## Post-Review Hardening (commit `c3da5c11`)
Code review (`163-REVIEW.md`: 0 critical, 4 warnings) surfaced two warnings fixed by operator decision:
- **WR-01:** credential resolution hoisted OUT of the resilience `try` in `_download_zip`, so a missing/misprovisioned credential now fails loudly instead of being silently masked by the cache-fallback when a stale cache exists — the exact silent-staleness trap D-3 is meant to avoid (made concrete by the live credential-expiry detour). `_login_session` now takes `(username, password)` from the caller.
- **WR-04:** added `test_password_not_logged_on_fallback_warning` to pin password-absence on the WARNING-print fallback branch (which interpolates the failure `{e}`) — the hard-fail-branch test did not reach that line.
- WR-02 (integrity-check the pre-existing TTL fast-path), WR-03, IN-01..03 deferred (out of scope / cosmetic).

## Verification
- `cd data && uv run pytest tests/test_ecdysis_auth.py` → 7 passed (6 original + WR-04 fallback-warning test; all GREEN)
- `cd data && uv run pytest` → 243 passed, 9 skipped — no regressions
- `git check-ignore -v data/.dlt/secrets.toml` → resolves to `data/.gitignore:4` (T-163-01 mitigated)
- **Manual maderas integration (Task 3):** a fresh authenticated download fetched a valid `data/.ecdysis_cache/44.zip`, the dlt load completed (`LOADED, no failed jobs`), `run.py` ran through `generate-sqlite`, and the `nightly.sh` integration gate (`pytest -m integration`) passed.

## Notable Deviations / Findings
- **Root cause was (also) an expired credential, not solely the upstream-breaking-change the ROADMAP hypothesized.** The ROADMAP framed the 401 as the public/anonymous download path being closed. During the maderas UAT the authenticated download *still* 401'd — until the operator reset the dead Symbiota account password, after which the authenticated download succeeded immediately. The authenticated-session fix remains the correct durable solution (the anonymous path is genuinely gone), but the proximate UAT blocker was a stale password.
- **dlt pending-load-package gotcha:** the first interrupted UAT run (Ctrl-C during the cache-fallback dlt drain) left a pending load package; the next `load_ecdysis()` invocation flushed that package and **skipped extraction** (dlt warned "data ... will not be extracted"). A second clean run was required to actually exercise the auth/download path. Worth remembering for future manual pipeline UATs.
- **Login-form tuning was NOT needed** — RESEARCH's live-verified form (`action=login`, field `login`, no CSRF, no `loginButton`) authenticated correctly once the password was valid; the RESEARCH A4 `loginButton=` defensive fallback was not required.
