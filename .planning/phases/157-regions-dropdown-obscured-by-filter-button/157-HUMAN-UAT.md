---
phase: 157-regions-dropdown-obscured-by-filter-button
plan: 02
status: pending
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
source: [157-01-SUMMARY.md, 157-RESEARCH.md]
created: 2026-06-21
updated: 2026-06-21
---

# Phase 157 — Human UAT: Regions dropdown above the filter button

**Status: PENDING** — Awaiting operator sign-off.

**UI hint: yes** — This phase must NOT auto-advance past this UAT checkpoint.
The `auto_advance: false` constraint is in effect (per `feedback_uat_ui_phases`).

**Gates:** `/gsd-verify-work` for Phase 157 is blocked until every scenario below is
recorded as Pass (or intentionally deferred with rationale) and the results are committed
to this file. Any Fail becomes gap-closure input for `/gsd-plan-phase 157 --gaps` — do NOT
mark the phase verified until all scenarios show Pass.

Success criteria verified here:
- **SC-1** — the regions dropdown is fully visible/clickable above the pane in all three
  pane states (collapsed, list, table) and both layouts.
- **SC-2** — the Phase 108 regression is NOT reintroduced: the Mapbox bottom-right
  attribution stays visible and does **not** bleed over the table pane (the fix retained
  `bee-map { z-index: 0 }` rather than deleting it).
- **SC-4** — the collapsed filter button sits **beside** the regions button, not stacked
  below it / under the opened menu.

Source-analysis tests (plan 157-01, the STACK-01 block) already prove the relocation and
the retained `z-index: 0`, but they cannot prove pixels — that is what this checklist is for.

---

## Prerequisites

Before running any scenario:

- [ ] `npm test` — green (32 files, 828 tests pass).
- [ ] `npm run build` — succeeds with no TypeScript errors.
- [ ] Start the dev server:
  ```
  npm run dev
  ```
  Then open `/app` (the built app entry). The region control is the **"Regions" button in
  the map's top-right corner**; the filter (toggle) button is the collapsed `<bee-pane>`,
  also top-right.

---

## Layout Note — triggering the narrow (bottom-pane) layout

Every scenario must be run in **both** layouts:

- **Wide (side pane):** a normal landscape browser window (width ≥ height). The expanded
  pane is a right-hand side column.
- **Narrow (bottom pane):** a **portrait** viewport (height > width) so the
  `@media (max-aspect-ratio: 1)` rule activates and the expanded pane docks to the bottom.
  Trigger it either by resizing the browser window to portrait, or via Firefox
  **Responsive Design Mode** (Cmd+Opt+M / Ctrl+Shift+M) with a portrait device size
  (e.g. 390 × 844).

---

## Scenario 1 — Collapsed map: Regions menu fully visible; filter button beside it (SC-1, SC-4)

**Steps:**

1. Open `/app`. Leave the pane **collapsed** (do not expand the list or table).
2. Confirm the **filter (toggle) button** sits to the **left of**, and on the same row as,
   the **"Regions"** button — NOT stacked directly below it.
3. Click **Regions**. The dropdown opens downward with four options:
   **Off / Counties / Ecoregions / Places**.
4. Confirm all four options are **fully visible and clickable** — none clipped or hidden
   behind the filter button or any other chrome.
5. Click outside the menu — it closes.

**Expected result:** The filter button is beside (not under) the Regions button; the open
menu shows all four options fully and clickably, painting above everything in the corner.

**Result — Wide (side pane):**  [ ] PASS  [ ] FAIL
**Result — Narrow (portrait, bottom pane):**  [ ] PASS  [ ] FAIL

**Notes:**

---

## Scenario 2 — List pane expanded: menu fully above the list column (SC-1)

**Steps:**

1. Open `/app`. Expand the **list** pane (the filter/list view).
2. Click **Regions**.
3. Confirm the dropdown menu paints **fully above** the list column — no part of the menu
   is clipped by, or hidden behind, the list pane.
4. Each of the four options is clickable.

**Expected result:** The regions menu is entirely above the list pane in both layouts.

**Result — Wide (side pane):**  [ ] PASS  [ ] FAIL
**Result — Narrow (portrait, bottom pane):**  [ ] PASS  [ ] FAIL

**Notes:**

---

## Scenario 3 — Table pane expanded: menu above the table AND attribution not bleeding (SC-1, SC-2)

**This is the Phase 108 regression guard — the most important scenario.**

**Steps:**

1. Open `/app`. Expand the **table** pane (the full-width occurrence table; in wide layout
   it occupies the lower ~60%, in narrow it docks to the bottom).
2. Click **Regions**.
3. Confirm the dropdown menu paints **fully above** the table — not clipped or hidden
   behind the table pane.
4. **Critically:** look at the **Mapbox attribution / logo in the map's bottom-right
   corner.** Confirm it is still **visible** and is **NOT painting over / on top of the
   table pane** (i.e. the attribution stays contained to the map area below the pane's
   stacking, exactly as before this phase).

**Expected result:** The regions menu is fully above the table; the Mapbox bottom-right
attribution remains visible and does NOT bleed over the table pane (no Phase 108
regression).

**Result — Wide (side pane):**  [ ] PASS  [ ] FAIL
**Result — Narrow (portrait, bottom pane):**  [ ] PASS  [ ] FAIL

**Notes:**

---

## Scenario 4 — Boundary-toggle behavior unchanged (no regression)

**Steps:**

1. Open `/app`. Click **Regions**, then select **Counties** — confirm county boundaries
   appear on the map and the button label updates to "Counties".
2. Open **Regions** again → **Ecoregions** — confirm ecoregion boundaries appear (counties
   gone), label updates.
3. Open **Regions** again → **Places** — confirm place polygons appear, label updates.
4. Open **Regions** again → **Off** — confirm all boundary overlays clear, label returns to
   "Regions".
5. (If a place is currently selected as a filter) selecting any non-Places mode clears the
   selected place and the map/table update accordingly.

**Expected result:** Each option toggles its overlay exactly as before the relocation; the
label tracks the active mode; leaving "Places" clears the selected place. No behavior
regression from moving the control into `<bee-atlas>`.

**Result:**  [ ] PASS  [ ] FAIL

**Notes:**

---

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

(none recorded yet)

---

## Verdict

**PASS** requires Scenarios 1–3 to record PASS in **both** layouts and Scenario 4 to record
PASS. Scenario 3's attribution check (SC-2) is **not** deferrable — it is the Phase 108
regression guard.

**Verdict:** [ ] PASS  [ ] FAIL

**If FAIL:** Record which scenario/layout failed in its Notes, update the `## Summary` and
`## Gaps` sections, then route to `/gsd-plan-phase 157 --gaps` for gap closure before
advancing the phase.

**Signed off by:**

**Date:**
