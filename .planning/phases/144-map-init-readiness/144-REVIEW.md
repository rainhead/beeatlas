---
phase: 144-map-init-readiness
reviewed: 2026-06-09T16:16:45Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/bee-atlas.ts
  - src/bee-map.ts
  - src/tests/bee-atlas-legacy-taxon.test.ts
  - src/tests/bee-atlas.test.ts
  - src/tests/bee-map.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 144: Code Review Report

**Reviewed:** 2026-06-09T16:16:45Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 144 consolidates legacy-taxon resolution onto an `await taxaReady` path gated by a single
`intendedFilterActive` getter, and moves the occurrence-layer render decision into `<bee-map>` as
`f(filteredGeoJSON, intendedFilterActive)`. The render-gate refactor in `bee-map._applyVisibleIds`
is sound and the hide-all-on-pending semantics are correctly anchored on `intendedFilterActive`
rather than `filteredGeoJSON !== null`.

The blocking concern is in the *producer* of the readiness barrier, not the consumer: `taxaReady`
is resolved (`markTaxaReady()`) only on the happy path inside `_loadSummaryFromSQLite`. The
empty-DB early-return and the `catch` path both skip it, leaving `taxaReady` unresolved forever.
Because the new legacy-taxon flow blocks on `await taxaReady` and keeps `_filterResolving = true`
(hence `intendedFilterActive = true`) until it completes, those paths produce a permanently
hidden map (hide-all that never lifts) with no error surfaced. This is a behavior regression the
phase's own architecture introduced by hard-coupling visibility to a barrier that is not
guaranteed to fire.

A secondary structural concern: `_filterResolving` — the field that feeds `intendedFilterActive` —
is not a Lit reactive property, so its mutation alone schedules no re-render. It currently works
only because every mutation site co-mutates a `@state` field; this is an implicit invariant with
no guard.

## Critical Issues

### CR-01: `markTaxaReady()` is unreachable on empty-DB and error paths — legacy-taxon resolution hangs and the map stays permanently hidden

**File:** `src/bee-atlas.ts:362-450` (specifically the early return at `377-380`, the `markTaxaReady()` call at `406`, and the `catch` at `444-449`)

**Issue:**
`_loadSummaryFromSQLite` calls `markTaxaReady()` at line 406, *inside* the `try` block and *after*
the summary query and the taxa-cache query. Two paths bypass it entirely:

1. **Empty-DB early return (lines 377-380):** if the summary query yields no rows, the function
   `return`s before line 406.
2. **`catch` (lines 444-449):** if the summary query or the `taxa` query throws, control jumps to
   `catch`; `markTaxaReady()` is never reached. The `finally` only sets `_loading = false`.

In both cases `taxaReady` never resolves. The new legacy-taxon flow blocks on it:

```ts
private _awaitLegacyTaxonResolution(pending): void {
  this._filterResolving = true;       // intendedFilterActive becomes true
  void (async () => {
    await taxaReady;                   // never resolves on the two paths above
    this._resolveLegacyTaxon(pending); // never runs → _filterResolving never cleared
  })();
}
```

With `_filterResolving` stuck `true`, `intendedFilterActive` stays `true`, so
`bee-map._applyVisibleIds` renders `filteredGeoJSON ?? { features: [] }` = **empty** forever
(`src/bee-map.ts:580-589`). For any user arriving via a legacy `?taxon=<name>&taxonRank=<rank>`
URL, a transient SQLite failure or an empty DB yields a silently blank map with no error overlay
(the error overlay is only shown for `_error`, which these paths do not set). `_onPopState`'s
legacy branch (line 704) has the same dependency and the same failure mode.

This is a regression created by this phase: visibility is now hard-coupled to a barrier that is
only fired on the happy path.

**Fix:** Guarantee `markTaxaReady()` fires on every terminal path of `_loadSummaryFromSQLite`.
Move it to the `finally` block (it is idempotent — `Promise.resolve` is a no-op after the first
call), so the cache-readiness barrier resolves even when the cache is empty or the load failed.
The resolver already tolerates an empty cache (no-match → show-all, clears `_filterResolving`):

```ts
    } catch (err) {
      const code = (err as any)?.code;
      console.error('Failed to load summary from SQLite:', err, code !== undefined ? `(SQLite error code ${code})` : '');
    } finally {
      this._loading = false;
      markTaxaReady(); // idempotent; ensures awaiters never hang on empty-DB / error paths
    }
```

Also remove the now-redundant `markTaxaReady()` at line 406 (or leave it — idempotent — but the
`finally` is the one that closes the gap). Note this means `_resolveLegacyTaxon` may run against an
empty/partial cache on the failure path; that is the correct fallback (show-all) and matches the
existing no-match branch at lines 490-498.

## Warnings

### WR-01: `_filterResolving` is not reactive, yet it drives the `intendedFilterActive` render gate

**File:** `src/bee-atlas.ts:71` (declaration), `93-95` (getter), `459`, `478`, `493`, `707` (mutations)

**Issue:**
`intendedFilterActive` is read in `render()` (line 177) to drive `bee-map`'s
`.intendedFilterActive` property — the whole anti-flash mechanism. But `_filterResolving` is a
plain field, not `@state`. Mutating it (e.g. `this._filterResolving = true` in
`_awaitLegacyTaxonResolution`) schedules **no** re-render on its own. Today every mutation site
happens to co-mutate a `@state` field in the same synchronous block — `firstUpdated` sets
`_viewState`/`_filterState` (lines 245/257), `_resolveLegacyTaxon` sets `_filterState` or
`_filteredGeoJSON`/`_visibleIds`, `_onPopState` always reassigns `_filterState` (line 688) — so a
render is incidentally scheduled. This is an undocumented, unenforced invariant: a future edit that
flips `_filterResolving` without touching a reactive field will silently fail to update `bee-map`,
reintroducing the exact flash/strand this phase set out to eliminate.

**Fix:** Either make the dependency explicit by calling `this.requestUpdate()` immediately after
each `_filterResolving` mutation, or back it with a private `@state` field
(`@state() private _filterResolving = false;`) so Lit treats `intendedFilterActive` as
render-relevant. The latter is cleanest and self-documenting.

### WR-02: `firstUpdated` relies on Lit's second-update batching to surface the initial hide-all

**File:** `src/bee-atlas.ts:237-341`, esp. `274-276`

**Issue:**
`_awaitLegacyTaxonResolution` sets `_filterResolving = true` *inside* `firstUpdated`, which runs
after the first `render()`. The hide-all only reaches `bee-map` because the reactive properties set
earlier in `firstUpdated` (`_viewState`, `_filterState`, etc.) enqueue a second update whose
`render()` then reads the now-`true` `intendedFilterActive`. This is correct only by the ordering
luck that those `@state` writes precede the `_filterResolving` write and that Lit coalesces them
into one follow-up render. Combined with WR-01, this makes the anti-flash guarantee depend on two
implicit timing assumptions rather than an explicit signal.

**Fix:** Same remedy as WR-01 — backing `_filterResolving` with `@state` (or an explicit
`requestUpdate()`) makes the follow-up render an enforced consequence of setting the flag rather
than an incidental side effect of unrelated state writes.

### WR-03: `bee-map.intendedFilterActive` default `false` can flash full data for a legacy-taxon URL before bee-atlas's second render

**File:** `src/bee-map.ts:59`, `458-460`

**Issue:**
`intendedFilterActive` defaults to `false`. On a legacy-taxon load, the bee-map `load` handler at
line 458 runs `if (this.visibleIds !== null || this.intendedFilterActive)`. If the map's `load`
event fires *before* bee-atlas has completed the follow-up render that pushes
`intendedFilterActive=true` (see WR-02), then at line 458 both `visibleIds` is `null` and
`intendedFilterActive` is still `false`, so `_applyVisibleIds()` is skipped and the source keeps
its initial full `geojson` (set at line 372-385) — i.e. the full dataset is shown until a later
`updated()` re-applies. This is precisely the "flash full data on load" the comment at lines
456-457 claims to prevent; the guarantee holds only if the property propagation in WR-01/WR-02 is
made deterministic.

**Fix:** Resolve WR-01 (reactive `_filterResolving`) so `intendedFilterActive=true` is guaranteed
to have propagated to bee-map before/independent of map-load timing, or have bee-map apply
hide-all defensively whenever the source is first created and no full-data render has been
authorized. With WR-01 fixed this reduces to a non-issue.

### WR-04: CSV export reads `Object.keys(rows[0]!)` without revalidating subsequent rows

**File:** `src/bee-atlas.ts:1002-1034` (line 1006, 1010-1011)

**Issue:**
`_onDownloadCsv` derives headers from `rows[0]` and then indexes every row by those header keys
(`(row as any)[h]`). If `queryAllFiltered` ever returns heterogeneous row shapes (e.g. a row
missing a column present in row 0), the missing cell silently becomes `''` and an extra column in a
later row is silently dropped — producing a malformed CSV with no error. This is preexisting and
not central to Phase 144, but it sits in a changed file and is a latent data-integrity issue for
exports.

**Fix:** Derive the header set from a stable schema (the known `OccurrenceRow`/column contract)
rather than from `rows[0]`, or union keys across all rows before emitting. At minimum assert that
all rows share row 0's keys.

## Info

### IN-01: `_selectionDrawnGeneration` is written but never read (dead code)

**File:** `src/bee-atlas.ts:74` (declaration), `889` (`++this._selectionDrawnGeneration`)

**Issue:** The counter is incremented in `_onSelectionDrawn` but never read anywhere. It appears
to be a vestigial stale-guard that was superseded by `_listGuard`/`makeStaleGuard`. Dead field +
dead increment.

**Fix:** Remove the field and the increment, or wire it into the bounds-selection stale check if a
guard there was actually intended.

### IN-02: Duplicated county/ecoregion option queries across two methods

**File:** `src/bee-atlas.ts:429-440` (inside `_loadSummaryFromSQLite`) and `543-564`
(`_loadCountyEcoregionOptions`)

**Issue:** The identical `SELECT DISTINCT county …` and `SELECT DISTINCT ecoregion_l3 …` queries
and their result-assembly run in both `_loadSummaryFromSQLite` and `_loadCountyEcoregionOptions`,
both of which execute on the `data-loaded` path (lines 1068 and 1076). The county/ecoregion options
are loaded twice per boot. Not a correctness bug, but duplicated SQL and redundant work that can
drift out of sync.

**Fix:** Drop the inline county/ecoregion queries from `_loadSummaryFromSQLite` (the comment at
442-443 already defers collector options to a dedicated method — apply the same to county/ecoregion
via `_loadCountyEcoregionOptions`).

### IN-03: Benchmark `console.log` left on the boot path

**File:** `src/bee-atlas.ts:1071-1072`

**Issue:** `_onDataLoaded` unconditionally emits a `[BENCHMARK] data-loaded …` `console.log` with
heap stats on every load. This is a debug artifact shipping to production (static-hosted app, no
log scrubbing layer).

**Fix:** Gate behind `import.meta.env.DEV` or remove. (Other diagnostics in these files use
`console.debug`/`console.error`, which is more appropriate for retained logging.)

---

_Reviewed: 2026-06-09T16:16:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
