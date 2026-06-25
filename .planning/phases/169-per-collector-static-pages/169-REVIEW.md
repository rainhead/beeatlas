---
phase: 169-per-collector-static-pages
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - data/collectors_export.py
  - data/tests/test_collectors_export.py
  - data/run.py
  - _data/collectors.js
  - _pages/collector-detail.njk
  - _pages/collectors.njk
  - src/tests/data-collectors.test.ts
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 169: Code Review Report

**Reviewed:** 2026-06-25
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 169 clones the places-pattern to add per-collector static pages. The plumbing (run.py insertion, _data/collectors.js, collectors.njk index, pytest and Vitest test suites) is correct and follows established conventions cleanly. Two blocking defects were found: a wrong-SQL aggregation that causes real collector names to be replaced by `@login` fallbacks for collectors whose rows mix null and non-null `recordedBy` values; and a broken deep-link for the waba_specimen-only collector category, which neither `recordedBy` nor `host_inat_login` to identify. Two warnings round out the findings.

---

## Critical Issues

### CR-01: `display_name` falls back to `@login` for collectors with mixed null/non-null `recordedBy`

**File:** `data/collectors_export.py:35`

**Issue:** The query uses:

```sql
MIN(COALESCE(o.recordedBy, '@' || o.collector_inat_login)) AS display_name
```

`COALESCE` is applied per-row before `MIN`. For a row where `recordedBy IS NULL`, COALESCE yields `'@alice'`. For a row where `recordedBy = 'Alice A'`, COALESCE yields `'Alice A'`. Since `@` (ASCII 64) sorts before any letter character, `MIN(...)` returns `'@alice'` instead of `'Alice A'` whenever a collector has even one NULL `recordedBy` row alongside real-name rows.

Collectors with ecdysis rows typically have non-null `recordedBy`, but their rows may also include waba_sample or checklist rows where `recordedBy IS NULL`. In production these collectors will display as `@login` on the collectors index page.

**Fix:**

```sql
COALESCE(MIN(o.recordedBy), '@' || MIN(o.collector_inat_login)) AS display_name,
```

`MIN(o.recordedBy)` ignores NULLs and returns the minimum non-null name (or NULL if all are null). The outer COALESCE then falls back to `'@' || login` only when ALL rows have `recordedBy IS NULL`. The `MIN(o.collector_inat_login)` is deterministic here because the GROUP BY is on `collector_inat_login`.

### CR-02: Deep-link in `collector-detail.njk` is broken for `waba_specimen`-only collectors

**File:** `_pages/collector-detail.njk:18`

**Issue:** The "View on the atlas" link is:

```nunjucks
<a href="/?collectors={{ collector.recordedBy | urlencode }}:{{ collector.host_inat_login | urlencode }}">
```

For collectors whose only passing rows have `source = 'waba_specimen'` (see `int_combined.sql` ARM 2, lines 150 and 160), both `recordedBy` and `host_inat_login` are `NULL` in the mart. The query (`data/collectors_export.py:36-37`) takes `MIN` of these nullable columns; both remain `NULL` in the JSON. Nunjucks renders `{{ null | urlencode }}` as `""`, producing `/?collectors=:`.

The `url-state.ts` decoder (line 184) discards entries where both decoded parts are empty:

```typescript
if (!recordedBy && !host_inat_login) return [];
```

The result is an empty `selectedCollectors` array, so the filter is vacuous — the map shows ALL occurrences. The page appears to work (no 404, no JS error) but silently shows the wrong data.

**Fix:** Guard the deep-link with a conditional that emits a link only when at least one identifier is available. Also consider using `collector_inat_login` as the authoritative match key in the URL parameter:

```nunjucks
{%- if collector.recordedBy or collector.host_inat_login -%}
<a href="/?collectors={{ collector.recordedBy | urlencode }}:{{ collector.host_inat_login | urlencode }}">View on the atlas →</a>
{%- else -%}
<p class="hint">No atlas link available for this collector.</p>
{%- endif -%}
```

A deeper fix (out of scope for this phase review) would be to add `collector_inat_login` as a third filter axis in url-state.ts so the deep-link can always use `/?collectors=:login` as a reliable fallback.

---

## Warnings

### WR-01: `MIN(o.host_inat_login)` silently picks an arbitrary iNat login for multi-login collectors

**File:** `data/collectors_export.py:37`

**Issue:**

```sql
MIN(o.host_inat_login) AS host_inat_login,
```

A collector may have rows linked to multiple iNat host accounts (e.g., specimen records from different WABA collection events where the host is a different person). `MIN` picks the alphabetically first login. The chosen login is then embedded in the "View on the atlas" deep-link. If it doesn't match the `host_inat_login` value stored on the relevant occurrence rows, the filter will miss some or all of the collector's samples.

**Fix:** For the deep-link, the `recordedBy` field (collector identity) is the primary discriminator, and `host_inat_login` acts as a tiebreaker when `recordedBy` is null. If multiple logins exist, prefer `NULL` over an arbitrary wrong value, or use `host_inat_login` of the row where `collector_inat_login = host_inat_login` (i.e. self-hosted samples):

```sql
MIN(CASE WHEN o.host_inat_login = o.collector_inat_login
         THEN o.host_inat_login END) AS host_inat_login,
```

This is low-severity in practice because the ecdysis `recordedBy` path is dominant for identified collectors, but it can cause silent filter misses for `waba_sample`-only collectors who host under multiple iNat accounts.

### WR-02: `export_collectors_step` double-opens a DuckDB connection; `export_collectors` opens a second one internally when `con` is None

**File:** `data/collectors_export.py:144-150`

**Issue:** The step wrapper correctly passes its connection to `export_collectors`, so there is no actual double-open in the normal code path. However the `if __name__ == "__main__"` path (line 153) calls `export_collectors_step()`, which opens a connection and passes it in — this is correct. But the public `export_collectors(con=None)` also has its own connect/close logic, creating two separate "how to get a connection" paths in the same module. This is unlike `places_export.py`, which has the same split pattern and works fine, so this is a low-risk code smell rather than a crash risk.

The real concern is that `export_collectors_step` closes the connection in `finally` even if `export_collectors` raised mid-query, which is correct. But the split pattern means a future author adding `LOAD spatial` (or similar) to `export_collectors_step` could silently forget to add it to the `con=None` branch as well. `places_export.py` has exactly this divergence: `export_places_step` calls `con.execute("LOAD spatial")`, but `export_places(con=None)` also calls `con.execute("LOAD spatial")` — these two code paths must stay in sync manually.

`collectors_export.py` does not need `LOAD spatial`, so there is no current divergence. Flag for awareness.

**Fix:** No immediate action needed, but document the two-path pattern in the function docstring explicitly, as done for places.

---

## Info

### IN-01: Test fixture does not cover the mixed-null `recordedBy` case that triggers CR-01

**File:** `data/tests/test_collectors_export.py:26-66`

**Issue:** The 'alice' fixture rows have `recordedBy = ['Alice A', 'Alice A']` (both non-null) and the 'bob' fixture has `recordedBy = [None]` (all null). Neither collector exercises the mixed case — a single collector with some null and some non-null `recordedBy` rows — which is the exact scenario that causes the `MIN(COALESCE(...))` bug in CR-01. The test suite passes even with the buggy query.

**Fix:** After applying the CR-01 fix, add a fixture row for 'alice' with `recordedBy = None` (simulating a waba_sample row attributed to the same `collector_inat_login`) and assert that `display_name == 'Alice A'` rather than `'@alice'`.

---

_Reviewed: 2026-06-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
