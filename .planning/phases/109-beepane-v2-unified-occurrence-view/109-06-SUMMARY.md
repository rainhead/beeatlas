---
plan: "109-06"
status: complete
commit: 5e71caa
---

# Plan 109-06 Summary: Refresh list on filter change when pane is open

## What was done

Added one line to `_onFilterChanged` in `src/bee-atlas.ts`:

```ts
if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }
```

This complements the existing guard `if (this._paneState !== 'list') this._paneState = 'collapsed'` — together they handle all pane states on filter change:
- Pane NOT in list state → collapse it (existing)
- Pane IS in list state → stay open and refresh the list (new)

## Verification

- `npm test` — 478 tests passed, 0 failures
- `npx tsc --noEmit` — clean
- `grep "_paneState === 'list'" src/bee-atlas.ts` → one match in `_onFilterChanged` containing `_runListQuery()`
- `grep "_listPage = 1" src/bee-atlas.ts` → match in `_onFilterChanged` for the page reset

## Gap closed

Closes the single remaining gap from VERIFICATION.md: TABLE-02 requirement that the occurrence list refreshes immediately when the user changes a filter while the list pane is open.
