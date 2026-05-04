---
phase: 080-page-scaffolding
plan: 02
subsystem: eleventy-data-cascade
tags: [eleventy, data-feed, build-time, page-scaffolding]
requires:
  - public/data/species.json (Phase 78 output)
  - content/species-photos.toml (Phase 79 output)
  - "@iarna/toml (existing dependency)"
provides:
  - _data/species.js (PAGE-02): { tree, flat, byScientificName }
  - _data/photos.js (PAGE-03): Record<scientificName, { description, photos[] }>
affects:
  - Eleventy data cascade (new globals: `species`, `photos`)
  - Plan 03 (consumes both feeds in `_pages/species.njk`)
tech-stack:
  added: []
  patterns:
    - sync readFileSync + JSON.parse / TOML.parse build-time data feed (idiom from _data/build.js)
key-files:
  created:
    - _data/species.js
    - _data/photos.js
  modified: []
decisions:
  - "Tree shape: nested { rows[], children: { [taxonKey]: ... } } walking 5 taxon levels (family > subfamily > tribe > genus > subgenus); null preserved as literal string 'null' for Nunjucks-friendliness. Phase 81 (NAV-01) will harden."
  - "Comment phrasing avoids the literal token 'parquet' so the case-insensitive Pitfall #8 grep in data-species.test.ts stays clean even on documentation lines."
metrics:
  duration: ~2m
  completed: 2026-05-04
  tasks: 2
  files: 2
requirements: [PAGE-02, PAGE-03]
---

# Phase 80 Plan 02: Build-Time Data Feeds Summary

Two Eleventy `_data/*.js` modules wire the Phase 78 species feed and Phase 79 photo manifest into the data cascade so Plan 03's `_pages/species.njk` can server-render one card per species without touching the SPA's parquet/SQL stack (Pitfall #8 preserved).

## What Shipped

### `_data/species.js` (PAGE-02)
- Reads `public/data/species.json` synchronously via `readFileSync` + `JSON.parse`
- Exports `{ tree, flat, byScientificName }`:
  - `flat`: 735 species sorted alphabetically by `scientificName` (D-01)
  - `byScientificName`: lookup map keyed by `scientificName`
  - `tree`: nested `{ rows, children }` walking family > subfamily > tribe > genus > subgenus; `null` taxon levels preserved as literal `'null'` keys
- Mirrors the `_data/build.js` `here` / `repoRoot` idiom exactly
- Contains zero occurrences of the literal token `parquet` (Pitfall #8 / test grep)

### `_data/photos.js` (PAGE-03)
- Parses `content/species-photos.toml` (~460 KB) synchronously via `@iarna/toml`
- Exposes `Record<scientificName, { description: string, photos: any[] }>`
- For each entry:
  - `description` is `entry.description.trim()` if string, else `''`
  - `photos` is `(entry.photos ?? []).slice().sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))`
- Handles species with zero photos and missing descriptions gracefully

## Data Volume

| Feed | Entries | Notes |
|------|---------|-------|
| `_data/species.js` `flat.length` | 735 | Includes ~179 checklist-only species (no occurrences) |
| `_data/photos.js` keys | 735 | One entry per species table in the TOML |
| Photo distribution | max 3 / species | 246 species (~33%) have zero photos |

## TDD Gate Compliance

Wave 0 RED tests created in Plan 01:
- `src/tests/data-species.test.ts` (3 assertions: shape, sorted, no-parquet)
- `src/tests/data-photos.test.ts` (2 assertions: shape, sorted-by-ordering)

After Plan 02:
- `data-species.test.ts`: **3/3 GREEN**
- `data-photos.test.ts`: **2/2 GREEN**
- Total: **5/5 GREEN** (RED -> GREEN transition confirmed)

Per-task commits do not include a separate `test(...)` commit because the RED tests were authored upstream in Plan 01 (commit `a2017b3`, "merge(080-01): Wave 0 RED test scaffolding"). Plan 02 only contributes GREEN-phase implementation commits, which is the expected division of labor for the Wave 2 plan.

## Commits

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1    | feat | da9498a | `_data/species.js` build-time feed (PAGE-02) |
| 2    | feat | de5ea7c | `_data/photos.js` build-time feed (PAGE-03) |

## Verification

```bash
npx vitest run src/tests/data-species.test.ts src/tests/data-photos.test.ts
# Test Files  2 passed (2)
# Tests       5 passed (5)

grep -v '^\s*//' _data/species.js | grep -ci parquet
# 0  (Pitfall #8: clear)

node --input-type=module -e \
  "import('./_data/species.js').then(m => console.log(Object.keys(m.default)))"
# [ 'tree', 'flat', 'byScientificName' ]
```

## Deviations from Plan

None. Both tasks executed exactly as scaffolded by the plan.

One execution-environment nuance worth recording (not a code deviation): the worktree starts without `public/data/` (gitignored), so `_data/species.js` cannot import its data file out of the box. A symlink `public/data/species.json -> /Users/rainhead/dev/beeatlas/public/data/species.json` was placed locally to let the GREEN tests run. The symlink is inside a gitignored path and is not committed; Plan 03 (and downstream waves merging back to main) will rely on the real file present at the merge target.

## Known Stubs

The `tree` shape is documented as a placeholder per PAGE-02 -- it satisfies the contract (object with the expected nesting) but is not yet a UX-ready taxon nav. Phase 81 NAV-01 will harden it. This is intentional and called out in the in-file header comment.

## Self-Check: PASSED

Files exist:
- `_data/species.js` -> FOUND
- `_data/photos.js` -> FOUND

Commits exist on `worktree-agent-a8e8e45e`:
- `da9498a` -> FOUND (`feat(080-02): add _data/species.js ...`)
- `de5ea7c` -> FOUND (`feat(080-02): add _data/photos.js ...`)

Tests GREEN: 5/5 across both Wave 0 data test files.
