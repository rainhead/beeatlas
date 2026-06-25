---
status: resolved
phase: 169-per-collector-static-pages
source: [169-VERIFICATION.md]
started: 2026-06-25
updated: 2026-06-25
---

> **All 3 items PASSED** operator UAT on 2026-06-25.

# Phase 169 — Human UAT

Automated verification passed 6/6 must-haves. These 3 items need a human in a browser
(`npm run dev`, then visit the URLs) — automated checks can't drive the live map filter.

## Items

### UAT-01 — Map deep-link applies the collector filter (PAGE-04)
- **Steps:** Visit `/collectors/acfranz/`, click "View on the atlas →".
- **Expected:** Map filters to Anna Franz's occurrences only; a collector filter chip shows her name; URL carries `?collectors=Anna%20Franz:acfranz`.
- **Status:** ☑ passed (operator UAT 2026-06-25)

### UAT-02 — Sample-host-only collector + empty-recordedBy deep-link
- **Steps:** Visit `/collectors/apascal/` (a `waba_sample`-only collector).
- **Expected:** H1 = `@apascal`; metadata shows 0 specimens / 1 sample / 0 species; NO status-split line (denominator 0); "View on the atlas →" present with `?collectors=:apascal`, and clicking it filters the map to that collector (the empty-recordedBy / host-only form must round-trip via `url-state.ts`).
- **Status:** ☑ passed (operator UAT 2026-06-25)

### UAT-03 — Collectors index roster (D-08)
- **Steps:** Visit `/collectors.html`.
- **Expected:** Lists all 124 collectors with display names + specimen counts, each linking to `/collectors/{login}/`.
- **Status:** ☑ passed (operator UAT 2026-06-25)

## On completion
When all three pass, re-run verification (or mark this file `status: resolved`) so the
phase closes as `passed`. If any fails, run `/gsd-debug` or `/gsd-plan-phase 169 --gaps`.
