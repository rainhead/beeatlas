# Phase 5: Fix Month Offset Bug - Research

**Researched:** 2026-02-22
**Domain:** TypeScript frontend bug fix — off-by-one month in Parquet feature loading
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILTER-02 | User can filter displayed specimens by year range and/or month of year (independently) | Root cause confirmed in source; fix is a one-character deletion; downstream effects fully mapped |
</phase_requirements>

## Summary

Phase 5 is a surgical bug fix with a precisely known root cause. The Parquet file stores DarwinCore months (1–12, confirmed via direct Parquet inspection: 51,633 rows, min=1, max=12, no nulls). The file `frontend/src/parquet.ts` line 34 applies `+ 1` when loading the month field, producing feature months 2–13. Every subsystem that reads the `month` feature property is affected: the month filter predicate in `filter.ts`, the sidebar date formatter in `bee-sidebar.ts`, and the recency tier calculator in `style.ts`.

The fix is removing the `+ 1` operand on line 34 of `parquet.ts`. After this single-character edit, all downstream code works correctly without modification: `filter.ts` month predicate compares against 1–12 checkboxes which will now match; `bee-sidebar.ts _formatMonth` uses `new Date(year, month - 1)` which produces correct month names for months 1–12; `style.ts recencyTier` passes the month to `Temporal.PlainDate.from({year, month, day:1})` which accepts 1–12 per the Temporal specification.

The verification plan must confirm that the fix works end-to-end in a dev server, specifically testing January and December specimens (which were the invisible edge cases) and checking the sidebar date display. The phase should complete in a single plan with one code task and one human-verification task.

**Primary recommendation:** Remove `+ 1` from `frontend/src/parquet.ts` line 34. No other file changes required. Verify with a dev server session checking month filter checkboxes and sidebar date display.

---

## Standard Stack

No new libraries needed. This phase uses only existing project dependencies.

### Core (existing)
| Library | Version | Purpose | Role in Fix |
|---------|---------|---------|-------------|
| hyparquet | ^1.23.3 | Read Parquet files | Provides `obj.month` values (1–12) |
| temporal-polyfill | ^0.2.5 | Date calculations | `recencyTier` uses `Temporal.PlainDate.from({month})` — accepts 1–12 |
| lit | ^3.2.1 | Web components | `bee-sidebar.ts` renders corrected months |
| ol | ^10.7.0 | OpenLayers map | No changes needed |

**Installation:** None — no new dependencies.

---

## Architecture Patterns

### The Single Source of Truth: parquet.ts

The `month` property on every OL `Feature` object originates exclusively from `parquet.ts` line 34. There is no other place in the codebase that sets the month property. This means:

- Fix the source, and all downstream consumers are automatically corrected
- No other file edits are needed
- No cache invalidation is needed (styleCache is bypassed when filter is active; recency is recalculated fresh per render)

### Current Broken State (exact code)

```typescript
// frontend/src/parquet.ts line 34 — CURRENT (BROKEN)
feature.setProperties({
  year: Number(obj.year),
  month: Number(obj.month) + 1,   // ← BUG: +1 was for 0-indexed Parquet; Parquet now emits 1-12
  ...
});
```

### Fixed State (what it should be)

```typescript
// frontend/src/parquet.ts line 34 — FIXED
feature.setProperties({
  year: Number(obj.year),
  month: Number(obj.month),       // DarwinCore months are 1-indexed (1=January, 12=December)
  ...
});
```

### Downstream Code — Verified No Changes Needed

**filter.ts (line 40):**
```typescript
// Month filter predicate — no change needed
if (f.months.size > 0 && !f.months.has(feature.get('month') as number)) return false;
```
After fix: feature.get('month') returns 1–12. Checkboxes emit values 1–12. They match correctly.

**bee-sidebar.ts (line 363–366, `_formatMonth`):**
```typescript
// Sidebar date formatter — no change needed
private _formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(year, month - 1)   // subtracts 1 to get 0-indexed JS Date month
  );
}
```
After fix: `new Date(year, 0)` = January, `new Date(year, 11)` = December. Correct.

**bee-sidebar.ts (line 297–300, `_getMonthName` for filter labels):**
```typescript
// Month checkbox label formatter — no change needed
private _getMonthName(month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
    new Date(2000, month - 1)
  );
}
```
Checkbox labels (Jan–Dec for values 1–12) are already correct — they display labels, not data.

**style.ts (lines 20–25, `recencyTier`):**
```typescript
// Recency tier calculator — no change needed
function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  const sampleDate = Temporal.PlainDate.from({ year, month, day: 1 });
  ...
}
```
After fix: month=1–12 are valid per `Temporal.PlainDate.from()`. Before fix, month=13 for December caused temporal-polyfill to constrain it to December (which happened to mask the recency bug for that month).

**bee-map.ts `buildSamples` (lines 22–39):**
```typescript
// Sample key uses month for grouping — no change needed
const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
```
After fix: key uses correct month values. Grouping logic is unaffected.

### Anti-Patterns to Avoid

- **Adding a compensating +1 elsewhere:** Every downstream consumer is already written for 1-indexed months. The fix is at the source, not in compensating patches.
- **Changing the Parquet pipeline:** The Parquet already emits correct 1-indexed months. The pipeline is correct; only the frontend reader is wrong.
- **Adding a comment-only commit:** A comment should be added explaining the data contract, but the actual fix must remove the `+ 1`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Month name formatting | Custom lookup array | `Intl.DateTimeFormat` with `new Date(2000, month-1)` | Already used in codebase; handles locale |
| Temporal validation | Manual month range check | `Temporal.PlainDate.from()` | Already in style.ts; Temporal validates month ranges |

---

## Common Pitfalls

### Pitfall 1: Forgetting to restart the dev server after the edit
**What goes wrong:** Vite HMR sometimes serves a stale module, especially for top-level module-scope constants.
**Why it happens:** `specimenSource` is constructed at module scope in `bee-map.ts`, not inside a component lifecycle. If HMR patches `parquet.ts` but doesn't re-execute the module-scope construction, old features (with wrong months) remain in the VectorSource.
**How to avoid:** After saving `parquet.ts`, hard-refresh the browser (Cmd+Shift+R or Ctrl+Shift+R) to force full reload, not just HMR patch.
**Warning signs:** Month checkboxes still showing wrong behavior after the save.

### Pitfall 2: Testing only April–September specimens
**What goes wrong:** The bug was missed in 04-05 human verification because Washington bee season is April–September, and the offset (April checkbox shows May data) is visually indistinguishable without ground truth.
**Why it happens:** No specimens appear in January or December due to the season, so testers naturally gravitate to the active season months.
**How to avoid:** Verification must explicitly test January (month=1) and December (month=12) specimens. Query the Parquet to find known January or December specimen IDs, then verify those specimens appear when the corresponding checkbox is checked.
**Warning signs:** All month checkboxes appear to "work" even with the bug present when testing only May–September.

### Pitfall 3: Confusing the two month-formatting functions
**What goes wrong:** `bee-sidebar.ts` has both `_formatMonth(year, month)` (for specimen display) and `_getMonthName(month)` (for checkbox labels). They both subtract 1 — which is correct for 1-indexed input.
**Why it happens:** The subtraction is easy to read as the same bug pattern.
**How to avoid:** Understand that both functions are already correct for 1-indexed months. The bug is upstream in `parquet.ts`, not in these display functions.

### Pitfall 4: The styleCache does not need clearing
**What goes wrong:** Worrying that old cached Styles (with wrong recency tiers) will persist after the fix.
**Why it happens:** `styleCache` is a module-level `Map<string, Style>`.
**How to avoid:** The styleCache is keyed by `count:tier` and is only used when no filter is active. On hard-refresh (which is required anyway — see Pitfall 1), the module re-initializes and the cache is empty.

---

## Code Examples

### The exact line to change

```typescript
// File: frontend/src/parquet.ts
// Line: 34
// Before (broken):
month: Number(obj.month) + 1,

// After (fixed):
month: Number(obj.month),       // DarwinCore months are 1-indexed (1=January, 12=December)
```

### Finding a January or December specimen for verification

```python
# Run from project root to find a January or December specimen ID for manual verification
import pandas as pd
df = pd.read_parquet('data/ecdysis.parquet')
jan = df[df['month'] == 1].head(3)[['ecdysis_id', 'year', 'month', 'scientificName']]
dec = df[df['month'] == 12].head(3)[['ecdysis_id', 'year', 'month', 'scientificName']]
print("January specimens:", jan.to_dict('records'))
print("December specimens:", dec.to_dict('records'))
```

This gives the verifier concrete specimen IDs to check against in the browser.

### Verifying recencyTier accepts month 1 and 12

```typescript
// temporal-polyfill Temporal.PlainDate.from() accepts month 1-12 per ISO 8601
// Month 1 = January, Month 12 = December
const jan = Temporal.PlainDate.from({ year: 2024, month: 1, day: 1 }); // valid
const dec = Temporal.PlainDate.from({ year: 2024, month: 12, day: 1 }); // valid
// Month 13 = overflow → Temporal constrains to December of next year (was masking the bug)
```

---

## State of the Art

| Old State | Current State | Impact |
|-----------|---------------|--------|
| Parquet emitted 0-indexed months → `+1` was correct | Parquet emits 1-indexed DarwinCore months → `+1` is wrong | All month-dependent features broken |
| Pipeline used prefix aliasing that changed indexing | Pipeline refactored to direct DarwinCore export | `+1` left behind; never removed |

**Root cause timeline (from audit):**
1. Commit `99aba65`: added `+ 1` when Parquet stored 0-indexed months. Correct at the time.
2. Later: pipeline refactored to emit DarwinCore-standard 1-indexed months.
3. `+ 1` never removed. All months now off by one in the frontend.

---

## Open Questions

1. **Are there any January or December specimens in the current Parquet data?**
   - What we know: Python verification confirmed months 1–12 all present in the Parquet (51,633 rows, unique months [1..12]).
   - What's unclear: How many January/December specimens exist? If very few, the verifier may need to zoom in carefully.
   - Recommendation: Run the Python snippet above during verification to get specific specimen IDs to test.

2. **Does the dev server need anything special to run?**
   - What we know: `npm run dev` from `frontend/` starts Vite dev server. Parquet is bundled as a static asset.
   - What's unclear: Whether the current `ecdysis.parquet` asset in `frontend/src/assets/` is current and has Jan/Dec specimens.
   - Recommendation: Planner should include a task step to verify Parquet has Jan/Dec specimens before human verification.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `frontend/src/parquet.ts` lines 1–52 — bug location confirmed at line 34
- Direct code inspection of `frontend/src/filter.ts` — month predicate verified no change needed
- Direct code inspection of `frontend/src/bee-sidebar.ts` — `_formatMonth` and `_getMonthName` verified no change needed
- Direct code inspection of `frontend/src/style.ts` — `recencyTier` verified no change needed
- Direct code inspection of `frontend/src/bee-map.ts` — `buildSamples` verified no change needed
- Python Parquet inspection: `data/ecdysis.parquet` confirmed months 1–12, 51,633 rows, 0 nulls

### Secondary (MEDIUM confidence)
- `.planning/v1.0-MILESTONE-AUDIT.md` — audit analysis of root cause and downstream effects (HIGH confidence, written by integration checker with code access)

---

## Metadata

**Confidence breakdown:**
- Root cause: HIGH — confirmed by direct code inspection and Parquet data verification
- Fix: HIGH — single-line deletion, no ambiguity
- Downstream effects: HIGH — all consumer code read and verified; none require changes
- Verification strategy: HIGH — explicit edge cases (Jan/Dec) identified; concrete testing method described

**Research date:** 2026-02-22
**Valid until:** Stable until Parquet pipeline changes (no expiry for a one-line fix)
