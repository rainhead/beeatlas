# Phase 45: Sidebar Feed Discovery - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Feeds" section to the sidebar that surfaces the Atom feed URL(s) for each active collector filter selection — allowing collectors to discover and subscribe to their personal determination feed directly from the sidebar. Also show a static teaser hint when no collector filter is active (specimens mode).

</domain>

<decisions>
## Implementation Decisions

### Discovery Trigger
- **D-01:** Show the Feeds section when at least one collector is active in `filterState.selectedCollectors`.
- **D-02:** When no collector filter is active and layer mode is specimens, show a static teaser hint in the sidebar — e.g. "Filter by collector to subscribe to their determination feed." This makes the feature discoverable without cluttering the default view.
- **D-03:** Feed scope is collector-only. Genus/county/ecoregion variant feeds are not surfaced in this phase even if those filters are active.

### Presentation
- **D-04:** Feeds appear in a dedicated "Feeds" section — a visually separated panel at the bottom of the sidebar content area, below the filter controls.
- **D-05:** Each collector entry in the section shows: collector name + "determinations" label, a **Copy URL** button, and an **Open** link (opens feed XML in new tab).
- **D-06:** When multiple collectors are selected, show one row per collector.

### Data Flow
- **D-07:** `bee-atlas` fetches `/data/feeds/index.json` once at startup (alongside parquet init). It builds a `Map<collectorName, feedEntry>` keyed on `filter_value` (collector name string, case-sensitive match against `filterState.selectedCollectors`).
- **D-08:** `bee-atlas` computes `activeFeedEntries: FeedEntry[]` — the subset of index entries whose `filter_value` matches currently selected collectors — and passes it to `bee-sidebar` as a property.
- **D-09:** `bee-sidebar` remains a pure presenter: it receives `activeFeedEntries` and renders them; no fetching inside bee-sidebar.
- **D-10:** If index.json fails to load (network error), the Feeds section is simply absent — no error state needed.

### Claude's Discretion
- Exact CSS styling of the Feeds section (should be consistent with existing sidebar panel visual language)
- Placement of the teaser hint within the existing summary panel or as a standalone hint paragraph
- How to handle the case where a selected collector has no matching entry in index.json (e.g. skip silently or omit that row)
- Copy URL feedback (e.g. brief "Copied!" flash vs silent)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend architecture
- `frontend/src/bee-sidebar.ts` — pure presenter; add `activeFeedEntries` property and Feeds section render here
- `frontend/src/bee-atlas.ts` — coordinator; add index.json fetch and `activeFeedEntries` computation here
- `CLAUDE.md` §Architecture Invariants — state ownership rule: bee-atlas owns all state; bee-sidebar is a pure presenter

### Feed data
- `frontend/public/data/feeds/index.json` — runtime data; schema: `{ filename, url, title, filter_type, filter_value, entry_count }`
- `.planning/REQUIREMENTS.md` — FEED-* and DISC-* requirements for context

### Prior phase context
- `.planning/phases/43-feed-variants/43-CONTEXT.md` — feed variant generation decisions
- `.planning/phases/44-pipeline-wiring-and-discovery/44-CONTEXT.md` — Phase 44 context (DISC-01: HTML autodiscovery tag already done)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bee-sidebar.ts` — `_renderSummary()` is where the teaser hint would appear (when no filter active + specimens mode)
- `bee-sidebar.ts` CSS — `.panel-content`, `.hint` classes exist; Feeds section should reuse `.panel-content` wrapper
- `bee-atlas.ts` — already fetches parquet and geojson at init; index.json fetch follows the same pattern
- `filterState.selectedCollectors: CollectorEntry[]` — each `CollectorEntry` has a `.name` string field that maps to `filter_value` in index.json

### Established Patterns
- Props flow down from `bee-atlas` to `bee-sidebar` as `@property({ attribute: false })` decorated fields
- `bee-sidebar` dispatches custom events upward for user actions (layer-changed, view-changed, sample-event-click)
- Copy-to-clipboard: use `navigator.clipboard.writeText()` (static hosting, HTTPS guaranteed by CloudFront)

### Integration Points
- `bee-atlas.ts` init sequence — add `fetch('/data/feeds/index.json')` alongside existing data fetches
- `bee-sidebar.ts` `render()` — add `${this._renderFeedsSection()}` call, conditionally rendering Feeds section or teaser
- `bee-sidebar.ts` properties — add `activeFeedEntries: FeedEntry[] = []` property (new interface to define)

</code_context>

<specifics>
## Specific Ideas

- Teaser copy suggestion from user: "search by collector name to subscribe to a feed of determinations" (or similar wording) — should appear in the summary panel when no collector filter is active
- The Feeds section mockup: collector name + "— determinations" label, [Copy URL] button, [Open] link per row

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 45-sidebar-feed-discovery*
*Context gathered: 2026-04-11*
