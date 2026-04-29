---
phase: 068-filter-panel-redesign
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/src/bee-filter-panel.ts
  - frontend/src/bee-filter-controls.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/tests/bee-filter-toolbar.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 068: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

These files implement the filter panel redesign: a new `bee-filter-panel` wrapper component housing a token-based `bee-filter-controls` search bar with elevation inputs, integrated into `bee-atlas`. The overall architecture is sound — the section-header + sub-component structure, the token/FilterState round-trip, and the stale-query generation guard are all well implemented.

One critical field-name mismatch between `CollectorEntry` (uses `host_inat_login`) and the code in both `bee-filter-controls.ts` and `bee-atlas.ts` (both use `observer`) will cause collector filters to silently produce no results and should be a TypeScript compile error with `satisfies CollectorEntry` on `bee-atlas.ts:386`. Two warnings cover a loose type assertion and a silent Enter-key behavior. Two info items flag a no-op method and dead section-header markup.

---

## Critical Issues

### CR-01: CollectorEntry field name mismatch — `observer` vs `host_inat_login`

**File:** `frontend/src/bee-filter-controls.ts:20,58,78,177-182`
**Also affects:** `frontend/src/bee-atlas.ts:385-386`

`CollectorEntry` in `filter.ts` declares `host_inat_login: string | null`, but every access site in these two files uses `observer` instead. This is a field-name mismatch that causes three distinct failures:

1. **`bee-filter-controls.ts:58` — `tokensToFilterState`** pushes `{ ..., observer: t.observer }` into `f.selectedCollectors`, which is typed as `CollectorEntry[]`. The `host_inat_login` field is absent; `buildFilterSQL` reads `c.host_inat_login` to build the SQL IN-clause, so it will always find `null` and the iNat-login branch of collector filtering is silently skipped.

2. **`bee-filter-controls.ts:78` — `filterStateToTokens`** reads `c.observer` on a `CollectorEntry` — a field that does not exist — so `observer` is always `undefined`, which renders incorrectly in suggestion labels.

3. **`bee-filter-controls.ts:177-182` — `getSuggestions`** matches collector options by `c.observer`, which is `undefined` on every option, so username-based search never matches.

4. **`bee-atlas.ts:385-386` — `_loadCollectorOptions`** constructs `{ displayName, recordedBy, observer }` with `satisfies CollectorEntry` — this should be a TypeScript compile error because `CollectorEntry` does not have `observer`. The `host_inat_login` field is never populated, so all options sent to the panel have `host_inat_login: undefined` (not `null`).

**Fix — `bee-filter-controls.ts`:** rename `observer` to `host_inat_login` throughout:

```typescript
// Line 20
interface CollectorToken { type: 'collector'; displayName: string; recordedBy: string | null; host_inat_login: string | null }

// Line 58
case 'collector': f.selectedCollectors.push({ displayName: t.displayName, recordedBy: t.recordedBy, host_inat_login: t.host_inat_login }); break;

// Line 78
for (const c of f.selectedCollectors) tokens.push({ type: 'collector', displayName: c.displayName, recordedBy: c.recordedBy, host_inat_login: c.host_inat_login });

// Lines 177-182
const matchesUsername = c.host_inat_login !== null && c.host_inat_login.toLowerCase().includes(lower);
if ((matchesName || matchesUsername) && !activeCollectors.has(c.displayName)) {
  const label = c.host_inat_login && c.host_inat_login !== c.displayName
    ? `by ${c.displayName} (${c.host_inat_login})`
    : `by ${c.displayName}`;
  results.push({ label, token: { type: 'collector', displayName: c.displayName, recordedBy: c.recordedBy, host_inat_login: c.host_inat_login } });
```

**Fix — `bee-atlas.ts:385-386`:** rename `observer` to `host_inat_login`:

```typescript
const host_inat_login = obj.observer != null ? String(obj.observer) : null;
newOptions.push({ displayName: recordedBy, recordedBy, host_inat_login } satisfies CollectorEntry);
```

Note: the SQL query alias `MIN(observer) AS observer` is fine (querying the DB column named `observer`); only the JS variable name passed to `CollectorEntry` needs to change.

---

## Warnings

### WR-01: Unsafe `as any` cast for `elevMin`/`elevMax` in `_onFilterChanged`

**File:** `frontend/src/bee-atlas.ts:606-607`

`FilterChangedEvent` (declared in `bee-sidebar.ts:31-42`) already includes `elevMin: number | null` and `elevMax: number | null` as typed fields. The cast `(detail as any).elevMin` bypasses type checking unnecessarily and will silently return `undefined` rather than `null` if the event shape ever changes.

```typescript
// Current (lines 606-607)
elevMin: (detail as any).elevMin ?? null,
elevMax: (detail as any).elevMax ?? null,

// Fix — remove the cast; detail is already FilterChangedEvent
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

### WR-02: Enter key silently selects first suggestion when nothing is highlighted

**File:** `frontend/src/bee-filter-controls.ts:415-418`

In `_onKeydown`, when `_highlightIndex` is `-1` (no item highlighted), pressing Enter falls back to `idx = 0` and unconditionally selects `_suggestions[0]` if it exists. A user who types a partial word and presses Enter expecting to confirm plain text or dismiss the dropdown will instead add the first suggestion as a token — with no visual indication that index 0 was selected.

```typescript
// Current
case 'Enter': {
  e.preventDefault();
  const idx = this._highlightIndex >= 0 ? this._highlightIndex : 0;
  if (this._suggestions[idx]) this._selectSuggestion(this._suggestions[idx]);
  break;
}

// Fix — only select on Enter when an item is explicitly highlighted
case 'Enter': {
  if (this._highlightIndex >= 0 && this._suggestions[this._highlightIndex]) {
    e.preventDefault();
    this._selectSuggestion(this._suggestions[this._highlightIndex]);
  }
  break;
}
```

---

## Info

### IN-01: `_onFocus` is a no-op

**File:** `frontend/src/bee-filter-controls.ts:399-401`

`_onFocus` is defined as an empty function and wired to `@focus` on the input (line 495). The comment says "Dropdown only opens on typed input" — the handler exists to document intent, but empty event handlers add noise. Either remove the `@focus` binding and the method, or add a `// intentional no-op` comment if the hook point is retained for future use.

### IN-02: Section headers (What / Who / Where / When) are decorative markup with no functional grouping

**File:** `frontend/src/bee-filter-panel.ts:107-133`

The four `<div class="section-header">` elements (What, Who, Where, When) are rendered before `<bee-filter-controls>`, not wrapping or interleaved with grouped controls. The single `bee-filter-controls` element renders all controls in one block below all four headers. This likely reflects the current state of development (controls not yet split by section), but the headers currently mislead users into expecting visually grouped controls. If the split-by-section layout is not planned imminently, consider either deferring the headers or replacing them with a single label until the grouping is implemented.

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
