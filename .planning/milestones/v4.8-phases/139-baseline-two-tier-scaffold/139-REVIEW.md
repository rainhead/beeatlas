---
phase: 139-baseline-two-tier-scaffold
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/pyproject.toml
  - data/tests/test_checklist_pipeline.py
  - data/tests/BASELINE.md
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 139: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This phase adds an `integration` pytest marker, default-deselects it via `addopts`, tags two existing dataset-validation tests, and commits a living BASELINE.md doc. The two-tier mechanism is functionally correct on the Linux target platform — the marker is registered without `PytestUnknownMarkWarning`, default collection excludes the two tagged tests (261/263 collected), and `-m integration` selects exactly them. No application logic was changed. Two issues found: one documentation inaccuracy in BASELINE.md that misrepresents the actual addopts quoting, and one latent portability issue with single-quoted addopts that has no practical impact on this Linux-only project.

## Warnings

### WR-01: BASELINE.md misquotes the actual `addopts` value

**File:** `data/tests/BASELINE.md:18`
**Issue:** The Implementation note reads:

> `addopts = -m "not integration"` in `data/pyproject.toml`

The actual TOML line is:

```toml
addopts = "-m 'not integration'"
```

The quotes are reversed: in the doc, outer unquoted `-m` and inner double-quotes; in the file, outer double-quotes (TOML string delimiters) and inner single-quotes (passed to pytest). Any developer who reads this doc and tries to reproduce or extend the config by copying the documented form will be confused, because the TOML form `addopts = -m "not integration"` is a syntax error (bare `-m` is not a valid TOML value).

**Fix:** Change line 18 in BASELINE.md to reflect the actual TOML syntax:

```markdown
**Implementation:** `addopts = "-m 'not integration'"` in `data/pyproject.toml` deselects the integration tier by default.
```

## Info

### IN-01: `addopts` single-quoted marker expression is not portable to Windows

**File:** `data/pyproject.toml:27`
**Issue:** The value `"-m 'not integration'"` embeds single quotes that are passed literally to pytest's `shlex`-based addopts parser. On Linux/macOS, `shlex.split` strips the single quotes as shell-quoting and passes `-m` `not integration` correctly. On Windows, `shlex.split` does not treat single quotes as shell quotes by default; the `-m` argument would receive `'not integration'` with literal quote characters, causing pytest to fail to match the marker expression. The TOML-idiomatic alternative avoids the ambiguity:

```toml
addopts = "-m 'not integration'"   # current — works on Linux, fragile on Windows
```

vs

```toml
addopts = ["-m", "not integration"]  # array form — unambiguous on all platforms
```

**Impact:** None in practice. This project targets Linux only (maderas cron + static hosting; no Windows CI). Flagged as Info because a future contributor running on Windows would see confusing failures, not a pytest configuration error message.

**Fix:** If Windows portability is ever desired, switch to the array form:

```toml
addopts = ["-m", "not integration"]
```

This separates the flag from the expression at the TOML level rather than relying on shell-quote parsing.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
