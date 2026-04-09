---
phase: quick
plan: 260408-thx
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/milestones/v2.0-REQUIREMENTS.md
  - .planning/milestones/v2.0-ROADMAP.md
  - .planning/PROJECT.md
  - .planning/RETROSPECTIVE.md
  - frontend/src/tests/bee-table.test.ts
  - .planning/phases/40-bee-table-component/40-01-PLAN.md
  - .planning/phases/40-bee-table-component/40-02-PLAN.md
  - .planning/phases/40-bee-table-component/40-02-SUMMARY.md
  - .planning/phases/40-bee-table-component/40-RESEARCH.md
  - .planning/phases/40-bee-table-component/40-VALIDATION.md
  - .planning/phases/40-bee-table-component/40-VERIFICATION.md
autonomous: true
must_haves:
  truths:
    - "No TABLE-05 sort references remain in planning docs or phase artifacts"
    - "Test describe block uses a pagination-appropriate label instead of TABLE-05"
    - "Existing tests still pass unchanged"
  artifacts: []
  key_links: []
---

<objective>
Remove all TABLE-05 sort-by-column references from planning documents, milestone docs, and phase artifacts. Relabel the TABLE-05 test describe block in bee-table.test.ts to reflect its actual content (pagination events, not sort).

Purpose: TABLE-05 (sort-by-column) was implemented then removed during v2.0. Planning docs still reference it as "deferred". Clean up the paper trail so it does not confuse future planning.
Output: Clean planning docs with no TABLE-05 sort references; correctly labeled test block.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/milestones/v2.0-REQUIREMENTS.md
@.planning/milestones/v2.0-ROADMAP.md
@.planning/PROJECT.md
@.planning/RETROSPECTIVE.md
@frontend/src/tests/bee-table.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove TABLE-05 sort references from planning and milestone docs</name>
  <files>
    .planning/milestones/v2.0-REQUIREMENTS.md
    .planning/milestones/v2.0-ROADMAP.md
    .planning/PROJECT.md
    .planning/RETROSPECTIVE.md
  </files>
  <action>
In v2.0-REQUIREMENTS.md:
- Remove the struck-through TABLE-05 line (line ~27): `~~**TABLE-05**: User can sort by clicking...~~`
- Remove the TABLE-05 row from the requirements status table (line ~69)
- Update the summary line (line ~76) from "11/12 shipped (TABLE-05 sort deferred)" to "11/11 shipped" (renumber total to reflect TABLE-05 no longer exists as a requirement)

In v2.0-ROADMAP.md:
- Remove TABLE-05 from the Phase 40 requirements list (line ~164): change `TABLE-01, TABLE-02, TABLE-03, TABLE-04, TABLE-05, TABLE-06, TABLE-07` to `TABLE-01, TABLE-02, TABLE-03, TABLE-04, TABLE-06, TABLE-07`

In PROJECT.md:
- Remove the "Sort-by-column removed" row from the Key Decisions table (line ~219). The decision is no longer relevant since the requirement itself is being dropped.

In RETROSPECTIVE.md:
- Lines ~20 and ~25 discuss TABLE-05 as a lesson learned about feature removal process. Keep the process lesson but remove the TABLE-05 label. Reword line ~20 to say "undocumented feature removal" instead of "undocumented TABLE-05 removal". Reword line ~25 to remove "TABLE-05" label but keep the lesson about sort-by-column being removed and the process gap it revealed.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas && grep -r "TABLE-05" .planning/milestones/v2.0-REQUIREMENTS.md .planning/milestones/v2.0-ROADMAP.md .planning/PROJECT.md .planning/RETROSPECTIVE.md; echo "exit: $?"</automated>
  </verify>
  <done>No TABLE-05 references in these four files. Requirement count is accurate. Process lessons in RETROSPECTIVE.md preserved without the TABLE-05 label.</done>
</task>

<task type="auto">
  <name>Task 2: Clean TABLE-05 references from phase 40 artifacts and relabel test</name>
  <files>
    frontend/src/tests/bee-table.test.ts
    .planning/phases/40-bee-table-component/40-01-PLAN.md
    .planning/phases/40-bee-table-component/40-02-PLAN.md
    .planning/phases/40-bee-table-component/40-02-SUMMARY.md
    .planning/phases/40-bee-table-component/40-RESEARCH.md
    .planning/phases/40-bee-table-component/40-VALIDATION.md
    .planning/phases/40-bee-table-component/40-VERIFICATION.md
  </files>
  <action>
In frontend/src/tests/bee-table.test.ts:
- Change the describe block label on line 136 from `'TABLE-05: bee-table page events'` to `'bee-table page-changed events'`. The tests are about pagination event dispatch, not sort. Do NOT change any test logic.

In the phase 40 planning artifacts, remove or update TABLE-05 references:

40-01-PLAN.md (line ~13): Change `requirements: [TABLE-02, TABLE-05]` to `requirements: [TABLE-02]`

40-02-PLAN.md (line ~12): Remove TABLE-05 from the requirements list.

40-02-SUMMARY.md (line ~121): The line `- TABLE-05: page-changed events (Next -> page+1, Prev -> page-1)` mislabels page events as TABLE-05. Remove the `TABLE-05:` prefix, keeping the description as a plain bullet about page-changed events.

40-RESEARCH.md: Remove the TABLE-05 rows from the requirements table (line ~54) and the test strategy table (line ~539).

40-VALIDATION.md: Remove the TABLE-05 row from the validation matrix (line ~45) and the manual test row for "Column header sort click" (line ~64).

40-VERIFICATION.md:
- Line ~48: Remove the "TABLE-05" mention from the notes column (keep rest of text about TABLE-03 tests).
- Line ~92-93: Remove the TABLE-05 row from the requirements satisfaction table.
- Lines ~121+: Remove the "Column sort with URL persistence (TABLE-05)" section entirely.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas && grep -r "TABLE-05" frontend/src/tests/bee-table.test.ts .planning/phases/40-bee-table-component/ && echo "FOUND" || echo "CLEAN"; cd frontend && npm test -- --run 2>&1 | tail -5</automated>
  </verify>
  <done>No TABLE-05 references in test file or phase 40 artifacts. Test describe block reads "bee-table page-changed events". All existing tests pass.</done>
</task>

</tasks>

<verification>
- `grep -r "TABLE-05" .planning/ frontend/src/tests/` returns zero matches
- `cd frontend && npm test -- --run` passes with no failures
</verification>

<success_criteria>
- Zero occurrences of "TABLE-05" in the entire .planning/ directory and frontend/src/tests/
- The bee-table test suite passes unchanged (only the describe label changed, no test logic)
- Planning doc requirement counts are accurate after removal
</success_criteria>

<output>
After completion, create `.planning/quick/260408-thx-drop-table-05-sort-entirely-from-plannin/260408-thx-SUMMARY.md`
</output>
