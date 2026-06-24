---
phase: 163-ecdysis-download-requires-authenticated-session
verified: 2026-06-24T00:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 163: Ecdysis Download Requires Authenticated Session — Verification Report

**Phase Goal:** The nightly Ecdysis ingestion fetches dataset 44 again over an authenticated Symbiota session (the anonymous publicsearch=1 path now 401s), resists a future outage via cache-fallback, and stores credentials safely. ecdysis is run.py STEP 1, so this unblocks every nightly.

**Verified:** 2026-06-24T00:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                 | Status     | Evidence                                                                                                                                                              |
|----|-----------------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Nightly download authenticates a Symbiota session before fetching dataset 44 (D-2)                                   | VERIFIED   | `_login_session` POSTs `{login, password, action=login, remember}` to `ECDYSIS_LOGIN_URL`; `_download_zip` reuses same `requests.Session` for download POST (ll.65,145) |
| 2  | JSON/401 download body raises loudly and is NEVER written to the ZIP cache (D-2 guard)                                | VERIFIED   | `_assert_zip_response` runs `raise_for_status()` → Content-Type check → `PK\x03\x04` magic-bytes check, all inside `try` BEFORE the atomic write (ll.78-93, 154)      |
| 3  | On any login/download/guard/network failure, a valid cached ZIP is reused with a warning (D-3)                        | VERIFIED   | `except Exception as e` → `_is_valid_cached_zip(cache_path)` → `print WARNING` → `return cache_path.read_bytes()` (ll.155-164); `test_cache_fallback_reuses_valid_zip` PASS |
| 4  | With no usable cache AND a failed download, the pipeline hard-fails loudly (D-3)                                      | VERIFIED   | `raise` on l.165 when `_is_valid_cached_zip` returns False; `test_no_cache_hard_fail` PASS                                                                            |
| 5  | data/.dlt/secrets.toml cannot be committed — gitignore resolves to a rule (D-1)                                       | VERIFIED   | `git check-ignore -v data/.dlt/secrets.toml` → `data/.gitignore:4:.dlt/secrets.toml` (exit 0); comment on l.2-4 documents rationale                                  |
| 6  | Password value never appears in any error string, print, or traceback (V7)                                            | VERIFIED   | `password` variable only assigned on l.141 and passed to `_login_session` on l.144; never interpolated into any f-string, print, or exception; `test_password_not_logged` + `test_password_not_logged_on_fallback_warning` both PASS |
| 7  | Existing TTL fast-path, atomic-write, and ECDYSIS_CACHE_TTL_SECONDS=0 force-refresh semantics are preserved unchanged | VERIFIED   | TTL fast-path intact ll.108-115; atomic `tmp_path.write_bytes` + `tmp_path.replace(cache_path)` intact ll.169-171; `ECDYSIS_CACHE_TTL_SECONDS` referenced 4 times     |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                              | Expected                                                          | Status   | Details                                                                 |
|---------------------------------------|-------------------------------------------------------------------|----------|-------------------------------------------------------------------------|
| `data/.gitignore`                     | Rule covering `.dlt/secrets.toml`                                 | VERIFIED | Line 4: `.dlt/secrets.toml` with credential-safety comment; `git check-ignore` exit 0 |
| `data/ecdysis_pipeline.py`            | Four new helpers + rewired `_download_zip`                        | VERIFIED | `_get_credentials` (l.43), `_login_session` (l.56), `_assert_zip_response` (l.78), `_is_valid_cached_zip` (l.95) all defined; `_download_zip` wired to all four |
| `data/tests/test_ecdysis_auth.py`     | 7 fast-tier unit tests (6 original + WR-04), HTTP mocked          | VERIFIED | 7 test functions, all PASS in 0.58s; no `@pytest.mark.integration`; Pattern D boundary mock present |

### Key Link Verification

| From                                      | To                                                    | Via                                            | Status   | Details                                                           |
|-------------------------------------------|-------------------------------------------------------|------------------------------------------------|----------|-------------------------------------------------------------------|
| `_download_zip` → login                   | `https://ecdysis.org/profile/index.php`               | `session.post` l.65                            | VERIFIED | `_login_session` POSTs to `ECDYSIS_LOGIN_URL`; confirmed by `test_login_fields_posted_to_profile_index` |
| `_download_zip` → download                | `https://ecdysis.org/collections/download/downloadhandler.php` | `session.post` l.145 (same Session) | VERIFIED | Same `session` object reused; `test_session_reuse_for_download` asserts both call order and URL |
| `_get_credentials` → `data/.dlt/secrets.toml` | `dlt.secrets["sources.ecdysis.username"/".password"]` | bracket access ll.51-52                    | VERIFIED | Uses `dlt.secrets[...]` bracket access (not `.get`), per D-1 intent to fail loudly on missing creds |
| `data/tests/test_ecdysis_auth.py`         | `data/ecdysis_pipeline.py`                            | `import ecdysis_pipeline` + `patch.object`    | VERIFIED | `import ecdysis_pipeline` on l.32; `patch.object(ecdysis_pipeline.requests, "Session", ...)` throughout |

### Post-Review Hardening (WR-01)

The REVIEW flagged that `_get_credentials()` was called inside the resilience `try`, allowing a misconfigured credential to be silently masked by the cache-fallback. This was fixed in commit `c3da5c11`: credential resolution (`username, password = _get_credentials()`) now occurs on l.141, BEFORE the `try` block at l.142. A misprovisioned credential now hard-fails regardless of cache state.

### Behavioral Spot-Checks

| Behavior                                   | Command                                                          | Result            | Status |
|--------------------------------------------|------------------------------------------------------------------|-------------------|--------|
| 7 fast-tier tests pass                     | `cd data && uv run pytest tests/test_ecdysis_auth.py -q`        | 7 passed in 0.58s | PASS   |
| `git check-ignore` resolves secrets.toml   | `git check-ignore -v data/.dlt/secrets.toml`                    | exit 0, line 4    | PASS   |

### Requirements Coverage

| Requirement | Description                                                              | Status    | Evidence                                                                                 |
|-------------|--------------------------------------------------------------------------|-----------|------------------------------------------------------------------------------------------|
| D-1         | Credentials in `.dlt/secrets.toml`, gitignored, never committed          | SATISFIED | `.gitignore:4` rule; `git check-ignore` exit 0; `dlt.secrets` bracket access in `_get_credentials` |
| D-2         | Authenticated session login + response guard (PK magic-bytes)            | SATISFIED | `_login_session` + `_assert_zip_response`; `session.post` reused; tests `login_fields`, `session_reuse`, `json_error_raises` all PASS |
| D-3         | Cache-fallback on failure; hard-fail with no usable cache                | SATISFIED | `_is_valid_cached_zip` + `except` branch; tests `cache_fallback`, `no_cache_hard_fail` PASS |

### Anti-Patterns Found

None. No TBD/FIXME/XXX markers in modified files. No stub patterns. The `password` variable is passed to `_login_session` as a function argument and placed only into the `data=` dict of the POST — it never flows to any print, f-string, or exception message. The WR-04 test pins this for the WARNING fallback branch specifically.

### Human Verification Required

None. Task 3 (manual maderas integration) was completed by the operator prior to this verification: a real authenticated download fetched a valid `44.zip`, the dlt load completed (`LOADED, no failed jobs`), and `run.py` ran through `generate-sqlite`. This is documented in the SUMMARY's Notable Deviations section (the UAT also exercised the cache-fallback when an expired password 401'd, confirming D-3 in production). No further human verification is needed.

### Gaps Summary

No gaps. All 7 must-have truths are verified in the codebase with direct code evidence and confirmed by the test suite. The post-review WR-01 fix (credentials resolved before the resilience try) and WR-04 addition (fallback-branch password-absence test) are both present and wired correctly.

---

_Verified: 2026-06-24T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
