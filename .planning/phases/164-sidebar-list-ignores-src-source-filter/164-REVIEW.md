---
phase: 164-sidebar-list-ignores-src-source-filter
reviewed: 2026-06-24T18:18:11Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/filter.ts
  - src/url-state.ts
  - src/bee-atlas.ts
  - src/bee-map.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: resolved
resolution:
  WR-01: fixed (commit 00423df3 — src=none sentinel round-trips the all-off state; all-bogus src= now treated as no filter)
  WR-02: accepted — no code change; the ghost layer collapses to empty via the idempotent double-filter (D-04 analysis). Flagged for manual UAT (confirm no ghost dots/flicker on a source-only toggle).
  WR-03: fixed (commit 00423df3 — empty CSV name segments collapse to the -all- form)
  IN-01: deferred — dead ui.hiddenSources fallback; url-state tests still assert result.ui.hiddenSources, so removal is a follow-up cleanup.
  IN-02: deferred — centralizing VALID_SOURCES risks a url-state↔filter circular import; fold into the planned multi-state refactor.
---

# Phase 164: Code Review Report

**Reviewed:** 2026-06-24T18:18:11Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 164 promotes the source filter from a standalone `_hiddenSources` field into
`FilterState.hiddenSources` and folds it into `buildFilterSQL`, so the sidebar list,
count, CSV, and table now honor the `src=` filter the map already respected.

The core work is sound and well-tested:

- **SQL safety (T-164-SQL): clean.** The new source predicate in `buildFilterSQL`
  (`src/filter.ts:393-403`) interpolates ONLY tokens from the hardcoded local
  `VALID_SOURCES` allowlist, computed as the complement of `f.hiddenSources`. No
  user-supplied `src=` value ever reaches the SQL string — `parseParams`
  (`src/url-state.ts:236-242`) drops unknown tokens against `VALID_SOURCES` before
  they enter state. The `o.source` alias invariant is preserved. No injection vector.
- **All-off (D-05): correct in SQL.** All 4 hidden → `visibleSources.length === 0`
  → emits `1 = 0` (honest zero), with a unit test asserting it (`filter.test.ts:338`).
- **State migration: correct.** `_onSourceFilterChanged` now re-runs all three queries
  (the original bug), `_onFilterChanged` preserves `hiddenSources` (`bee-atlas.ts:1542`),
  both URL-restore paths and both render bindings were updated, and the initial
  `replaceState` includes `hiddenSources` (`bee-atlas.ts:691`).
- **Map mechanism (D-04): effectively unchanged.** `_visibleBySource`, clustering, and
  the ghost layer are untouched; the only bee-map.ts change is the required
  `hiddenSources: new Set()` default-literal addition.

Findings below are edge-case robustness issues, not correctness blockers. The most
material is the URL round-trip asymmetry for the all-off state (WR-01).

## Warnings

### WR-01: All-sources-hidden state is lost across a URL round-trip / reload / share

**File:** `src/url-state.ts:94-97`
**Issue:** `buildParams` only emits `src=` when at least one source is *visible*:

```ts
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  const visibleSources = [...VALID_SOURCES].filter(s => !ui.hiddenSources!.has(s)).sort();
  if (visibleSources.length > 0) params.set('src', visibleSources.join(','));
}
```

When all 4 sources are hidden (`visibleSources.length === 0`), NO `src=` param is
written. On reload/share, `parseParams` sees no `src=` → `hiddenSources` stays
`undefined` → every source is shown. So the D-05 "honest empty" all-off state silently
flips to "show all" across any URL round-trip.

This serialization gap predates Phase 164 (the `buildParams` block is unchanged in the
diff), but Phase 164 is what made all-off a meaningful, persistent in-session state for
the list/count/CSV/table. The result is a new, user-visible inconsistency: in-session
all-off shows zero rows everywhere, but reloading the same URL shows everything. A
shared "I filtered to nothing" link does not reproduce.

**Fix:** Serialize the all-off case explicitly. Emit a sentinel that `parseParams`
recognizes as "all hidden," e.g. `src=none`:

```ts
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  const visibleSources = [...VALID_SOURCES].filter(s => !ui.hiddenSources!.has(s)).sort();
  params.set('src', visibleSources.length > 0 ? visibleSources.join(',') : 'none');
}
```

And in `parseParams`, treat `src=none` (or an empty visible set) as all-hidden:

```ts
if (srcRaw === 'none') {
  hiddenSources = new Set([...VALID_SOURCES]);
} else if (srcRaw) {
  const visible = new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s as SourceKey)) as SourceKey[]);
  const hidden = new Set([...VALID_SOURCES].filter(s => !visible.has(s)));
  hiddenSources = hidden.size > 0 ? hidden : undefined;
}
```

Note the existing parse path also silently coerces a `src=` with all-bogus tokens (e.g.
`src=bogus`) into "all sources hidden" (visible=∅ → hidden=all 4) — which, given the
buildParams gap, can never be produced by the app but IS reachable via a crafted URL.
A `src=none` sentinel makes the all-off intent explicit and removes that ambiguity.

### WR-02: Source-only filter now activates the ghost-layer machinery on the map (behavior change vs. D-04 intent)

**File:** `src/bee-atlas.ts:756-762`, `src/bee-map.ts:602-628`
**Issue:** Adding `hiddenSources.size > 0` to `isFilterActive` (`filter.ts:260`) changes
the map render path for a *source-only* selection. Before Phase 164, a source-only
state left `isFilterActive` false → `intendedFilterActive` false → the map rendered
`_visibleBySource(_fullGeoJSON)` (full set minus hidden sources) and no ghost layer.
After Phase 164, source-only makes `isFilterActive` true → `intendedFilterActive` true →
`_runFilterQuery` runs the SQL query and `_applyVisibleIds` takes the
`intendedFilterActive` branch, which renders the active set AND computes a ghost layer
(`_fullGeoJSON` minus `visibleIds`).

In practice the visual result is preserved: the ghost features are exactly the
hidden-source points, and `_visibleBySource` (applied at `bee-map.ts:614`) filters them
back out, so the ghost layer ends up empty. The net pixels are the same. But the map now
runs an extra SQL query and the full ghost-diff computation for what used to be a
pure client-side filter — and the phase's stated intent (D-04) was that the map's
source-filtering mechanism stays untouched. This is a path change, not a no-op.

**Fix:** No code change strictly required (the double-filter is idempotent and the ghost
collapses to empty). Recommend confirming via UAT that a source-only toggle on the map
produces no greyed-out ghost dots and no flicker, and documenting that source-only now
flows through the SQL/ghost path so the next reader doesn't assume the legacy
client-side-only path. If UAT shows ghost dots for hidden sources, treat as a BLOCKER and
gate the ghost computation on a non-source filter being present.

### WR-03: `buildCsvFilename` yields a malformed double-dash name for a source-only filter

**File:** `src/filter.ts:130-173`
**Issue:** For a filter where only `hiddenSources` is set, `isFilterActive(f)` is now
true (line 132 no longer short-circuits to `occurrences-all-<date>.csv`), but none of the
segment branches (taxon / collector / year / county / ecoregion) match `hiddenSources`.
`segments` stays empty, so `segments.join('-')` is `''` and the filename is
`occurrences--20260624.csv` (double dash, empty middle segment).

Not a data-loss bug — the CSV still downloads and the rows are correctly source-filtered —
but the filename is cosmetically broken and no longer matches the `occurrences-all-`
convention used for the unfiltered export.

**Fix:** Either add a source segment, or collapse empty-segment filenames back to the
`-all-` form:

```ts
const body = segments.length > 0 ? segments.join('-') : 'all';
return `occurrences-${body}-${date}.csv`;
```

## Info

### IN-01: `hiddenSources` restore uses a defensive double-fallback that can never reach the `ui` branch

**File:** `src/bee-atlas.ts:645`, `:1304`
**Issue:** Both restore paths use
`initFilter.hiddenSources ?? initialParams.ui?.hiddenSources ?? new Set()`. Since
`parseParams` now sets `result.filter.hiddenSources = hiddenSources ?? new Set()`
whenever `hasFilter` is true (`url-state.ts:264`), and `hasFilter` is true exactly when
`hiddenSources` is non-empty, `initFilter.hiddenSources` is always a defined `Set` when
`initFilter` exists. The `?? initialParams.ui?.hiddenSources` middle term is dead in
practice. Harmless belt-and-suspenders, and the inline comment acknowledges it, but a
future reader may puzzle over why both `filter` and `ui` carry the same field.

**Fix:** Optional. Consider dropping `hiddenSources` from `UiState` entirely once you
confirm no consumer reads `result.ui.hiddenSources` directly, leaving `FilterState` as
the single home. (Tests at `url-state.test.ts:403/440` still assert `result.ui.hiddenSources`,
so this is a follow-up, not a Phase 164 fix.)

### IN-02: `VALID_SOURCES` is duplicated in three places

**File:** `src/filter.ts:394`, `src/url-state.ts:33`, `src/url-state.ts` (`SourceKey` type :31)
**Issue:** The canonical 4-source list lives as a `SourceKey` union type (`url-state.ts:31`),
a module-level `Set` (`url-state.ts:33`), and a function-local array literal
(`filter.ts:394`). Adding a fifth source requires editing all three (plus the
`OccurrenceRow.source` union at `filter.ts:76`) in lockstep, with no compile-time link
between them. The `filter.ts` local array is typed `SourceKey[]`, so a typo'd literal
would be caught, but a *missing* member would not.

**Fix:** Export the canonical array once (e.g. `export const VALID_SOURCES = [...] as const`
in `url-state.ts`, derive `SourceKey = typeof VALID_SOURCES[number]`) and import it into
`filter.ts` rather than re-declaring it. Reduces the drift surface to one edit.

---

_Reviewed: 2026-06-24T18:18:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
