---
phase: 082-hardening
plan: "08"
subsystem: species-page
tags: [uat, perf-06, carry-in, regression-record, light-dom-fix]
dependency_graph:
  requires: [082-01, 082-02, 082-03, 082-04, 082-05, 082-06, 082-07]
  provides: [PERF-06-uat-record]
  affects:
    - .planning/phases/082-hardening/082-UAT.md
    - src/styles/species.css
    - src/species/bee-species-card.ts
tech_stack:
  added: []
  patterns: [light-dom-host-pseudo-pitfall]
key_files:
  created:
    - .planning/phases/082-hardening/082-UAT.md
  modified:
    - src/styles/species.css
    - src/species/bee-species-card.ts
decisions:
  - "FILT-04 mute style must use a descendant selector in src/styles/species.css; :host(.muted) inside a Lit static-styles block is inert under light DOM"
metrics:
  duration: ~paired session, 2026-05-04 → 2026-05-05
  completed: 2026-05-05
---

# Phase 82 Plan 08: PERF-06 UAT Summary

**One-liner:** Walked the seed's two use cases against current production data, recorded carry-in regression checks (T2/T7) and PERF-01..05 spot checks, and uncovered + fixed five in-flight regressions during the UAT pre-flight.

## Output

`.planning/phases/082-hardening/082-UAT.md` (121 lines) — the canonical PERF-06 record. Contains:
- Pre-UAT findings (5 in-flight fixes with commit refs)
- Use Case 1 (Eucera in ecoregion) — PASS
- Use Case 2 (most frequently collected) — PASS
- T2 layout regression — PASS
- T7 month-letter regression — PASS
- PERF-01..05 spot-check table — all PASS
- Overall disposition — PASS

## In-flight fixes captured during UAT

| Commit | Fix | Surfaced by |
|--------|-----|-------------|
| `a450504` | `scripts/measure-lcp.sh` Lighthouse 13 flag conflict + macOS `mktemp` `.json` suffix breaking `require()` | PERF-02 spot check |
| `f23496f` | `082-04-SUMMARY.md` D-07 deviation note + at-time-of-execution LCP | PERF-02 audit trail |
| `86b53d8` | `_data/photos.js` named-export hid data behind `photos.default`; extracted helper to `lib/inat-srcset.js` | PERF-03 spot check (`grep -c srcset` was 0, not 489) |
| `032a29c` | `bee-species-card` grid-area collision (all 735 cards stacked at one grid coordinate); switched to `grid-column: 2` | T2 layout walkthrough |
| `195232d` | `:host(.muted)` in card static styles inert under light DOM; added descendant `bee-species-card.muted` rule to `src/styles/species.css`; emptied static-styles block to prevent re-baiting | Use Case 1 walkthrough |

## Implementation Notes — `195232d` (this plan's load-bearing fix)

`bee-species-card.ts` was carrying `:host(.muted) { opacity: 0.35 }` in its Lit `static styles` block. Lit emits the block as a `<style>` tag scoped via shadow DOM ordinarily, but this component overrides `createRenderRoot` to return `this` (light DOM, locked by D-05 to preserve Eleventy SSR children). In light DOM, `:host` only resolves inside a shadow root — the rule never matched.

`bee-species-page.ts::_computeAndPropagate` was correctly setting `card.filteredCount = 0` and `bee-species-card.ts::willUpdate` was correctly toggling the `.muted` class. Nothing styled it.

Fix:
1. Add `bee-species-page bee-species-card.muted { opacity: 0.35 }` to `src/styles/species.css` — matches the existing pattern used for `bee-species-page bee-taxon-nav li.muted`.
2. Empty the inert `static styles` block in `bee-species-card.ts` and replace its comment with an explicit anti-pattern note, so a future edit does not re-add `:host(...)` rules.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (checkpoint) | Walk UAT and draft 082-UAT.md | (current commit) | .planning/phases/082-hardening/082-UAT.md |
| Sub-fix | Mute filtered species cards via descendant selector | 195232d | src/styles/species.css, src/species/bee-species-card.ts |

## Deviations from Plan

The plan (082-08-PLAN.md) treated this as a pure recording task — "the 082-UAT.md document IS the output". In practice the UAT pre-flight surfaced five regressions that had to be fixed before the use cases could be walked at all. All fixes are recorded in `082-UAT.md` and linked in the table above. The PERF-06 question ("does the page answer the seed's two use cases against current production data?") still resolved to PASS for both cases.

## Verification

- `wc -l .planning/phases/082-hardening/082-UAT.md` → 121 (≥100 required by frontmatter).
- All four narrative sections (Use Case 1, Use Case 2, T2, T7) record explicit PASS dispositions.
- PERF-01..05 spot-check table populated with concrete values.
- `npx tsc --noEmit` → clean.
- `npm test` → 335 passed, 4 skipped; 1 pre-existing build-output suite failure (unrelated `Osmia testfaker` photo manifest fixture).

## Known Stubs

None.

## Threat Flags

None — no new network surface, no auth changes. The light-DOM fix is purely a CSS scoping correction.

## Self-Check: PASSED

- `.planning/phases/082-hardening/082-UAT.md`: FOUND (121 lines, all dispositions PASS)
- `src/styles/species.css` `bee-species-card.muted` rule: FOUND
- `src/species/bee-species-card.ts` static-styles block emptied with anti-pattern comment: FOUND
- Commit `195232d`: FOUND
