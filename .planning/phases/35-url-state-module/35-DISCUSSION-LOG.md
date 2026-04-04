# Phase 35: URL State Module - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 35-url-state-module
**Areas discussed:** AppState type shape, Module API

---

## AppState Type Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat `AppState` | One interface mirroring ParsedParams exactly — simple, one type to import | |
| Split sub-types | ViewState + FilterState (from filter.ts) + SelectionState + UiState — composable for Phase 36 | ✓ |
| Reuse FilterState from filter.ts | Import FilterState directly into url-state.ts instead of duplicating fields | ✓ (combined with above) |

**User's choice:** Split sub-types; reuse `FilterState` from `filter.ts` for the filter slice.
**Notes:** AppState = `{ view: ViewState, filter: FilterState, selection: SelectionState, ui: UiState }`. No duplication of filter fields.

---

## Module API

### Serialize direction

| Option | Description | Selected |
|--------|-------------|----------|
| `serialize(state: AppState)` | Takes full AppState; caller assembles before calling | |
| `buildParams(view, filter, selection, ui)` | Takes sub-types directly; no AppState assembly at call site | ✓ |

**User's choice:** `buildParams` — takes sub-types directly.

### Deserialize return type

| Option | Description | Selected |
|--------|-------------|----------|
| `deserialize(search): AppState` | Always returns full AppState with defaults filled in | |
| `deserialize(search): Partial<AppState>` | Returns only what's in the URL; caller handles defaults | ✓ |

**User's choice:** `Partial<AppState>` — caller (bee-map.ts) applies defaults.

### Defaults and validation location

| Option | Description | Selected |
|--------|-------------|----------|
| In url-state.ts | deserialize always returns valid clamped values | |
| In bee-map.ts (caller) | url-state.ts purely structural; defaults stay with owner | ✓ |

**User's choice:** Defaults stay in bee-map.ts for now; Phase 36 can migrate to bee-atlas.

---

## Claude's Discretion

- Exact sub-type field naming
- Whether UiState splits further

## Deferred Ideas

- Phase 35 vs 36 boundary / `_restored*` elimination — user chose not to discuss; deferred to Phase 36
