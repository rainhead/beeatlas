---
phase: 179-notes-feature-harvest-build-time-bake
plan: 05
subsystem: ui
tags: [lit, light-dom, custom-elements, fetch, unsafe-html, progressive-enhancement]

# Dependency graph
requires:
  - phase: 179-02
    provides: "POST/PATCH/DELETE /api/notes + public GET /api/notes?species= read endpoint (own-note body_md/can_edit enrichment, 403 on someone else's note)"
  - phase: 179-04
    provides: "Baked <section id='notes'> + always-present <bee-notes id='notes-el'> mount + canonicalName/bakedNotes handoff script; formatDate.js/.d.ts; .note* CSS in taxon-pages.css"
provides:
  - "Note CRUD client (fetchSpeciesNotes/createNote/updateNote/deleteNote + NoteView/NoteMutationResult types) in src/auth-client.ts, credentials:'include', never throws"
  - "<bee-notes> light-DOM Lit hydrating island (src/bee-notes.ts): independent fetchWhoami, inert for guest/non-author, author Add/Edit/Delete on own notes, inline two-step delete confirm, re-fetch-after-write (no optimistic update), unsafeHTML on trusted server html"
  - "src/entries/taxon-page.ts registers ../bee-notes.ts"
affects: [179-06-uat, 180-moderation-loop]

# Tech tracking
tech-stack:
  added: []
  patterns: ["light-DOM Lit island (createRenderRoot returns this) sharing unprefixed CSS classes with server-baked markup, copied from seasonality-viz.ts", "confirm-then-refetch write pattern: never mutate local state optimistically, always re-fetch the read endpoint after a confirmed 2xx and re-render from that response"]

key-files:
  created:
    - src/bee-notes.ts
    - src/tests/notes-client.test.ts
    - src/tests/bee-notes.test.ts
  modified:
    - src/auth-client.ts
    - src/entries/taxon-page.ts

key-decisions:
  - "Mutating client calls (createNote/updateNote/deleteNote) resolve {ok:false, status:0} on a network/thrown error (rather than propagating), distinguishing it from a real HTTP status while still letting the island show the same generic 'Couldn't save' copy for any non-403 failure."
  - "The heading-row 'Add note' button is hidden whenever ANY editor is open (add or edit) rather than only when the add editor is open -- both editors use the same .note-btn--primary class, so leaving 'Add note' visible during an edit would have made the two visually indistinguishable and put two .note-btn--primary elements in the DOM simultaneously."
  - "_liveNotes stays null until the first successful write; before that the author view is seeded directly from the bakedNotes property (per D-02's 'no extra network round-trip on load'), and fetchSpeciesNotes is never called on initial hydration -- only after a confirmed create/edit/delete."

requirements-completed: [NOTES-01, NOTES-02, NOTES-04]

# Metrics
duration: 6min
completed: 2026-07-04
---

# Phase 179 Plan 05: bee-notes Hydrating Island + Note CRUD Client Summary

**A light-DOM `<bee-notes>` Lit island that independently checks `fetchWhoami()`, stays fully inert for guests/non-authors (the 179-04 baked list is the only display), and for a confirmed allowlisted author renders its own Add/Edit/Delete view seeded from `bakedNotes` — re-fetching the read endpoint after every confirmed write with no optimistic update, ever.**

## Performance

- **Duration:** ~6 min (task-commit span; excludes upfront context-reading)
- **Started:** 2026-07-04T19:04:07Z (Task 1 commit)
- **Completed:** 2026-07-04T19:09:50Z (Task 2 commit)
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `src/auth-client.ts`: added `NoteView`/`NoteMutationResult` types and `fetchSpeciesNotes`/`createNote`/`updateNote`/`deleteNote`, all reusing the existing `API_BASE` + `credentials:'include'` convention; `fetchSpeciesNotes` resolves `[]` on any error, the three mutating calls resolve a discriminated `{ok:true,data}|{ok:false,status}` result (403 surfaced distinctly for the ownership-lost UI copy) — none throw
- `src/bee-notes.ts`: `@customElement('bee-notes')`, `createRenderRoot(){ return this; }` (copied verbatim from `seasonality-viz.ts`) so its Lit-rendered markup shares the exact `.notes-section`/`.note-list`/`.note`/`.note-body`/`.note-meta` classes with the 179-04 baked markup; `connectedCallback` calls `fetchWhoami()` independently (never reads `<bee-header>` DOM/state) and hides the baked `#notes` element via `setAttribute('hidden','')` only once a confirmed author is detected
- Author view: heading + "Add note" (hidden while any editor is open) + list seeded from `bakedNotes` (no fetch on initial load) with per-own-note Edit/Delete; zero-baked author gets the empty-state copy + Add note with no `#notes` element to hide
- Add/Edit: inline `.note-editor` (not a modal), `Escape` cancels and discards the draft, empty/whitespace submit is a no-op, in-flight disables the submit/cancel buttons and shows "Saving…", success re-fetches via `fetchSpeciesNotes` and re-renders from that live data (D-02, no optimistic update), failure keeps the editor open with the draft and shows `role="alert"` error copy, a 403 shows the ownership-lost copy and re-fetches so the controls drop on the next render
- Delete: inline two-step confirm (`.note-delete-confirm`, no native `confirm()`/modal — verified via a `window.confirm` spy in the test), Cancel reverts to normal controls without calling `deleteNote`, confirmed delete shows "Deleting…" then re-fetches (note disappears) and announces "Note deleted."
- Note bodies render via Lit's `unsafeHTML` on the trusted server `html` field only (no markdown/sanitizer library anywhere under `src/`, confirmed by grep); live timestamps use the shared `formatDate.js`/`.d.ts` from 179-04 so baked and live timestamps never diverge; byline renders `display_name ?? '@'+login`, linked to `collector_url` only when present
- `src/entries/taxon-page.ts` imports `../bee-notes.ts` as a fourth registration
- 25 new tests (12 `notes-client`, 13 `bee-notes`) covering the full `<behavior>` matrices of both tasks; full `npm test` green (40 files, 956 tests, including the real `npm run build` + `tsc --noEmit` gate)

## Task Commits

Each task was committed atomically:

1. **Task 1: Note CRUD client functions (credentials-included fetch)** - `ae497020` (feat)
2. **Task 2: `<bee-notes>` hydrating island + taxon-page registration** - `3b8fba67` (feat)

**Plan metadata:** (this commit) - `docs(179-05): complete plan`

## Files Created/Modified
- `src/auth-client.ts` - `NoteView`/`NoteMutationResult` types + `fetchSpeciesNotes`/`createNote`/`updateNote`/`deleteNote`
- `src/bee-notes.ts` - `<bee-notes>` light-DOM Lit hydrating island
- `src/entries/taxon-page.ts` - registers `../bee-notes.ts`
- `src/tests/notes-client.test.ts` - 12 tests for the note CRUD client
- `src/tests/bee-notes.test.ts` - 13 tests for hydration gating, author view, Add/Edit/Delete flows, re-fetch-after-write, 403 handling

## Decisions Made
- Network/thrown errors on mutating calls resolve `{ok:false, status:0}` rather than a distinct shape, so the island's non-403 error branch (generic "Couldn't save…" copy) handles both a real 5xx and a network failure identically without an extra code path.
- The "Add note" button is suppressed whenever `_editorMode` is non-null (not only when it's `'add'`), since both the add and edit editors use the same `.note-btn--primary` styling and only one editor may be open at a time per the UI-SPEC.
- `_liveNotes` is `null` until the first successful write; the author view renders directly from the `bakedNotes` property until then, matching D-02's "no extra network round-trip on load" — `fetchSpeciesNotes` is called only after a confirmed create/edit/delete, never on initial hydration.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<behavior>` blocks map 1:1 to the implemented client functions and component; the one bug found (below) was fixed during Task 2's own test-driven implementation, before the task's acceptance criteria were verified as met.

### Auto-fixed Issues

**1. [Rule 1 - Bug] "Add note" button remained visible (and matched first by `.note-btn--primary`) while editing an existing note**
- **Found during:** Task 2, writing `src/tests/bee-notes.test.ts` (the 403-ownership-lost test)
- **Issue:** `render()` only hid the "Add note" button when `_editorMode === 'add'`, so during an edit (`_editorMode === 'edit'`) both "Add note" and "Save changes" carried `.note-btn--primary`, and `querySelector('.note-btn--primary')` matched the wrong (Add note) button — a real bug, not just a test artifact, since it also meant two primary-styled buttons appeared in the DOM simultaneously during an edit, contradicting the UI-SPEC's "only one editor... may be open at a time" framing.
- **Fix:** Changed the condition to `this._editorMode === null` so "Add note" is suppressed whenever any editor (add or edit) is open.
- **Files modified:** `src/bee-notes.ts`
- **Verification:** `npm test -- bee-notes` — all 13 tests pass, including the previously-failing 403 test.
- **Committed in:** `3b8fba67` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a real bug in the plan's own new code, caught by its own test suite before the task was considered done)
**Impact on plan:** No scope creep; the fix was required for Task 2's acceptance criteria (`npm test -- bee-notes` passing) to actually hold, and it corrects a genuine UI defect (duplicate primary-button affordance during an edit) rather than merely a test-selector mismatch.

## Issues Encountered

None beyond the one auto-fixed bug above. Test-authoring note (not a plan deviation): several of the hydration-gating tests reuse the same custom-element tag across tests in one file, so mock resolution values for `fetchWhoami` had to be set *before* the element is created/connected (rather than after) whenever `document.body.innerHTML` is reassigned mid-test — `bee-notes`'s `connectedCallback` fires synchronously during `innerHTML` parsing once the element is already registered from an earlier test. This only affects test ordering within `bee-notes.test.ts`, not the component's runtime behavior.

## User Setup Required

None - no external service configuration required. The island works against the already-deployed Phase-178/179-02 write API (`api.beeatlas.net`); no new environment variables or dashboard steps.

## Next Phase Readiness
- `<bee-notes>` and the note CRUD client are ready for 179-06's human UAT gate: live end-to-end verification (real sign-in via the deployed Flask app, real create/edit/delete against the maderas write API, real 403-ownership-lost and adversarial payload checks) is explicitly out of this plan's automated scope per the plan's own `<verification>` section.
- `src/entries/taxon-page.ts` now imports `bee-header.ts`, `seasonality-viz.ts`, and `bee-notes.ts` — all three islands hydrate independently on species-detail pages with no shared module-level state, consistent with the project's architecture invariants.
- No blockers for 179-06 (UAT) or Phase 180 (moderation loop) — the client's 403 handling and the island's ownership-lost UI are the exact mechanism Phase 180's curator-override work will extend, not retrofit.

---
*Phase: 179-notes-feature-harvest-build-time-bake*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`src/auth-client.ts`,
`src/bee-notes.ts`, `src/entries/taxon-page.ts`, `src/tests/notes-client.test.ts`,
`src/tests/bee-notes.test.ts`, this SUMMARY.md); both task commit hashes
(`ae497020`, `3b8fba67`) verified present in `git log`.
