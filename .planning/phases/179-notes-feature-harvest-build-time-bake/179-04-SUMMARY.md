---
phase: 179-notes-feature-harvest-build-time-bake
plan: 04
subsystem: ui
tags: [eleventy, nunjucks, css, intl-datetimeformat, static-rendering]

# Dependency graph
requires:
  - phase: 179-03
    provides: "public/data/notes.json (D-13 shape) + absence-tolerant _data/notes.js loader (Record<canonical_name, Note[]>, approved-only, newest-first)"
provides:
  - "formatDate Eleventy filter (src/lib/formatDate.js + eleventy.config.js registration), shared verbatim with the 179-05 island via a formatDate.d.ts type declaration"
  - "Baked <section class='notes-section' id='notes'> on _pages/species-detail.njk: newest-first note list, note.html injected via | safe, byline linked to /collectors/<login>/ when present else plain text, (edited) indicator, graceful empty state (section omitted when zero notes)"
  - "Always-present <bee-notes id='notes-el'> mount + data-handoff script (canonicalName + bakedNotes) for the 179-05 island to hydrate over, even on zero-notes species"
  - "Phase-179 .notes-section/.note/.note-body/.note-meta/.note-btn* CSS block in src/styles/taxon-pages.css"
affects: [179-05-island, 179-06-uat]

# Tech tracking
tech-stack:
  added: []
  patterns: ["shared .js util + matching .d.ts declaration so both Eleventy (JS) and Lit/TS consumers import the exact same formatter, avoiding a second implementation drifting from the baked one"]

key-files:
  created:
    - src/lib/formatDate.js
    - src/lib/formatDate.d.ts
    - src/tests/formatDate.test.ts
  modified:
    - eleventy.config.js
    - _pages/species-detail.njk
    - src/styles/taxon-pages.css

key-decisions:
  - "formatDate's Intl.DateTimeFormat is pinned to timeZone: 'UTC' (not left to the runtime's local zone) — a bare date-only ISO string like '2026-01-09' parses as UTC midnight, and without pinning, any host timezone behind UTC renders the wrong day ('Jan 8' instead of 'Jan 9'). Full ISO datetimes (always Z-suffixed in this codebase) are unaffected."
  - "Added src/lib/formatDate.d.ts mirroring the existing quantify.d.ts pattern — required because tsconfig.json has no allowJs, so a .ts file importing a sibling .js module needs an explicit declaration file or tsc fails with TS7016 (this surfaced as a real `npm run build` failure during verification, fixed under Rule 2 since it blocks the build)."

patterns-established:
  - "New src/lib/*.js utilities intended for both Eleventy (JS) and Lit/TS (island) consumption ship with a matching *.d.ts file from the start, following quantify.js/quantify.d.ts."

requirements-completed: [NOTES-03]

# Metrics
duration: 4min
completed: 2026-07-04
---

# Phase 179 Plan 04: Baked Notes Section + formatDate Filter Summary

**Species pages now render a static, offline-safe, newest-first natural-history notes list from `_data/notes.js` (with a graceful empty state) plus an always-present `<bee-notes>` mount for the 179-05 authoring island, backed by a new shared `formatDate` filter/util.**

## Performance

- **Duration:** ~4 min (task-commit span; excludes upfront context-reading)
- **Started:** 2026-07-04T18:52:24Z (first `npm test -- formatDate` run)
- **Completed:** 2026-07-04T18:56:28Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `src/lib/formatDate.js`: `formatDate(iso)` renders "Jul 4, 2026" via `Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'})`, guarding empty/undefined/unparseable input to return `''` without throwing; registered as the Eleventy `formatDate` filter in `eleventy.config.js` alongside `quantify`
- `_pages/species-detail.njk`: inserted the UI-SPEC's Layout Contract verbatim after the existing `.taxon-action` links — a `notesForSpecies` conditional `<section class="notes-section" id="notes">` (newest-first `.note` articles, `{{ note.html | safe }}` as the single trusted-HTML injection point, byline `<a>`/`<span>` branching on `note.byline.collector_url`, `<time datetime>` + `formatDate`, `(edited)` guarded by `note.updated !== note.created`), followed by an ALWAYS-emitted `<bee-notes id="notes-el">` + handoff `<script>` setting `canonicalName`/`bakedNotes`
- `src/styles/taxon-pages.css`: appended the full Phase-179 CSS block (`.notes-section`, `.notes-heading`, `.note-list`, `.note`, `.note-body` typographic rules, `.note-meta`, `.note-byline`, `.note-btn*`, `.note-editor`, `.note-textarea`, `.note-status`/`.note-error`/`.note-delete-confirm`) verbatim from 179-UI-SPEC.md, reusing existing `src/index.css` custom properties only
- Manually verified with `npx eleventy` against a temporary (gitignored, never committed) `public/data/notes.json` fixture: a has-notes species (`Agapostemon femoratus`) renders the full newest-first list with correct linked/plain byline and `(edited)` treatment; a zero-notes species (`Hylaeus punctatus`) omits `.notes-section` entirely while still emitting `<bee-notes id="notes-el">` with `bakedNotes: []` — confirming both halves of the graceful-empty-state contract
- Full suite green: `npm test -- formatDate` (5/5) and full `npm test` (38 files, 931 tests, including the `build-output.test.ts` real `npm run build` + `tsc --noEmit` gate)

## Task Commits

Each task was committed atomically:

1. **Task 1: formatDate Eleventy filter** - `46bd3b8e` (feat)
2. **Task 2: Baked notes section + bee-notes mount + Phase-179 CSS** - `e503e45e` (feat)

**Plan metadata:** (this commit) - `docs(179-04): complete plan`

## Files Created/Modified
- `src/lib/formatDate.js` - `formatDate(iso)` shared timestamp formatter (UTC-pinned)
- `src/lib/formatDate.d.ts` - type declaration so TS (the 179-05 island) can import the same `.js` module
- `src/tests/formatDate.test.ts` - 5 tests: full ISO datetime, bare date, empty string, undefined, unparseable input
- `eleventy.config.js` - registers `formatDate` as a Nunjucks filter alongside `quantify`
- `_pages/species-detail.njk` - baked `<section class="notes-section" id="notes">` + always-present `<bee-notes id="notes-el">` mount + handoff script
- `src/styles/taxon-pages.css` - Phase-179 `.notes-section`/`.note`/`.note-body`/`.note-meta`/`.note-btn*` CSS block

## Decisions Made
- Pinned `formatDate`'s `Intl.DateTimeFormat` to `timeZone: 'UTC'` — without it, a bare date-only ISO string (e.g. `'2026-01-09'`, which parses as UTC midnight) rendered the previous day in any timezone behind UTC, contradicting the plan's own `<behavior>` spec (`formatDate('2026-01-09') === 'Jan 9, 2026'`). Full ISO datetimes are unaffected since they're already UTC-anchored with an explicit `Z`.
- Added `src/lib/formatDate.d.ts` mirroring `quantify.d.ts` so the new `.ts` test file (and, later, the 179-05 island) can import `formatDate.js` without a `tsc` `TS7016` "implicit any" error — `tsconfig.json` has no `allowJs`, so any `.ts` importer of a sibling `.js` module needs an explicit declaration file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] formatDate rendered the wrong day for bare date-only ISO strings**
- **Found during:** Task 1, running `npm test -- formatDate`
- **Issue:** `new Date('2026-01-09')` parses as UTC midnight; `Intl.DateTimeFormat` without an explicit `timeZone` formats in the host's local zone, so in any zone behind UTC (including this environment) the visible date rolled back to "Jan 8, 2026" instead of the plan's specified "Jan 9, 2026".
- **Fix:** Added `timeZone: 'UTC'` to the `Intl.DateTimeFormat` options.
- **Files modified:** `src/lib/formatDate.js`
- **Verification:** `npm test -- formatDate` — all 5 tests pass, including the bare-date case.
- **Committed in:** `46bd3b8e` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Missing formatDate.d.ts broke the tsc build gate**
- **Found during:** Task 1, running the full `npm test` (which invokes `npm run build` → `tsc --noEmit` via `build-output.test.ts`)
- **Issue:** `src/tests/formatDate.test.ts` imports `formatDate` from `../lib/formatDate.js`; with no `allowJs` in `tsconfig.json`, tsc reported `TS7016: Could not find a declaration file for module '../lib/formatDate.js'`, which is a build-blocking error (`npm run build` runs `tsc --noEmit` before `eleventy`).
- **Fix:** Added `src/lib/formatDate.d.ts` declaring `export function formatDate(iso: string | undefined | null): string;`, mirroring the existing `src/lib/quantify.d.ts` convention for the sibling `quantify.js` utility.
- **Files modified:** `src/lib/formatDate.d.ts` (new)
- **Verification:** `npx tsc --noEmit` clean; full `npm test` green (38 files, 931 tests).
- **Committed in:** `46bd3b8e` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 — bug directly caused by this plan's own new code; 1 Rule 2 — missing critical build-correctness artifact required for `tsc`/`npm run build` to pass)
**Impact on plan:** Both fixes were required for the plan's own acceptance criteria (`formatDate('2026-01-09') === 'Jan 9, 2026'`, `npm test` staying green) to actually hold. No scope creep beyond making this plan's own new code internally consistent.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. The baked notes section renders correctly today with the empty `{}` from `_data/notes.js` (pre-first-nightly `notes.json`); every species currently shows the zero-notes state (mount emitted, section omitted), verified locally via a temporary gitignored `notes.json` fixture during manual verification.

## Next Phase Readiness
- `formatDate.js` + `formatDate.d.ts` are ready for 179-05's `bee-notes.ts` island to import verbatim, guaranteeing baked and live timestamps never diverge.
- The `#notes` section id, `.note*` CSS classes, and the `<bee-notes id="notes-el">` mount + `canonicalName`/`bakedNotes` handoff are all in place for 179-05 to register `bee-notes.ts` (light-DOM, `createRenderRoot() { return this; }`) and wire `fetchWhoami()`-gated hydration per the UI-SPEC's Interaction/DOM Contract.
- No blockers for 179-05 or 179-06 (UAT). The manual `npx eleventy` render check (with a temporary notes.json fixture, removed before commit) confirmed both the has-notes and zero-notes rendering paths match the UI-SPEC exactly.

---
*Phase: 179-notes-feature-harvest-build-time-bake*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`src/lib/formatDate.js`,
`src/lib/formatDate.d.ts`, `src/tests/formatDate.test.ts`, `eleventy.config.js`,
`_pages/species-detail.njk`, `src/styles/taxon-pages.css`, this SUMMARY.md);
both task commit hashes (`46bd3b8e`, `e503e45e`) verified present in `git log`.
