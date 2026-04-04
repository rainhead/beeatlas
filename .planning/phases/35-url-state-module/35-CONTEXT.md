# Phase 35: URL State Module - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract `buildSearchParams` and `parseUrlParams` from `bee-map.ts` into a pure `url-state.ts` module with no component or DOM dependencies. This phase delivers URL-01 (pure module). URL-02 (`_restored*` elimination, bee-atlas as URL owner) is deferred to Phase 36 — bee-atlas does not exist yet. bee-map.ts continues to own URL reads/writes after this phase, now using the new module's pure functions.

</domain>

<decisions>
## Implementation Decisions

### AppState type structure
- **D-01:** Split sub-types rather than a flat interface: `ViewState` (lon, lat, zoom), `FilterState` (reused from `filter.ts`), `SelectionState` (occurrenceIds), `UiState` (layerMode, boundaryMode). Compose into `AppState = { view: ViewState, filter: FilterState, selection: SelectionState, ui: UiState }`.
- **D-02:** The filter slice reuses `FilterState` from `filter.ts` directly — no duplication. `url-state.ts` imports `FilterState` from `filter.ts` (one-way dep, no circularity).

### Module API
- **D-03:** Serialize function takes sub-types directly: `buildParams(view: ViewState, filter: FilterState, selection: SelectionState, ui: UiState): URLSearchParams`. No AppState assembly at the call site.
- **D-04:** Deserialize returns only what's present in the URL: `parseParams(search: string): Partial<AppState>`. Caller is responsible for applying defaults and clamping to missing fields.
- **D-05:** Default values (DEFAULT_LON, DEFAULT_LAT, DEFAULT_ZOOM) and validation/clamping logic stay in `bee-map.ts` for now. Phase 36 can migrate them to `bee-atlas` when it takes over URL ownership.

### Phase scope
- **D-06:** Phase 35 does NOT create `<bee-atlas>`. bee-map.ts continues as URL owner post-phase, refactored to call the new pure functions. `_restored*` property elimination is Phase 36 work (URL-02).

### Claude's Discretion
- Exact sub-type field names (e.g. `ViewState.lon` vs `ViewState.center`)
- Whether `SelectionState` is `{ occurrenceIds: string[] }` or just `{ occIds: string[] }`
- Whether `UiState` includes both `layerMode` and `boundaryMode` or splits further

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files being refactored
- `frontend/src/bee-map.ts` — contains `buildSearchParams` (line 51), `parseUrlParams` (line 85), `ParsedParams` interface (line 35), and all `_restored*` properties; `buildSearchParams`/`parseUrlParams` move to url-state.ts
- `frontend/src/filter.ts` — exports `FilterState` interface; url-state.ts imports it

### Requirements
- `.planning/REQUIREMENTS.md` §URL State — URL-01 (this phase), URL-02 (Phase 36)

### Test infrastructure
- `frontend/src/smoke.test.ts` — trivial harness; real url-state round-trip tests come in Phase 38 (TEST-02)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildSearchParams` (lines 51–83 of bee-map.ts) — becomes `buildParams` in url-state.ts; signature changes to take sub-types
- `parseUrlParams` (lines 85–131 of bee-map.ts) — becomes `parseParams` in url-state.ts; return type changes to `Partial<AppState>`
- `ParsedParams` interface (lines 35–49) — replaced by split sub-types in url-state.ts
- `FilterState` from filter.ts — imported directly, not redefined

### Established Patterns
- Co-locate test files alongside source (`frontend/src/url-state.test.ts` when Phase 38 writes tests)
- TypeScript strict mode — all types must be explicit
- `"module": "nodenext"` in tsconfig — use `.ts` extensions in imports

### Integration Points
- `bee-map.ts` `_pushUrlState` method — calls `buildSearchParams` today; will call `buildParams` after extraction
- `bee-map.ts` `_restoreFilterState` method — calls `parseUrlParams` today; will call `parseParams` and apply defaults inline
- `bee-map.ts` `firstUpdated` — calls `parseUrlParams(window.location.search)` on init; same pattern with new name
- `bee-map.ts` popstate handler — calls `parseUrlParams`; same pattern

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- `_restored*` property elimination and bee-atlas URL ownership (URL-02) — Phase 36
- Defaults and clamping logic migration to bee-atlas — Phase 36
- Phase 35 vs 36 boundary (whether Phase 35 partially creates bee-atlas) — user chose not to discuss; treating as Phase 36 work

</deferred>

---

*Phase: 35-url-state-module*
*Context gathered: 2026-04-04*
