# Phase 45: Sidebar Feed Discovery - Research

**Researched:** 2026-04-11
**Domain:** Lit Web Components / Frontend UI integration
**Confidence:** HIGH

## Summary

Phase 45 adds a Feeds section to `bee-sidebar` that surfaces Atom feed subscription URLs when
collectors are selected. The implementation is entirely within the existing Lit component
architecture — no new libraries, no new build steps, and no new backend work.

The two-component flow is already established: `bee-atlas` fetches data and passes it down to
`bee-sidebar` as properties. This phase follows the exact same prop-down pattern used for
`collectorOptions`, `filteredSummary`, and every other dynamic data slice. The only novel element
is the `fetch('/data/feeds/index.json')` call in `bee-atlas` and the `_renderFeedsSection()`
method in `bee-sidebar`.

`navigator.clipboard.writeText()` is used for the Copy URL button. HTTPS is guaranteed by
CloudFront (static hosting constraint from CLAUDE.md), so the Clipboard API is unconditionally
available.

**Primary recommendation:** Implement as two focused tasks — (1) `bee-atlas` data fetch +
`activeFeedEntries` computation, (2) `bee-sidebar` `FeedEntry` interface + `_renderFeedsSection()`
render method + teaser hint in `_renderSummary()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Show the Feeds section when at least one collector is active in `filterState.selectedCollectors`.
- **D-02:** When no collector filter is active and layer mode is specimens, show a static teaser hint in the sidebar — e.g. "Filter by collector to subscribe to their determination feed."
- **D-03:** Feed scope is collector-only. Genus/county/ecoregion variant feeds are not surfaced in this phase even if those filters are active.
- **D-04:** Feeds appear in a dedicated "Feeds" section — a visually separated panel at the bottom of the sidebar content area, below the filter controls.
- **D-05:** Each collector entry in the section shows: collector name + "determinations" label, a **Copy URL** button, and an **Open** link (opens feed XML in new tab).
- **D-06:** When multiple collectors are selected, show one row per collector.
- **D-07:** `bee-atlas` fetches `/data/feeds/index.json` once at startup (alongside parquet init). It builds a `Map<collectorName, feedEntry>` keyed on `filter_value` (collector name string, case-sensitive match against `filterState.selectedCollectors`).
- **D-08:** `bee-atlas` computes `activeFeedEntries: FeedEntry[]` — the subset of index entries whose `filter_value` matches currently selected collectors — and passes it to `bee-sidebar` as a property.
- **D-09:** `bee-sidebar` remains a pure presenter: it receives `activeFeedEntries` and renders them; no fetching inside bee-sidebar.
- **D-10:** If index.json fails to load (network error), the Feeds section is simply absent — no error state needed.

### Claude's Discretion

- Exact CSS styling of the Feeds section (should be consistent with existing sidebar panel visual language)
- Placement of the teaser hint within the existing summary panel or as a standalone hint paragraph
- How to handle the case where a selected collector has no matching entry in index.json (e.g. skip silently or omit that row)
- Copy URL feedback (e.g. brief "Copied!" flash vs silent)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | 3.x (already installed) | Web component base for `bee-sidebar` and `bee-atlas` | Project-wide framework [VERIFIED: codebase] |
| navigator.clipboard | Browser native | Copy URL to clipboard | Guaranteed on HTTPS; no polyfill needed [VERIFIED: CLAUDE.md static hosting constraint] |

### Supporting

No new libraries required. This phase uses only existing project dependencies.

**Installation:** None — no new packages.

## Architecture Patterns

### Recommended Project Structure

No new files. All changes are within:
```
frontend/src/
├── bee-atlas.ts    — add fetch + _feedIndex Map + _activeFeedEntries @state + pass to sidebar
└── bee-sidebar.ts  — add FeedEntry interface, activeFeedEntries @property, _renderFeedsSection()
```

### Pattern 1: Prop-Down Data Flow (Established)

**What:** `bee-atlas` fetches external data at startup, stores in `@state`, computes a derived
slice, and passes it to `bee-sidebar` as `@property({ attribute: false })`. `bee-sidebar` renders
from it. No fetching inside sub-components.

**When to use:** All dynamic data visible in the sidebar. This phase follows the exact same
pattern used for `collectorOptions`, `recentSampleEvents`, `filteredSummary`.

**Example (existing reference):**
```typescript
// Source: frontend/src/bee-atlas.ts — existing pattern for collectorOptions
@state() private _collectorOptions: CollectorEntry[] = [];
// ... fetched in _loadCollectorOptions(), passed as .collectorOptions=${this._collectorOptions}

// New @state fields for this phase:
@state() private _feedIndex: Map<string, FeedEntry> = new Map();
@state() private _activeFeedEntries: FeedEntry[] = [];
```

### Pattern 2: Startup Fetch (Established)

**What:** Fire-and-forget `fetch()` in `firstUpdated()`, catch errors silently, store result in
`@state`. Failed fetch = empty state = feature absent (matches D-10).

**When to use:** Optional data that enhances UI but is not required for core functionality.

**Example sketch:**
```typescript
// In firstUpdated() in bee-atlas.ts, alongside existing fetches
fetch('/data/feeds/index.json')
  .then(r => r.json())
  .then((entries: FeedEntry[]) => {
    this._feedIndex = new Map(entries.map(e => [e.filter_value, e]));
  })
  .catch(() => { /* D-10: absent on error, no error state */ });
```

### Pattern 3: Derived State Computation

**What:** `_activeFeedEntries` is derived from `_feedIndex` + `_filterState.selectedCollectors`.
It should be recomputed in any handler that updates `_filterState` (primarily `_onFilterChanged`)
and after the index.json fetch resolves.

**Key detail:** `CollectorEntry.recordedBy` (not `displayName`) is the `filter_value` match key.
`filter_value` in index.json is the `recordedBy` (specimen database name), not an iNat username.
Confirmed by inspecting index.json: `"filter_value": "Aidan Hersh"` — matches `recordedBy` field
in ecdysis table. [VERIFIED: codebase — frontend/public/data/feeds/index.json + filter.ts CollectorEntry]

```typescript
private _computeActiveFeedEntries(): void {
  const entries = this._filterState.selectedCollectors
    .map(c => c.recordedBy ? this._feedIndex.get(c.recordedBy) : undefined)
    .filter((e): e is FeedEntry => e !== undefined);
  this._activeFeedEntries = entries;
}
```

### Pattern 4: bee-sidebar Pure Presenter (Architecture Invariant)

**What:** Add `activeFeedEntries: FeedEntry[] = []` as `@property({ attribute: false })`. Render
in a new `_renderFeedsSection()` private method. Call it from `render()` unconditionally — the
method returns `nothing` when `activeFeedEntries` is empty (or renders teaser instead).

**Teaser placement:** Within `_renderSummary()`, append a hint paragraph when `activeFeedEntries`
is empty AND `layerMode === 'specimens'`. This matches where the "Click a specimen point" hint
already lives.

**FeedEntry interface** (define in bee-sidebar.ts, export for use in bee-atlas.ts):
```typescript
export interface FeedEntry {
  filename: string;
  url: string;
  title: string;
  filter_type: string;
  filter_value: string;
  entry_count: number;
}
```

### Pattern 5: Copy-to-Clipboard with Feedback (Discretion area)

**What:** `navigator.clipboard.writeText(entry.url)` — no try/catch needed on HTTPS. Brief
"Copied!" visual feedback is achievable with a local `@state` set in the click handler and a
`setTimeout` to clear it. A simple approach: a single `_copiedUrl: string | null = null` `@state`
in `bee-sidebar` — set to `entry.url` on copy, cleared after 1500ms.

**Anti-pattern to avoid:** Adding `@state` to `bee-sidebar` violates the DECOMP test suite's
spirit (bee-sidebar is a presenter). However the existing tests only prohibit `@state` on
`bee-filter-controls`, `bee-specimen-detail`, and `bee-sample-detail` — not `bee-sidebar` itself.
`bee-sidebar` already has no `@state`, but adding one purely for transient UI feedback
(copied flash) is acceptable. Alternatively, do silent copy — simpler, no state.

**Recommendation:** Silent copy is simpler and avoids any new `@state` in bee-sidebar. If the
user later wants feedback, it's a one-line addition.

### Anti-Patterns to Avoid

- **Fetching in bee-sidebar:** Violates architecture invariant (D-09, CLAUDE.md). All fetches go in bee-atlas.
- **Storing feed index in filter.ts:** filter.ts handles query logic; feed discovery is UI-layer concern for bee-atlas.
- **Re-fetching index.json on each filter change:** Fetch once at startup, store in `_feedIndex` Map.
- **Keying by `displayName` instead of `recordedBy`:** `filter_value` in index.json matches `recordedBy`, not the display name. Using `displayName` would cause misses for collectors whose display name differs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard copy | Custom clipboard utility | `navigator.clipboard.writeText()` | Native browser API, HTTPS guaranteed |
| Feed URL construction | String templating from collector name | Read `url` field from index.json entry | URLs are pre-computed by the pipeline |

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield UI feature addition, not a rename/refactor/migration phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `/data/feeds/index.json` | Feed discovery | ✓ | Generated by Phase 42–44 pipeline | D-10: absent on fetch failure |
| navigator.clipboard | Copy URL button | ✓ | Browser native, HTTPS guaranteed | — |

**Missing dependencies with no fallback:** None.

## Common Pitfalls

### Pitfall 1: recordedBy vs displayName key mismatch

**What goes wrong:** `CollectorEntry.displayName` is used as the lookup key in `_feedIndex`, but
index.json uses `filter_value` = `recordedBy` (the ecdysis database string). If a collector's
display name differs from their `recordedBy` field, the lookup returns `undefined`.

**Why it happens:** `CollectorEntry` has both `displayName` and `recordedBy` fields; the display
name is shown in the UI, making it the intuitive key to use.

**How to avoid:** Always key `_feedIndex` on `filter_value` (= `recordedBy`). Look up with
`c.recordedBy` from `CollectorEntry`. When `c.recordedBy` is null (iNat-only collector), skip.

**Warning signs:** Feed rows silently missing for collectors that have feeds.

### Pitfall 2: index.json fetch racing with filter restoration

**What goes wrong:** Page loads with a collector filter in the URL. `_filterState` is restored
synchronously in `firstUpdated()`. `_activeFeedEntries` computation fires before `_feedIndex` is
populated (the fetch is async), yielding an empty feeds section.

**Why it happens:** Both URL restore and fetch happen in `firstUpdated()`, but the fetch resolves
later.

**How to avoid:** In the `.then()` callback of the index.json fetch, call
`_computeActiveFeedEntries()` after setting `_feedIndex`. This recomputes entries using the
already-restored `_filterState`.

**Warning signs:** Feeds section absent on page load with collector filter in URL, but appears
after any filter interaction.

### Pitfall 3: Feeds section appears in samples mode with no collector filter

**What goes wrong:** Teaser hint renders in samples layer mode when no collector filter is active,
which is confusing since collector feeds are specimen-context features.

**How to avoid:** D-02 specifies teaser only when `layerMode === 'specimens'` and no collector
filter. Wrap teaser condition: `this.layerMode === 'specimens' && this.activeFeedEntries.length === 0`.

### Pitfall 4: absolute vs relative URL in feed entries

**What goes wrong:** index.json `url` field contains `/data/feeds/collector-xyz.xml` (root-relative).
`Open` link works fine as `href`. But if copied URL is opened cross-origin, root-relative path
fails. However, this is not a problem to solve in this phase — the link target and copy target
should be the same value from index.json.

**How to avoid:** Use `entry.url` directly for both the `<a href>` and the clipboard copy. Don't
construct absolute URLs or transform paths.

## Code Examples

### FeedEntry interface and property declaration (bee-sidebar.ts)

```typescript
// Source: [ASSUMED] — following established interface pattern in bee-sidebar.ts
export interface FeedEntry {
  filename: string;
  url: string;
  title: string;
  filter_type: string;
  filter_value: string;
  entry_count: number;
}

// In BeeSidebar class:
@property({ attribute: false })
activeFeedEntries: FeedEntry[] = [];
```

### _renderFeedsSection() sketch (bee-sidebar.ts)

```typescript
// Source: [ASSUMED] — following _renderRecentSampleEvents() pattern
private _renderFeedsSection() {
  if (this.activeFeedEntries.length === 0) return nothing;
  return html`
    <div class="panel-content feeds-section">
      <h3>Feeds</h3>
      ${this.activeFeedEntries.map(entry => html`
        <div class="feed-row">
          <span class="feed-label">${entry.filter_value} — determinations</span>
          <button @click=${() => navigator.clipboard.writeText(entry.url)}>Copy URL</button>
          <a href="${entry.url}" target="_blank" rel="noopener">Open</a>
        </div>
      `)}
    </div>
  `;
}
```

### index.json fetch in bee-atlas.ts firstUpdated()

```typescript
// Source: [ASSUMED] — following existing fire-and-forget fetch pattern
fetch('/data/feeds/index.json')
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then((entries: FeedEntry[]) => {
    this._feedIndex = new Map(entries.map(e => [e.filter_value, e]));
    this._computeActiveFeedEntries(); // handles URL-restored filter state
  })
  .catch(() => {}); // D-10: silent failure, feature simply absent
```

### Recompute in _onFilterChanged

```typescript
// Source: [ASSUMED] — add one line to existing _onFilterChanged handler
private _onFilterChanged(e: CustomEvent<FilterChangedEvent>) {
  // ... existing handler ...
  this._computeActiveFeedEntries(); // add this
}
```

## State of the Art

No new technology introduced. All patterns are stable Lit 3.x patterns already in use throughout
this codebase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via vite.config.ts `test` block) |
| Config file | `frontend/vite.config.ts` (inline test config) |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/frontend && npm test` |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/frontend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-07/D-08 | `bee-atlas` has `activeFeedEntries` property passed to bee-sidebar | unit (source inspection) | `npm test` | ❌ Wave 0 |
| D-09 | `bee-sidebar` has `activeFeedEntries` `@property` declaration | unit (elementProperties) | `npm test` | ❌ Wave 0 |
| D-09 | `bee-sidebar` does NOT fetch internally | unit (source inspection — no `fetch` in bee-sidebar.ts) | `npm test` | ❌ Wave 0 |
| D-05 | Feeds section renders Copy URL button and Open link | unit (source inspection) | `npm test` | ❌ Wave 0 |

These tests follow the existing pattern in `bee-atlas.test.ts` / `bee-sidebar.test.ts`: source
inspection (`readFileSync`) for structural invariants, and `elementProperties` checks for property
declarations.

### Sampling Rate

- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm test`
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/frontend && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Tests in `frontend/src/tests/bee-sidebar.test.ts` — new describe block for `DISC-02: activeFeedEntries property` (add to existing file)
- [ ] Tests in `frontend/src/tests/bee-atlas.test.ts` — new describe block for feed index fetch and `activeFeedEntries` computation (add to existing file)

*(No new test files needed — add describe blocks to existing test files.)*

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (low risk) | index.json entries rendered as text/href — use `entry.url` directly in `href`, not in `innerHTML` |
| V6 Cryptography | no | — |

**Key note:** Feed URLs from index.json are pipeline-generated and root-relative (`/data/feeds/...`).
They are safe to use as `href` values in Lit `html` templates (Lit escapes attribute values).
No XSS risk from the index.json data given the controlled pipeline source.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `filter_value` in index.json maps to `CollectorEntry.recordedBy` (not `displayName`) | Architecture Patterns, Pitfall 1 | Feed rows silently absent; use displayName lookup as fallback |
| A2 | `_computeActiveFeedEntries()` should be called in `_onFilterChanged` (and after fetch) | Code Examples | Feeds section stale until next render trigger |

Note: A1 is verified by reading both index.json (shows `"filter_value": "Aidan Hersh"`) and
ecdysis data (recordedBy = collector's human name). The CONTEXT.md explicitly states "case-sensitive
match against `filterState.selectedCollectors`" using the `filter_value` field — and `selectedCollectors`
entries have `recordedBy` as the match field. [VERIFIED: codebase]

## Open Questions

1. **Copy URL feedback: silent vs "Copied!" flash**
   - What we know: Discretion area per CONTEXT.md. Silent is simpler. Flash requires `@state` or transient local state.
   - What's unclear: User preference.
   - Recommendation: Start silent; the planner can add a `_copiedUrl` state if desired — it's a two-line addition.

2. **Teaser hint visibility in samples mode**
   - What we know: D-02 specifies teaser when no collector filter AND specimens mode.
   - What's unclear: Whether to also show teaser when samples mode is active (feed discovery might be useful there too).
   - Recommendation: Follow D-02 strictly — specimens mode only. The teaser text refers to determination feed which is specimen-specific.

## Sources

### Primary (HIGH confidence)

- `frontend/src/bee-sidebar.ts` — full source read; confirms existing CSS classes, render patterns, and property declarations
- `frontend/src/bee-atlas.ts` — full source read; confirms init sequence, fetch pattern, @state/@property conventions
- `frontend/src/filter.ts` — read; confirms `CollectorEntry` fields (`recordedBy`, `observer`, `displayName`)
- `frontend/public/data/feeds/index.json` — read sample; confirms schema (`filter_value` = human collector name)
- `.planning/phases/45-sidebar-feed-discovery/45-CONTEXT.md` — full decisions read
- `frontend/vite.config.ts` — confirms Vitest test framework
- `frontend/src/tests/bee-sidebar.test.ts`, `bee-atlas.test.ts` — read; confirms test patterns (source inspection + elementProperties)

### Secondary (MEDIUM confidence)

- `.planning/phases/44-pipeline-wiring-and-discovery/44-CONTEXT.md` — Phase 44 context confirming DISC-01 (HTML autodiscovery) is complete

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all existing, well-understood project dependencies
- Architecture: HIGH — follows established patterns verified in source code
- Pitfalls: HIGH — derived from direct code inspection, not speculation
- Test patterns: HIGH — verified from existing test files

**Research date:** 2026-04-11
**Valid until:** 90 days (stable Lit patterns, static codebase)
