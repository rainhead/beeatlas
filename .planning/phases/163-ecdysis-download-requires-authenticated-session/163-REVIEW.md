---
phase: 163-ecdysis-download-requires-authenticated-session
reviewed: 2026-06-24T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/ecdysis_pipeline.py
  - data/tests/test_ecdysis_auth.py
  - data/.gitignore
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 163: Code Review Report

**Reviewed:** 2026-06-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This phase wraps the nightly Ecdysis dataset-44 download in an authenticated
Symbiota session login, adds a ZIP response guard, and a cache-fallback for
graceful degradation. The four high-risk areas flagged by the orchestrator were
audited specifically:

- **Credential handling (V7 / T-163-02):** PASSES. The password is read into a
  local variable in `_login_session` and never interpolated into any string. I
  verified empirically that `requests` exception `str()` does not echo the
  request body (so the `({e})` interpolation in the WARNING print and the
  re-raised exception are credential-safe even for login-time timeouts/network
  errors). No leak found in the production code path.
- **Response guard:** Correct ordering — `raise_for_status()` → content-type
  reject → magic-byte check — all run *before* the atomic cache write, so a
  401/JSON body can never be cached as a corrupt ZIP.
- **Cache-fallback try/except:** Functionally correct for the no-cache hard-fail,
  but the `except Exception` is broad enough to **mask a missing-credentials
  misconfiguration** whenever a stale-but-valid cache exists (WR-01). This is the
  most important finding.
- **TTL fast-path / atomic write:** Atomic write preserved. TTL fast-path is
  preserved but no longer validates the cached bytes it returns (WR-02), an
  inconsistency introduced relative to the new fallback path.

No BLOCKER-tier defects found. Four WARNINGs and three INFO items below.

## Warnings

### WR-01: Broad `except Exception` masks missing/invalid-credentials misconfiguration

**File:** `data/ecdysis_pipeline.py:136-159`
**Issue:** `_get_credentials()` uses bracket access on `dlt.secrets` (intentionally,
per its docstring, to "fail loudly" when creds are unprovisioned). But that call
runs *inside* the `try` block via `_login_session(session)` on line 138, and the
resulting `dlt.config.exceptions.ConfigFieldMissingException` (a subclass of
`Exception`) is swallowed by the `except Exception as e` on line 149. When a
valid cache exists, the code silently falls back to the cache (line 153-158) and
returns — so a botched credential rotation on maderas is invisible until the
cache *also* expires/corrupts days later. This directly defeats the "fail loudly
when creds aren't provisioned" intent stated in `_get_credentials`'s own
docstring, and means a misconfiguration can serve stale bee data indefinitely.
**Fix:** Pull credential resolution out of the resilience `try`, so config errors
hard-fail regardless of cache state:
```python
    # Resolve creds BEFORE the resilience try — a missing/invalid secret is a
    # misconfiguration, not a transient download failure, and must hard-fail.
    username, password = _get_credentials()
    try:
        session = requests.Session()
        _login_session(session, username, password)   # pass creds in
        response = session.post(...)
        _assert_zip_response(response)
    except Exception as e:
        ...
```
(Adjust `_login_session` to accept the resolved `(username, password)`.)
Alternatively, narrow the `except` to the network/HTTP/guard exception types
(`requests.RequestException`, `RuntimeError`) so config errors propagate.

### WR-02: TTL fast-path returns cached bytes without validity check (inconsistent with fallback)

**File:** `data/ecdysis_pipeline.py:107-114`
**Issue:** The new fallback path guards cache reuse with `_is_valid_cached_zip()`
(testzip integrity), but the pre-existing TTL fast-path returns
`cache_path.read_bytes()` after only an mtime/existence check — no integrity
validation. If a cache file is truncated/corrupt by any means other than an
interrupted `_download_zip` (e.g. disk-full during a *prior* run's
`tmp_path.write_bytes`, an external `cp`, partial restore), a within-TTL run
hands corrupt bytes straight to `zipfile.ZipFile(io.BytesIO(zip_bytes))` in
`ecdysis_source`, which raises `BadZipFile` and zeroes the nightly — the exact
failure D-3 was meant to prevent. The two cache-read paths should apply the same
integrity bar.
**Fix:** Gate the fast-path on the same validator:
```python
    if (ECDYSIS_CACHE_TTL_SECONDS > 0 and cache_path.exists()
            and _is_valid_cached_zip(cache_path)):
        age = time.time() - cache_path.stat().st_mtime
        if age < ECDYSIS_CACHE_TTL_SECONDS:
            print(...)
            return cache_path.read_bytes()
```

### WR-03: `_assert_zip_response` reads `response.content` for a 2-minute, large ZIP without streaming

**File:** `data/ecdysis_pipeline.py:87, 139-148`
**Issue:** Not a perf finding (out of scope) but a correctness one: the download
POST is made without `stream=True`, so the entire multi-MB ZIP is buffered into
`response.content` before the guard runs. That is fine, but the guard's
`response.content.startswith(_ZIP_MAGIC)` and the content-type branch both assume
`response.content` is populated and decodable as bytes — which holds for real
`requests` responses. However, `_assert_zip_response` runs `raise_for_status()`
*first*, which on a 401 raises `HTTPError` before the body is inspected. That
means a server that returns HTTP 200 with a JSON error body (Symbiota sometimes
returns 200 + `{"error":...}` on soft failures) is the *only* case the
content-type/magic checks actually catch; a 401 is caught by `raise_for_status`.
This is correct, but the guard's docstring ("so a JSON/401 error body is never
cached") overstates: a 401 never reaches the body checks. Confirm the live soft-
failure mode (200 + JSON) is the one observed, or the guard may be checking a case
that doesn't occur while the real case (401) is handled elsewhere.
**Fix:** Either keep as-is (behavior is safe) and correct the docstring to say
"a non-2xx status is rejected by raise_for_status; a 2xx non-ZIP body is rejected
by the content-type/magic checks," or move the content/magic checks before
`raise_for_status()` if you want the body preview included in 401 diagnostics.

### WR-04: `test_password_not_logged` never exercises the WARNING-print fallback path

**File:** `data/tests/test_ecdysis_auth.py:196-208`
**Issue:** The V7 password-leak test (the one named for the requirement) drives
the *no-cache* branch (`_json_401_response` with an empty tmp cache), so it
asserts the password is absent from the **re-raised exception** and stdout — but
the line that actually interpolates the exception, the WARNING `print(... ({e})
...)` on line 154-157 of the pipeline, is on the *cache-present* branch and is
never reached by this test. `test_cache_fallback_reuses_valid_zip` reaches that
print but only asserts `"warn"/"cached"` is present, not that the password is
absent. So the single most credential-sensitive log statement in the diff has no
leak assertion against it.
**Fix:** Add a `monkeypatch.setattr(..., "_get_credentials", lambda: ("u",
"sekret"))` plus a populated valid cache to one fallback-path test, then assert
`"sekret" not in capsys.readouterr().out`. This closes the V7 coverage gap on the
WARNING print specifically:
```python
def test_password_not_logged_on_cache_fallback(_isolate_cache, capsys, monkeypatch):
    monkeypatch.setattr(ecdysis_pipeline, "_get_credentials", lambda: ("u", "sekret"))
    _write_valid_cache(_isolate_cache)
    session = _session_with([_login_response(), _json_401_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)
    captured = capsys.readouterr()
    assert "sekret" not in captured.out and "sekret" not in captured.err
```

## Info

### IN-01: `remember: "0"` field value is a magic string with no explanation

**File:** `data/ecdysis_pipeline.py:70`
**Issue:** The `"remember": "0"` form field is included without a comment. Since
the surrounding comment block documents `login`/`action` provenance ("verified
live"), the silent `remember` field reads as cargo-culted. If the live form omits
it or expects a different value, this is a latent breakage point.
**Fix:** Add a one-line comment noting `remember=0` means "no persistent cookie"
and that it was part of the verified live form, or drop it if the server ignores it.

### IN-02: Atomic temp suffix produces double extension `.zip.tmp` via `with_suffix`

**File:** `data/ecdysis_pipeline.py:163`
**Issue:** `cache_path.with_suffix(".zip.tmp")` on `44.zip` yields `44.zip.tmp`
only because `with_suffix` replaces the existing `.zip` with the literal string
`.zip.tmp`. This works, but it is a fragile idiom — `with_suffix` is meant to
take a single suffix and would raise `ValueError` if the argument contained a path
separator. Clearer intent is `cache_path.with_name(cache_path.name + ".tmp")`.
Also note `*.tmp` is not in `data/.gitignore` (only `*.zip` is); a temp file left
behind by a crash between `write_bytes` and `replace` is `44.zip.tmp`, which `*.zip`
does NOT match and would show as untracked.
**Fix:** Use `cache_path.with_name(cache_path.name + ".tmp")` and add `*.tmp` (or
`.ecdysis_cache/` is already ignored on line 12 — confirm temp files land there;
they do, since `tmp_path` is under `ECDYSIS_CACHE_DIR`). No gitignore change needed
if the cache dir is ignored, but the `with_suffix` idiom is still worth replacing.

### IN-03: `_login_session` makes a POST whose response is entirely discarded

**File:** `data/ecdysis_pipeline.py:64-74`
**Issue:** The login POST's return value is dropped, and the design intentionally
does not gate on it (the download guard is the success signal). This is documented,
so it is acceptable — but a non-2xx login response (e.g. 500 from Symbiota) is
silently ignored here and only surfaces as a confusing "download is not a ZIP"
error two calls later, obscuring the real root cause (login failed). Consider a
`response.raise_for_status()` on the login POST so an auth-endpoint outage produces
a clear, on-point error. (The credential-safety of `raise_for_status` was verified:
its message contains only status + URL, never the body.)
**Fix:** Optionally add `resp = session.post(...); resp.raise_for_status()` in
`_login_session` for clearer failure attribution; the download guard still remains
the authoritative success signal.

---

_Reviewed: 2026-06-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
