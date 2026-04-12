---
phase: quick
plan: 260411-pru
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/bee-specimen-detail.ts
  - frontend/src/bee-map.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/tests/bee-sidebar.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Unidentified specimens display 'No determination' instead of an empty string"
    - "All three code paths that set Specimen.name handle null/empty scientificName"
  artifacts:
    - path: "frontend/src/bee-specimen-detail.ts"
      provides: "Fallback display for empty specimen names"
    - path: "frontend/src/tests/bee-sidebar.test.ts"
      provides: "Test verifying 'No determination' renders for unnamed specimens"
  key_links:
    - from: "frontend/src/bee-specimen-detail.ts"
      to: "Specimen.name"
      via: "render template"
      pattern: "No determination"
---

<objective>
Fix rendering of unidentified specimens (e.g. ecdysis ID 5611752) in the sidebar specimen
detail view. Currently, when `scientificName` is null or empty, the sidebar renders an empty
string before the separator dot, producing text like " · Erigeron linearis RG". The fix
should display "No determination" as the link text instead.

Purpose: Unidentified specimens are a normal part of the dataset; they should be clearly
labeled rather than showing blank text that confuses users.

Output: Updated rendering in bee-specimen-detail.ts with a fallback label, plus hardening
of the two data-assembly paths (bee-map.ts and bee-atlas.ts) that produce Specimen objects.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/bee-specimen-detail.ts
@frontend/src/bee-sidebar.ts (Specimen interface definition)
@frontend/src/bee-map.ts (groupByKey assembles Specimen objects from OL features)
@frontend/src/bee-atlas.ts (lines 750-790: _restoreSelectionFromUrl assembles Specimen objects from DuckDB)
@frontend/src/tests/bee-sidebar.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Display "No determination" for unnamed specimens and harden data paths</name>
  <files>frontend/src/bee-specimen-detail.ts, frontend/src/bee-map.ts, frontend/src/bee-atlas.ts, frontend/src/tests/bee-sidebar.test.ts</files>
  <behavior>
    - Test: A specimen with name "" renders "No determination" (not italic) as its link text
    - Test: A specimen with a real name still renders that name in italic
  </behavior>
  <action>
1. In `frontend/src/tests/bee-sidebar.test.ts`, add a new test inside the existing
   `bee-specimen-detail render` describe block:
   - Create a BeeSpecimenDetail element with a sample containing one specimen with
     `name: ''` (empty string) and one with a real name.
   - Assert the shadow DOM text contains "No determination".
   - Assert the real name still appears.

2. In `frontend/src/bee-specimen-detail.ts`, line 114, change the link content from
   `${s.name}` to a conditional:
   - If `s.name` is truthy, render `${s.name}` (keeps existing italic from `.species-list`).
   - If `s.name` is falsy, render `<span class="no-determination">No determination</span>`.
   - Add a `.no-determination` CSS rule: `font-style: normal; color: var(--text-hint);`
     (removes the italic inherited from `.species-list` and dims the text).

3. In `frontend/src/bee-map.ts` line 47, harden the name assignment:
   - Change `name: f.get('scientificName') as string` to
     `name: (f.get('scientificName') as string) || ''`
   - This normalizes null/undefined to empty string so the display fallback fires consistently.

4. In `frontend/src/bee-atlas.ts` line 775, harden the name assignment:
   - Change `name: String(obj.scientificName)` to
     `name: obj.scientificName ? String(obj.scientificName) : ''`
   - This prevents `String(null)` producing the literal string `"null"`.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run</automated>
  </verify>
  <done>
    - Specimens with empty/null scientificName show "No determination" as the ecdysis link text
    - Specimens with a real scientificName still show that name
    - `String(null)` producing literal "null" is prevented
    - All existing tests pass, new test covers the empty-name case
  </done>
</task>

</tasks>

<threat_model>
No trust boundaries affected. This is a display-only change in the frontend rendering layer.
No new inputs, no data mutation, no external service interaction.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| (none) | — | — | — | Display-only fix, no security surface |
</threat_model>

<verification>
1. `cd frontend && npm test -- --run` passes (all existing + new test)
2. `cd frontend && npx tsc --noEmit` passes (no type errors)
</verification>

<success_criteria>
- Unidentified specimens render "No determination" in the sidebar detail view
- Named specimens render unchanged
- No regressions in existing tests
</success_criteria>

<output>
After completion, create `.planning/quick/260411-pru-unidentified-specimens-like-5611752-are-/260411-pru-SUMMARY.md`
</output>
