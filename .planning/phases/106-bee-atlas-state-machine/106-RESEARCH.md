# Phase 106: bee-atlas State Machine - Research

**Researched:** 2026-05-19
**Domain:** TypeScript Lit web components, state machine refactor
**Confidence:** HIGH

## Summary

Phase 106 is a pure internal refactor of `bee-atlas.ts`. It replaces three separate boolean/string
flags — `_viewMode: 'map' | 'table'`, `_sidebarOpen: boolean`, and `_tableFilterOpen: boolean` —
with a single `_paneState: 'collapsed' | 'list' | 'table'` property that encodes the same
information more precisely.

Phase 105 already added `UiState.paneState` to url-state.ts and wired four call sites through a
temporary adapter in `bee-atlas.ts`. Phase 106 removes that adapter: `_paneState` becomes the
authoritative runtime source of truth, and `_viewMode`/`_sidebarOpen`/`_tableFilterOpen` are
deleted. All event handlers that previously set these three flags now set `_paneState` instead.

The mapping between old state and new state is deterministic:

| Old (`_viewMode`, `_sidebarOpen`) | New `_paneState` |
|-----------------------------------|------------------|
| `'table'`, any | `'table'` |
| `'map'`, `true` | `'list'` |
| `'map'`, `false` | `'collapsed'` |

`_tableFilterOpen` is a subordinate flag that controlled whether the filter panel was open in
table mode. In the target architecture, this becomes part of `_paneState='table'` semantics —
the filter panel state in table mode is tracked separately and not part of `_paneState`.

**Primary recommendation:** Replace the three flags with `_paneState`. Derive display logic from
`_paneState` directly. No new libraries needed. Pure in-repo TypeScript change.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pane state ownership | `bee-atlas.ts` @state | — | Architecture invariant: `<bee-atlas>` owns all reactive state |
| View mode derived rendering | `bee-atlas.ts` render() | — | Conditional template branches are purely driven by `_paneState` |
| Sidebar visibility | `bee-atlas.ts` _paneState | — | `_paneState === 'list'` replaces `_sidebarOpen` |
| Table filter open | `bee-atlas.ts` standalone flag | — | Not encoded in `_paneState`; keep as separate flag or inline logic |
| URL serialization | `url-state.ts` (unchanged) | — | Already uses `paneState`; Phase 106 removes the adapter |

## Standard Stack

No external packages are added in this phase. Everything is in-project TypeScript.

### Existing Toolchain (all verified in codebase)

| Tool | Version | Role |
|------|---------|------|
| Lit | ^3.2.1 | `@state()` decorator, LitElement reactivity |
| Vitest | ^4.1.2 | Unit test runner; `npm test` |
| TypeScript | ^5.8.2 | Static typing; `tsc --noEmit` is part of build gate |
| happy-dom | ^20.8.9 | Vitest DOM environment |

[VERIFIED: package.json in repo]

## Package Legitimacy Audit

No packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### Current State (three flags)

```typescript
// bee-atlas.ts — CURRENT (to be eliminated in Phase 106)
@state() private _viewMode: 'map' | 'table' = 'map';
@state() private _sidebarOpen = false;
@state() private _tableFilterOpen = false;
```

The three flags are used together to drive:
1. CSS class on `.content` div: `table-mode` when `_viewMode === 'table'`; `sidebar-open` when
   `_viewMode === 'map' && _sidebarOpen`
2. Conditional rendering: `bee-table` shown only when `_viewMode === 'table'`; `bee-sidebar`
   shown only when `_viewMode === 'map' && _sidebarOpen`
3. `bee-filter-panel` properties: `hideButton=${this._viewMode === 'table'}`,
   `externalOpen=${this._tableFilterOpen}`, `openUpward=${this._viewMode === 'table'}`
4. `bee-header` property: `.viewMode=${this._viewMode}`
5. `_runTableQuery` guard: `if (this._viewMode !== 'table') return;`
6. `_pushUrlState` adapter: converts three flags → `paneState`
7. `firstUpdated` / `_onPopState` adapters: converts `paneState` → three flags

### Target State (single property)

```typescript
// bee-atlas.ts — TARGET after Phase 106
@state() private _paneState: 'collapsed' | 'list' | 'table' = 'collapsed';
```

Derived render logic:

```typescript
// CSS class expression
[
  'content',
  this._paneState === 'table' ? 'table-mode' : '',
  this._paneState === 'list'  ? 'sidebar-open' : '',
].filter(Boolean).join(' ')

// bee-table: shown when paneState === 'table'
${this._paneState === 'table' ? html`<bee-table ...>` : nothing}

// bee-sidebar: shown when paneState === 'list'
${this._paneState === 'list' ? html`<bee-sidebar ...>` : nothing}

// bee-filter-panel props:
.hideButton=${this._paneState === 'table'}
.openUpward=${this._paneState === 'table'}
// externalOpen is now driven by _tableFilterOpen (unchanged — see note below)
```

### bee-header coupling

`bee-header` currently accepts `.viewMode: 'map' | 'table'` and emits `view-changed` with detail
`'map' | 'table'`. Phase 106 must either:

**Option A (minimal change):** Keep passing `_viewMode`-equivalent to `bee-header` by deriving it:
```typescript
.viewMode=${this._paneState === 'table' ? 'table' : 'map'}
```
This defers the `bee-header` API change to Phase 107 or 109.

**Option B (clean break):** Update `bee-header.ts` to accept `paneState` and emit `pane-changed`.

Option A is recommended for Phase 106 since the success criteria only say `_viewMode` must not
exist in `bee-atlas.ts` — not that `bee-header`'s interface must change. Phase 107 (Create
bee-pane Component) will redesign the header/pane interaction anyway.

### `_tableFilterOpen` — Not Part of _paneState

`_tableFilterOpen` is a subordinate flag that controls `bee-filter-panel.externalOpen`. It is
toggled by `_onToggleFilter()` which is called from `bee-table`'s `@toggle-filter` event. This
flag does not encode pane state — it encodes filter panel expansion within the table view.

The Phase 106 success criteria say "`_tableFilterOpen` no longer exists in bee-atlas.ts." But the
behavior it drives (externalOpen on bee-filter-panel) must still work. The options are:

**Option A:** Remove `_tableFilterOpen` @state field and use a direct DOM call only in
`_onToggleFilter`, without a reactive property. Since `bee-filter-panel.setOpen()` is already
called directly (line 851 in current code), the `_tableFilterOpen` field isn't strictly needed for
the DOM update — only for the `.externalOpen` binding. If `.externalOpen` can be removed too, the
field goes away cleanly.

**Option B:** Keep the toggle behavior but inline it as a derived value. Given that
`_tableFilterOpen` is only set to `false` in `_onViewChanged` when leaving table mode (line 844),
and toggled in `_onToggleFilter`, it can remain as a plain (non-reactive) field if the
`externalOpen` binding is removed and direct DOM calls are used exclusively.

The planner should choose: the cleanest approach is likely to drop `externalOpen` from
`bee-filter-panel` entirely and rely only on the imperative `setOpen()` call. This is a
self-contained change within this phase.

### Event Handler Mapping

Every place in `bee-atlas.ts` that sets `_viewMode`, `_sidebarOpen`, or `_tableFilterOpen` must
be updated to set `_paneState`. The complete inventory (from code read):

**Sets `_viewMode`:**
1. `firstUpdated` line 246: `this._viewMode = paneState === 'table' ? 'table' : 'map'`
   → `this._paneState = paneState` (direct — no adapter needed)
2. `_onPopState` line 556: same adapter
   → `this._paneState = paneState` (direct)
3. `_onViewChanged` line 833: `this._viewMode = e.detail`
   → `this._paneState = e.detail === 'table' ? 'table' : (this._paneState === 'collapsed' ? 'collapsed' : 'list')`
   NOTE: When switching from table to map, the prior list/collapsed state matters. The caller
   emits `'map'` when leaving table mode; the correct target paneState is 'collapsed' (not 'list')
   since the sidebar was closed on entering table mode (line 842). So: `e.detail === 'table' ?
   'table' : 'collapsed'` is safe here.

**Sets `_sidebarOpen = true`:**
Lines 283, 287, 289 (firstUpdated selection restore), 568, 575, 583 (_onPopState selection
restore), 624 (_onOccurrenceClick), 724 (_openSidebarForFilter), 755 (_onSelectionDrawn), 1036
(_restoreBoundsSelection)
→ `this._paneState = 'list'`

**Sets `_sidebarOpen = false`:**
Lines 590 (_onPopState else), 685 (_onRegionClick deselect), 710 (_onPlaceSelected deselect),
737 (_onSelectionDrawn zero-result), 774 (_onMapClickEmpty), 786 (_onMapClickEmpty), 823
(_onFilterChanged), 842 (_onViewChanged entering table), 908 (_onClose)
→ `this._paneState = 'collapsed'`
EXCEPTION: Line 842 is entering table mode — that handler already sets `_paneState = 'table'`
so the `_sidebarOpen = false` becomes implicit.

**Sets `_tableFilterOpen`:**
Line 844: `this._tableFilterOpen = false` (when leaving table mode via `_onViewChanged`)
Line 850: `this._tableFilterOpen = !this._tableFilterOpen` (`_onToggleFilter`)
→ These can remain if `_tableFilterOpen` is kept as a plain non-@state field (preferred), or
removed entirely if `externalOpen` binding is dropped.

**Reads `_viewMode`:**
Lines 175–176 (render CSS classes), 196 (bee-table conditional), 218–220 (filter panel props),
223 (bee-sidebar conditional), 247 (dynamic import), 308 (loadSummaryFromSQLite guard), 467
(_runTableQuery guard), 558 (_onPopState table query), 625 (_onOccurrenceClick table path), 834
(_onViewChanged assignment), 929 (_onDataLoaded table guard)
→ Replace `this._viewMode === 'table'` with `this._paneState === 'table'`
→ Replace `this._viewMode === 'map' && this._sidebarOpen` with `this._paneState === 'list'`

**Reads `_sidebarOpen`:**
Lines 176 (CSS class), 223 (bee-sidebar conditional), 501–503 (_pushUrlState adapter), 508
(_pushUrlState sel bounds guard), 568–590 (_onPopState selection), 755 (_onSelectionDrawn), 1036
(_restoreBoundsSelection)
→ Replace `this._sidebarOpen` with `this._paneState === 'list'`

**Reads `_tableFilterOpen`:**
Line 219 (`externalOpen` binding) — only read location.

### `_pushUrlState` Adapter Removal

Currently the adapter in `_pushUrlState` computes `paneState` from the three flags:
```typescript
const paneState: 'list' | 'table' | 'collapsed' =
  this._viewMode === 'table' ? 'table'
  : this._sidebarOpen ? 'list'
  : 'collapsed';
```

After Phase 106, `_paneState` IS the pane state, so the adapter reduces to:
```typescript
const params = buildParams(
  this._currentView,
  this._filterState,
  ...,
  { boundaryMode: this._boundaryMode, paneState: this._paneState }
);
```

### `firstUpdated` and `_onPopState` Adapter Removal

Currently these adapters convert `paneState` → `_viewMode`:
```typescript
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
```

After Phase 106:
```typescript
this._paneState = initialParams.ui?.paneState ?? 'collapsed';
```
The adapter is gone. `_paneState` is assigned directly from the parsed URL value.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| State machine formalism | XState or similar library | Lit `@state()` with discriminated union string (`'collapsed' | 'list' | 'table'`) — three states is not complex enough to justify a state machine library |
| Derived state views | Computed properties, memoization | Direct ternary expressions in render() — Lit re-renders are already minimized by its diff algorithm |

**Key insight:** Three states with a handful of transitions maps trivially to a string enum
`@state()` field. Adding a state machine library would be architectural over-engineering for
what is effectively a string assignment.

## Common Pitfalls

### Pitfall 1: Forgetting that `paneState === 'list'` replaces `_sidebarOpen`

**What goes wrong:** Developer replaces `_viewMode` usages but leaves `_sidebarOpen` reads, adding
`_sidebarOpen` back as a new field. The success criterion requires `_sidebarOpen` to be gone.

**How to avoid:** Grepping for `_sidebarOpen` after the refactor must return zero matches.

**Warning signs:** TypeScript will NOT catch this (a new `_sidebarOpen` field is valid TS).
Must use explicit grep verification.

### Pitfall 2: Entering table mode leaves pane in 'list' after table→map transition

**What goes wrong:** When user clicks Map tab from Table mode, `view-changed` emits `'map'`. If
the handler sets `_paneState = 'list'`, the sidebar renders unexpectedly (no occurrences selected).

**How to avoid:** In `_onViewChanged`, when transitioning to map from table: set
`_paneState = 'collapsed'` (not 'list'). This matches the existing D-08 behavior (sidebar was
closed when entering table mode, so it should remain closed when leaving).

**Warning signs:** Sidebar appears empty immediately after switching back from table mode.

### Pitfall 3: Dynamic import guard for bee-table fires on wrong condition

**What goes wrong:** Current code at line 247:
`if (paneState === 'table') import('./bee-table.ts');`
In `firstUpdated`, this now reads `this._paneState` directly (assigned two lines earlier).
No problem here, but in `_onViewChanged`, the dynamic import must also fire:
`if (this._paneState === 'table') import('./bee-table.ts');`

**How to avoid:** Verify the dynamic import exists in all paths that set `_paneState = 'table'`:
`firstUpdated`, `_onViewChanged`, and `_onPopState`.

### Pitfall 4: VIEW-02 test in bee-atlas.test.ts still passes via different assertion

**What goes wrong:** After Phase 106, `_viewMode` is deleted. The VIEW-02 test suite currently has:
- `'bee-atlas.ts declares _viewMode as @state field'` — will FAIL after deletion
- `'_onPopState reads paneState from URL (Phase 105)'` — will still pass

The first VIEW-02 test must be updated: replace the `@state _viewMode` assertion with a
`@state _paneState` assertion.

**How to avoid:** Run `npm test` before declaring complete; the failing test will surface
immediately.

### Pitfall 5: SIDE-01 tests for `_sidebarOpen` will fail

**What goes wrong:** The SIDE-01 test suite in `bee-atlas.test.ts` asserts:
- `'bee-atlas.ts declares _sidebarOpen as @state()'` — will FAIL after deletion
- `'bee-atlas.ts sets _sidebarOpen = true in _onSpecimenClick'` — will FAIL after deletion
- `'bee-atlas.ts sets _sidebarOpen = false in _onClose'` — will FAIL after deletion

All three must be replaced with equivalent `_paneState` assertions.

**How to avoid:** Plan must include test updates in bee-atlas.test.ts as a task item.

### Pitfall 6: `_selectionBounds && this._sidebarOpen` guard in `_pushUrlState`

**What goes wrong:** Line 508:
```typescript
this._selectionBounds && this._sidebarOpen
  ? { type: 'bounds' as const, ...this._selectionBounds }
```
This guard ensures bounds selection is only serialized when the sidebar is open. After replacing
`_sidebarOpen` with `_paneState === 'list'`, the guard becomes:
```typescript
this._selectionBounds && this._paneState === 'list'
```
This is semantically correct, but easy to miss.

**Warning signs:** SEL-06 test `'_pushUrlState gives _selectionBounds precedence over cluster/ids'`
checks for `this._selectionBounds && this._sidebarOpen` — this assertion will break and needs
updating to reflect the new expression.

## Code Examples

### Minimum-viable paneState assignment

```typescript
// Source: bee-atlas.ts (this file — pattern to follow throughout)
// Replacing: this._sidebarOpen = true; this._viewMode stays 'map'
this._paneState = 'list';

// Replacing: this._sidebarOpen = false; (when not in table mode)
this._paneState = 'collapsed';

// Replacing: this._viewMode = 'table'; this._sidebarOpen = false;
this._paneState = 'table';
```

### Render() conditional replacements

```typescript
// CSS class — replacing _viewMode and _sidebarOpen reads
class=${[
  'content',
  this._paneState === 'table' ? 'table-mode' : '',
  this._paneState === 'list'  ? 'sidebar-open' : '',
].filter(Boolean).join(' ')}

// bee-table conditional — replacing _viewMode === 'table'
${this._paneState === 'table' ? html`<bee-table ...>` : nothing}

// bee-sidebar conditional — replacing _viewMode === 'map' && _sidebarOpen
${this._paneState === 'list' ? html`<bee-sidebar ...>` : nothing}

// bee-header viewMode prop — deriving 'map'|'table' from paneState
.viewMode=${this._paneState === 'table' ? 'table' : 'map'}

// bee-filter-panel props — replacing _viewMode reads
.hideButton=${this._paneState === 'table'}
.openUpward=${this._paneState === 'table'}
```

### _pushUrlState (simplified)

```typescript
// Source: bee-atlas.ts _pushUrlState — adapter removed
private _pushUrlState() {
  const params = buildParams(
    this._currentView,
    this._filterState,
    this._selectionBounds && this._paneState === 'list'
      ? { type: 'bounds' as const, ...this._selectionBounds }
      : this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
    { boundaryMode: this._boundaryMode, paneState: this._paneState }
  );
  // ... rest unchanged
}
```

### firstUpdated (adapter removed)

```typescript
// Source: bee-atlas.ts firstUpdated — direct assignment
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._paneState = paneState;                    // was: this._viewMode = paneState === 'table' ? 'table' : 'map'
if (paneState === 'table') import('./bee-table.ts');
```

### _onPopState (adapter removed)

```typescript
// Source: bee-atlas.ts _onPopState — direct assignment
const paneState = parsed.ui?.paneState ?? 'collapsed';
this._paneState = paneState;                    // was: this._viewMode = paneState === 'table' ? 'table' : 'map'
this._tablePage = 1;
if (this._paneState === 'table') {
  this._runTableQuery();
}
```

### _onViewChanged (table-to-map transition)

```typescript
// Source: bee-atlas.ts _onViewChanged
private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
  if (e.detail === 'table') {
    this._paneState = 'table';
    import('./bee-table.ts');
    this._tableLoading = true;
    this._runTableQuery();
    if (this._loading) {
      this._loadSummaryFromSQLite();
    }
    // D-08: sidebar implicitly closed when paneState = 'table'
    this._tableFilterOpen = false;
  } else {
    this._paneState = 'collapsed';    // returning from table → collapsed (sidebar was closed on enter)
  }
  this._pushUrlState();
}
```

### _runTableQuery guard (updated)

```typescript
// Source: bee-atlas.ts _runTableQuery
private async _runTableQuery(): Promise<void> {
  if (this._paneState !== 'table') return;   // was: if (this._viewMode !== 'table') return;
  // ... rest unchanged
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Three separate boolean/string flags | Single discriminated union `_paneState` | Phase 106 | Eliminates impossible states (e.g., `_viewMode='table'` + `_sidebarOpen=true`); simplifies rendering logic |
| `_pushUrlState` adapter code | Direct `paneState: this._paneState` | Phase 106 | Removes the temporary Phase 105 adapter |
| `firstUpdated`/`_onPopState` adapters | Direct `this._paneState = paneState` | Phase 106 | Removes the temporary Phase 105 adapters |

**Deprecated/outdated after Phase 106:**
- `_viewMode: 'map' | 'table'` — replaced by `_paneState`
- `_sidebarOpen: boolean` — replaced by `_paneState === 'list'`
- The Phase 105 temporary adapters in `firstUpdated`, `_onPopState`, and `_pushUrlState`

## Environment Availability

Step 2.6: SKIPPED (no external dependencies; pure TypeScript/in-project change)

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | vite.config.ts (`test:` block) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

Phase 106 has no formal requirement IDs (internal refactor). The three success criteria map to
test-verifiable assertions:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-------------------|----------|-----------|-------------------|-------------|
| SC-1: Behavior unchanged | All 448 existing tests pass | automated | `npm test` | yes |
| SC-2: `_viewMode`/`_sidebarOpen`/`_tableFilterOpen` gone | Source scan returns 0 matches | source scan | grep assertions in bee-atlas.test.ts | needs update |
| SC-3: Event handlers dispatch to _paneState | _paneState is set in handlers | source scan | grep assertions | needs new |

### Tests That Will Break and Must Be Updated

The following existing tests in `bee-atlas.test.ts` reference the deleted fields:

| Describe Block | Test Name | Action |
|---------------|-----------|--------|
| `VIEW-02` | `'bee-atlas.ts declares _viewMode as @state field'` | Replace with `_paneState` assertion |
| `SIDE-01` | `'bee-atlas.ts declares _sidebarOpen as @state()'` | Replace with `_paneState` assertion |
| `SIDE-01` | `'bee-atlas.ts sets _sidebarOpen = true in _onSpecimenClick'` | Replace with `this._paneState = 'list'` assertion |
| `SIDE-01` | `'bee-atlas.ts sets _sidebarOpen = false in _onClose'` | Replace with `this._paneState = 'collapsed'` assertion |
| `SEL-06` | `'SEL-06: _pushUrlState gives _selectionBounds precedence over cluster/ids'` | Update to `this._selectionBounds && this._paneState === 'list'` |

**New tests to add in bee-atlas.test.ts:**

```typescript
describe('SM-01: bee-atlas pane state machine (Phase 106)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts declares _paneState as @state() with three-state type', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_paneState/);
    expect(src).toMatch(/'collapsed'\s*\|\s*'list'\s*\|\s*'table'/);
  });

  test('bee-atlas.ts does NOT contain _viewMode field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_viewMode/);
    expect(src).not.toMatch(/this\._viewMode\s*=/);
  });

  test('bee-atlas.ts does NOT contain _sidebarOpen field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
    expect(src).not.toMatch(/this\._sidebarOpen\s*=/);
  });

  test('bee-atlas.ts does NOT contain _tableFilterOpen field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_tableFilterOpen/);
  });

  test('_onClose sets _paneState = collapsed', () => {
    const methodStart = src.indexOf('private _onClose()');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'collapsed'");
  });

  test('_onViewChanged sets _paneState = table when entering table mode', () => {
    const methodStart = src.indexOf('private _onViewChanged(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'table'");
  });

  test('firstUpdated assigns _paneState directly from parsed paneState', () => {
    expect(src).toMatch(/this\._paneState\s*=\s*paneState/);
    // Adapter should not exist
    expect(src).not.toMatch(/paneState\s*===\s*'table'\s*\?\s*'table'\s*:\s*'map'/);
  });
});
```

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run build`
- **Phase gate:** Full suite green + `tsc --noEmit` before `/gsd-verify-phase`

### Wave 0 Gaps

None — all necessary test infrastructure exists. Tests are being updated/added to the existing
`src/tests/bee-atlas.test.ts` file. No new test files required.

## Security Domain

This phase makes no changes to network access, DOM injection, auth, or URL parsing. All changes
are internal state field renames within a single component. No ASVS categories apply.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_tableFilterOpen` should be kept as a plain (non-@state) private field and the `.externalOpen` binding on `bee-filter-panel` should be removed in favor of imperative `setOpen()` only | Architecture Patterns (tableFilterOpen section) | If `.externalOpen` is used by tests or external code, dropping it could break behavior; but Phase 109 removes bee-filter-panel entirely, so this is low risk |
| A2 | When `_onViewChanged` receives `'map'`, the correct new paneState is `'collapsed'` (not `'list'`) because the sidebar was always closed when entering table mode | Code Examples (`_onViewChanged`) | If user expectations require the sidebar to reopen after leaving table mode, this would be wrong; but existing D-08 behavior says sidebar closes on table entry |

**If A2 is wrong:** The fix is straightforward — in `_onViewChanged` returning to map, use
`this._paneState = this._paneState === 'list' ? 'list' : 'collapsed'` with a saved pre-table
state. But given D-08 says sidebar closes on table entry, 'collapsed' is correct.

## Open Questions (RESOLVED)

1. **Should `_tableFilterOpen` be removed entirely or kept as a non-@state field?**
   - What we know: SC-3 says it must not exist in bee-atlas.ts. The `setOpen()` imperative call
     already drives the DOM update directly (line 851). The `.externalOpen` binding (line 219) is
     the only reason it exists as a reactive field.
   - Recommendation: Remove `_tableFilterOpen` as a `@state` field. Keep the `_onToggleFilter`
     method driving `setOpen()` directly, and drop the `.externalOpen=${this._tableFilterOpen}`
     binding from the `bee-filter-panel` template. Verify `bee-filter-panel.ts` for any dependency
     on `externalOpen` being set externally vs. via `setOpen()`.

2. **Does bee-header.ts need updating in Phase 106?**
   - What we know: `bee-header` accepts `.viewMode: 'map' | 'table'`. Phase 106 deletes
     `_viewMode` from bee-atlas.ts. The template binding must change, but the value can be
     derived: `this._paneState === 'table' ? 'table' : 'map'`.
   - Recommendation: Keep `bee-header`'s API unchanged for Phase 106. Use the derived expression.
     Phase 107/108 redesign the header/pane interaction.

## Sources

### Primary (HIGH confidence)

- `src/bee-atlas.ts` (full read, 1067 lines) — confirmed all three fields, all call sites, all
  event handlers that read/write them
- `src/bee-header.ts` (full read) — confirmed `viewMode: 'map' | 'table'` property and
  `view-changed` event detail type
- `src/tests/bee-atlas.test.ts` (full read, 552 lines) — confirmed all tests that reference
  `_viewMode`, `_sidebarOpen`, `_tableFilterOpen`, and SIDE-01/VIEW-02/SEL-06 test blocks
- `.planning/phases/105-url-state-migration/105-SUMMARY.md` — confirmed Phase 105 decisions:
  `_viewMode` preserved as temporary field; adapters in firstUpdated/_onPopState/_pushUrlState
- `.planning/phases/105-url-state-migration/105-VERIFICATION.md` — confirmed Phase 105 completed
  clean; 448 tests passing as baseline

### Secondary (MEDIUM confidence)

- ROADMAP.md Phase 106 description — confirmed "replace _viewMode/_sidebarOpen/_tableFilterOpen
  with _paneState; update all event handlers"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing toolchain confirmed in repo
- Architecture: HIGH — direct code reading; complete inventory of all flag usages
- Pitfalls: HIGH — derived directly from reading the test file and identifying which tests will
  break on field deletion

**Research date:** 2026-05-19
**Valid until:** Until Phase 107 planning (bee-header API and pane component will change)
