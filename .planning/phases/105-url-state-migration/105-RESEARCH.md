# Phase 105: URL State Migration - Research

**Researched:** 2026-05-19
**Domain:** TypeScript URL state management (url-state.ts), Lit web components
**Confidence:** HIGH

## Summary

Phase 105 is a surgical extension to the existing `url-state.ts` module. The current module
encodes UI state via a `UiState` interface with two fields: `boundaryMode` and `viewMode: 'map' | 'table'`. The goal is to replace `viewMode` with `paneState: 'list' | 'table'` (collapsed being the default/absent case) and add backward-compatibility parsing for the legacy `?view=table` parameter.

No new libraries are needed. No new components are created. The only files that change are
`url-state.ts` (the type and serialization logic) and `bee-atlas.ts` (the call sites). The
entire change is contained, testable with pure-function unit tests, and has zero visible UI
impact.

The codebase already has a comprehensive unit test suite for `url-state.ts` in
`src/tests/url-state.test.ts` covering every serialization and parse path. New tests for
`pane` follow the exact same pattern: one test for `buildParams` output, one for `parseParams`
round-trip, one for the legacy alias, and one verifying the default (collapsed) is omitted.

**Primary recommendation:** Extend `UiState.viewMode` → `UiState.paneState`, update
`buildParams`/`parseParams`, wire `bee-atlas.ts` call sites, add four Vitest unit tests.
Phase is ~60-80 lines of net diff.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| URL-01 | Pane state encoded in URL and restored on load; collapsed omitted; list and table encoded | `parseParams` parses `?pane=list` and `?pane=table`; `buildParams` emits `pane=list` or `pane=table`; absent = collapsed (default) |
| URL-02 | Legacy `?view=table` parsed as pane table state for backward compatibility | `parseParams` reads `view` param first then falls back; or reads both and gives `pane` precedence |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL serialization | Frontend (SPA) | — | Pure browser-side; static hosting constraint means no server can rewrite URLs |
| URL parsing on load | Frontend (`bee-atlas.ts` `firstUpdated`) | — | Lit lifecycle; `parseParams` is called once at mount |
| Popstate restore | Frontend (`bee-atlas.ts` `_onPopState`) | — | Browser history API; already handled by existing handler |
| Legacy alias | `url-state.ts` `parseParams` | — | Backward compat belongs in the parse layer, not in callers |

## Standard Stack

No external packages are added in this phase. Everything is in-project TypeScript.

### Existing Toolchain (all verified in codebase)

| Tool | Version | Role |
|------|---------|------|
| Lit | ^3.2.1 | Component framework; `bee-atlas.ts` is a `LitElement` |
| Vitest | ^4.1.2 | Unit test runner; `vitest run` via `npm test` |
| TypeScript | ^5.8.2 | Static typing; `tsc --noEmit` is part of build gate |
| happy-dom | ^20.8.9 | Vitest DOM environment |

[VERIFIED: package.json in repo]

## Package Legitimacy Audit

No packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### Current UiState (url-state.ts lines 29-32)

```typescript
// CURRENT — must be changed in Phase 105
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  viewMode: 'map' | 'table';
}
```

`viewMode: 'map'` is the default/absent case; `viewMode: 'table'` is serialized as `view=table`.

### Target UiState

```typescript
// TARGET after Phase 105
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table';   // 'list' serialized as pane=list, 'table' as pane=table
                                  // collapsed (default) is represented by ABSENCE of pane= param
}
```

`collapsed` is the new default case (param absent from URL). `list` and `table` are the
non-default states that get serialized.

### Serialization Rules

| Pane state | `buildParams` output | `parseParams` input |
|------------|---------------------|---------------------|
| collapsed  | no `pane=` param    | `pane` absent       |
| list       | `pane=list`         | `pane=list`         |
| table      | `pane=table`        | `pane=table`        |
| (legacy)   | n/a — only on write | `view=table` → table |

The default-omission pattern is already used by `boundaryMode` (`bm` absent = `off`), so
this follows existing convention. [VERIFIED: url-state.ts lines 72-74]

### Legacy Alias in parseParams

Two clean approaches:

**Option A — Give `pane=` precedence, fall back to `view=`:**
```typescript
const paneRaw = p.get('pane') ?? '';
const viewRaw = p.get('view') ?? '';
const paneState: 'list' | 'table' | 'collapsed' =
  paneRaw === 'list' ? 'list'
  : paneRaw === 'table' ? 'table'
  : viewRaw === 'table' ? 'table'   // legacy alias
  : 'collapsed';
```

**Option B — Normalize `view=table` to `pane=table` before processing:**
```typescript
// Early in parseParams:
if (!p.has('pane') && p.get('view') === 'table') {
  p.set('pane', 'table');
}
```

Option A is preferred: it's explicit about the fallback and leaves the raw params untouched.

### Call Sites in bee-atlas.ts

All three places that read/write `viewMode` must be updated:

1. **`firstUpdated` (line ~244):** `initialParams.ui?.viewMode ?? 'map'` → `initialParams.ui?.paneState ?? 'collapsed'`
2. **`_pushUrlState` (line ~509):** `{ boundaryMode: ..., viewMode: this._viewMode }` → `{ boundaryMode: ..., paneState: this._paneState }`
3. **`_onPopState` (line ~551):** `this._viewMode = parsed.ui?.viewMode ?? 'map'` → `this._paneState = parsed.ui?.paneState ?? 'collapsed'`

There is also a fourth pattern in `buildParams` call at the bottom of `firstUpdated` (line ~299).

Note: `_viewMode` in `bee-atlas.ts` currently holds `'map' | 'table'`. Phase 105 introduces a
local mapping: `paneState='collapsed'` → viewMode stays `'map'`; `paneState='table'` → viewMode
`'table'`. Phase 106 will replace `_viewMode` wholesale. For Phase 105 only, the adapter
is a thin translation at each call site:

```typescript
// Temporary adapter at _pushUrlState — removes in Phase 106
const paneState: 'list' | 'table' | 'collapsed' =
  this._viewMode === 'table' ? 'table'
  : this._sidebarOpen ? 'list'
  : 'collapsed';
```

And at restore time:
```typescript
// firstUpdated + _onPopState adapter
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
if (paneState === 'list') {
  // no dedicated state yet — treated as map mode; Phase 106 will handle
  // (Phase 105 success criterion 2 says ?pane=list restores "list state")
}
```

The key question for Phase 105 SC #2 is: what does "pane in list state on load" mean when
`_viewMode` has only `'map' | 'table'`? Looking at the current code, `'map'` mode with
`_sidebarOpen = false` is the collapsed baseline; `'map'` mode with sidebar open or filter
panel visible is functionally "list state." Phase 105 requirements say no visible UI change —
so `?pane=list` on load can be treated as `map` mode (the filter panel is always visible in
map mode). This is consistent with Phase 106 being the one that introduces the real state
machine.

### Recommended Project Structure

No file changes to directory structure. Only two existing files change:

```
src/
├── url-state.ts        # UiState.viewMode → paneState; buildParams; parseParams
├── bee-atlas.ts        # 4 call sites updated to use paneState
└── tests/
    └── url-state.test.ts   # New describe block: 'pane state param (URL-01, URL-02)'
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| URL serialization | Custom base64/JSON blob | Plain query params (existing pattern in url-state.ts) |
| Legacy URL redirects | Server-side redirect | Client-side alias in `parseParams` |
| State machine | Home-grown reducer | Phase 106 will use Lit `@state` — Phase 105 just changes param names |

## Common Pitfalls

### Pitfall 1: Forgetting the `buildParams` include-when-non-default guard

**What goes wrong:** The existing `buildParams` only emits `view=table` when viewMode !== 'map'
(line 74). The new code must emit `pane=list` when paneState === 'list' and `pane=table` when
paneState === 'table', but NEVER emit `pane=collapsed`.

**How to avoid:** Mirror the pattern: `if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);`

**Warning signs:** Test for "collapsed state is omitted" (SC #3) will catch this.

### Pitfall 2: Not removing the old `view=` write path

**What goes wrong:** If `buildParams` still emits `view=table`, old and new params coexist. A
user sharing a `?pane=table` URL from new code is fine. But if old `view=table` is also emitted,
the URL is cluttered and future phases may see both.

**How to avoid:** Remove the `view=` write in `buildParams` at the same time the `pane=` write
is added.

### Pitfall 3: Breaking existing `bee-atlas.test.ts` SIDE-01 / VIEW-02 regex assertions

**What goes wrong:** `bee-atlas.test.ts` has string-scan tests like:
- `/_viewMode/` presence assertion
- `/parsed\.ui\?\.viewMode \?\? 'map'/` assertion

After Phase 105 renames `_viewMode` → `_paneState`, these tests will fail.

**How to avoid:** Update the text-scan assertions in `bee-atlas.test.ts` alongside the
source changes. Specifically:
- `VIEW-02: "_onPopState restores _viewMode from URL"` test (line ~178) checks for the old string.
- `SIDE-01: "declares _sidebarOpen"` tests don't reference viewMode, so those are fine.

**Warning signs:** `npm test` failure in `bee-atlas.test.ts` VIEW-02 suite.

### Pitfall 4: Omitting the legacy alias test

**What goes wrong:** SC #4 requires `?view=table` to work as `?pane=table`. If only a happy-path
test for `pane=table` is added, the legacy case is untested and may silently break.

**How to avoid:** Add an explicit test:
```typescript
test('legacy view=table parsed as pane table state (URL-02)', () => {
  const result = parseParams('view=table');
  expect(result.ui?.paneState).toBe('table');
});
```

### Pitfall 5: `UiState` shape change breaks TypeScript callers without compile check

**What goes wrong:** If `viewMode` is removed from `UiState` but callers still reference
`parsed.ui?.viewMode`, TypeScript will catch it — but only if `tsc --noEmit` is run.

**How to avoid:** Run `npm run typecheck` after changes. The CI gate also runs it.

## Code Examples

### buildParams pane serialization

```typescript
// Source: url-state.ts (existing pattern for boundaryMode, lines 72-73)
// New pattern for paneState:
if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);
// Remove old: if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
```

### parseParams pane deserialization with legacy alias

```typescript
// Source: url-state.ts (to be added in parseParams)
const paneRaw = p.get('pane') ?? '';
const viewRaw = p.get('view') ?? '';   // legacy — read but not written
const paneState: 'list' | 'table' | 'collapsed' =
  paneRaw === 'list'   ? 'list'   :
  paneRaw === 'table'  ? 'table'  :
  viewRaw === 'table'  ? 'table'  :   // URL-02 backward compat
  'collapsed';
// Include in result when non-default:
if (boundaryMode !== 'off' || paneState !== 'collapsed') {
  result.ui = { boundaryMode, paneState };
}
```

### bee-atlas.ts adapter (firstUpdated)

```typescript
// Source: bee-atlas.ts firstUpdated (existing pattern)
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
// pane=list treated as map mode in Phase 105 (no visible change per goal)
```

### url-state.test.ts new tests

```typescript
describe('pane state param (URL-01, URL-02)', () => {
  test('pane=table: buildParams emits pane=table', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'table' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('pane')).toBe('table');
    expect(params.has('view')).toBe(false);   // old param gone
  });

  test('pane=list: buildParams emits pane=list', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'list' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('pane')).toBe('list');
  });

  test('pane=collapsed (default): pane param absent', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.has('pane')).toBe(false);
  });

  test('legacy view=table: parsed as pane=table (URL-02)', () => {
    const result = parseParams('view=table');
    expect(result.ui?.paneState).toBe('table');
  });

  test('pane=table takes precedence over view=table', () => {
    const result = parseParams('pane=table&view=table');
    expect(result.ui?.paneState).toBe('table');
  });

  test('pane=list round-trips', () => {
    const result = parseParams('pane=list');
    expect(result.ui?.paneState).toBe('list');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `viewMode: 'map' \| 'table'` in `UiState` | `paneState: 'list' \| 'table' \| 'collapsed'` | Phase 105 | Three-state pane replaces binary map/table |
| `?view=table` URL param | `?pane=table` (primary); `?view=table` (legacy alias) | Phase 105 | Old links remain functional |

**Deprecated/outdated after Phase 105:**
- `UiState.viewMode`: replaced by `paneState`; `view=` param no longer written by `buildParams`
- `?view=table` as the canonical table URL: still parsed but no longer emitted

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

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| URL-01 | pane=table in URL restores table pane state | unit | `npm test -- url-state` | existing file; new describe block |
| URL-01 | pane=list in URL restores list pane state | unit | `npm test -- url-state` | existing file; new describe block |
| URL-01 | collapsed (default) omitted from URL | unit | `npm test -- url-state` | existing file; new test |
| URL-02 | ?view=table treated as pane table state | unit | `npm test -- url-state` | existing file; new test |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-phase`

### Wave 0 Gaps

None — `src/tests/url-state.test.ts` already exists and follows the exact pattern needed.
New tests are added to the existing file in a new `describe` block. No new test infrastructure
required.

## Security Domain

This phase touches URL query parameter parsing. The existing `parseParams` validation model
(strict allowlisting of values, no eval, no innerHTML) is unchanged. No ASVS categories apply
beyond V5 Input Validation, which is already satisfied by the enum-check pattern used throughout
`parseParams` (e.g., `paneRaw === 'list' ? 'list' : ...`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pane=list` on load should be treated as map mode (`_viewMode='map'`) in Phase 105 since no dedicated list state exists yet | Code Examples (adapter) | If user sees a "flash" of wrong pane state on load from a `?pane=list` URL; acceptable per "no visible UI change" goal |

**If A1 is wrong:** The SC says "pane in list state on load" — since Phase 106 introduces
the real state machine, "list state" in Phase 105 is best understood as "not table." The adapter
is correct.

## Open Questions (RESOLVED)

1. **Should `?view=map` also be aliased?**
   - What we know: The legacy param was `view=table` or absent (map was the default).
   - What's unclear: If anyone shares a `?view=map` URL, it currently parses as `viewMode='map'` (which becomes `paneState='collapsed'` after this phase). That is correct behavior.
   - Recommendation: No action needed; absence = collapsed is already the right fallback.

2. **Does removing `view=table` from `buildParams` output break any external bookmark?**
   - What we know: Any existing bookmark or shared URL using `?view=table` will still work (URL-02 covers this). New URLs use `?pane=table`. Since the site is a SPA with no server-side URL handling, there is no SEO or crawl risk.
   - Recommendation: Proceed; backward compat is handled entirely in `parseParams`.

## Sources

### Primary (HIGH confidence)

- `src/url-state.ts` (full read) — confirmed current `UiState`, `buildParams`, `parseParams`
- `src/bee-atlas.ts` (full read) — confirmed all four call sites
- `src/tests/url-state.test.ts` (full read) — confirmed test patterns and existing coverage
- `src/tests/bee-atlas.test.ts` (full read) — confirmed VIEW-02 text-scan assertions that will need updating
- `.planning/REQUIREMENTS.md` — confirmed URL-01, URL-02 requirements verbatim
- `package.json` — confirmed Vitest 4.1.2, no packages to add

### Secondary (MEDIUM confidence)

- ROADMAP.md Phase 105/106 descriptions — confirmed "no visible UI change" intent and Phase 106 as the state machine replacement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from verified source files in the repo
- Architecture: HIGH — direct code reading; no external libraries involved
- Pitfalls: HIGH — derived from reading existing tests that will be affected

**Research date:** 2026-05-19
**Valid until:** Until Phase 106 planning (paneState type may evolve once `_viewMode` is replaced wholesale)
