---
quick_id: 260421-t1a
status: complete
date: 2026-04-21
commit: c9c1b8c
---

# Summary

All five table mode improvements shipped in one commit (`c9c1b8c`).

## Changes

**bee-table.ts** (rewritten):
- `filterActive` + `selectedIds` properties added
- Filter button in bottom bar (dispatches `toggle-filter`); replaces row-count span
- Row count moved inline: "Page X of Y (Z occurrences)" in center
- Selected rows sorted to top; `tr.selected` gets green `--accent-subtle` background
- Links column: Ecdysis + iNat favicon icons, dimmed at opacity 0.2 when unavailable
- Collector column: `valueFn` combines `recordedBy (host_inat_login)` when both present
- Field # column: `valueFn` falls back to `sample_id.1—sample_id.N` notation
- Observer column removed (coalesced into Collector)

**bee-atlas.ts**:
- `_tableFilterOpen` state + `_onToggleFilter` handler
- bee-filter-panel rendered in both map and table modes
- In table mode: `hideButton=true`, `externalOpen=_tableFilterOpen`
- CSS: table mode positions filter panel at `bottom: 0.5em; left: 0.5em`
- Resets `_tableFilterOpen` when switching back to map mode

**bee-filter-panel.ts**:
- `hideButton` property: suppresses the built-in toggle button
- `externalOpen` property: syncs `_open` via `updated()` when `hideButton` is true
