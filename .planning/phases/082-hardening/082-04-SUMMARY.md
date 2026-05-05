---
phase: 082-hardening
plan: 04
subsystem: perf
tags: [lighthouse, lcp, perf, scripts, pre-release-ritual]

# Dependency graph
requires:
  - phase: 080-species-page
    provides: /species/ page that renders all species cards (canary URL target)
  - plan: 082-01
    provides: bundle-size gate ensures build artifacts within budget before LCP measurement
  - plan: 082-02
    provides: species-page layout CSS — meaningful "above the fold" for LCP attribution
  - plan: 082-03
    provides: photo srcset — medium hero (500w) is what LCP should measure
provides:
  - scripts/measure-lcp.sh — local Lighthouse mobile runner, asserts LCP < 3000 ms
  - npm run measure-lcp — ergonomic alias (NOT in build chain per D-06)
  - data/README.md "Performance" section — re-runnable command per SC #2
affects:
  - 082-08 (UAT — plan 08 cites the LCP value recorded here in PERF-02 spot-check)
  - future per-species page work (will need to re-pin CANARY_PATH via D-07 DuckDB query)

# Tech tracking
tech-stack:
  added:
    - lighthouse (npx-only; not a dev dependency — kept ephemeral per pre-release-ritual nature)
    - serve (npx-only; ephemeral static server)
  patterns:
    - "Pre-release ritual script: standalone bash, trap-teardown of background server, mobile-throttled Lighthouse, hard budget gate"
    - "Pinned canary URL with derivation query as a top-of-script comment (re-derivable when underlying data shifts)"

key-files:
  created:
    - scripts/measure-lcp.sh
  modified:
    - package.json
    - data/README.md

key-decisions:
  - "CANARY_PATH=/species/ — D-07 deviation: per-species pages do not exist in v3.2 ship shape; the species index page renders all 735 cards and is the worst-case for LCP. The DuckDB derivation query is preserved verbatim as a top-of-script comment so the canary can be re-pinned once per-species pages ship."
  - "Drop --preset=desktop; assert --screenEmulation.mobile=true alongside --form-factor=mobile. Lighthouse 13 rejects the desktop preset + mobile form-factor combo because the desktop preset sets screenEmulation.mobile=false. The original plan text suggested --preset=desktop to disable LH auto-throttling so the explicit cpuSlowdownMultiplier is honored — but the explicit --throttling.cpuSlowdownMultiplier=4 already overrides the default mobile throttle, and dropping the desktop preset keeps mobile screen emulation aligned with form-factor=mobile (PERF-02 wants mobile measurement, not a hybrid)."
  - "Read the Lighthouse JSON via fs.readFileSync + JSON.parse rather than require() because macOS mktemp -t TEMPLATE appends its random suffix AFTER the template (lcp-XXXXXX.json becomes lcp-XXXXXX.json.abc123), defeating require()'s extension-based JSON detection."
  - "NOT wired into build/prebuild/postbuild (D-06): pre-release ritual, not CI gate. Mobile-throttle Lighthouse on shared runners is ±15% noisy and would burn trust."

patterns-established:
  - "Pre-release ritual scripts live in scripts/ with their invocation documented in data/README.md (SC #2 wording: 'documented command in data/README.md or scripts/'). They are NOT wired into npm run build."

requirements-completed: [PERF-02]

# Metrics
duration: ~30min (plan tasks 1-3 + post-execution debug)
completed: 2026-05-05
---

# Phase 82 Plan 04: Local Lighthouse runner (PERF-02 / D-06 / D-07) Summary

**`scripts/measure-lcp.sh` builds the site, serves `_site` on `localhost:8080`, runs Lighthouse mobile against `/species/`, asserts LCP < 3000 ms. Wired as `npm run measure-lcp` (NOT in build chain). Documented in `data/README.md` Performance section. Current build measures LCP at 1312 ms — 1688 ms headroom against the 3000 ms budget.**

## D-07 deviation note

**Per-species pages do not exist; canary collapses to `/species/` index.** The species page is a single `/species/index.html` that renders all 735 species cards (the worst case for LCP — far worse than any per-species page would be). The DuckDB top-occurrence-count query D-07 prescribes is preserved verbatim as a comment at the top of `scripts/measure-lcp.sh`; re-derive via that query and update `CANARY_PATH` when per-species pages ship.

## Accomplishments

- `scripts/measure-lcp.sh` authored: build → background `npx serve` with trap-teardown → polled HTTP-200 readiness check → `npx lighthouse` with mobile form-factor + mobile screen emulation + cpuSlowdownMultiplier=4 → parse `audits.largest-contentful-paint.numericValue` → exit non-zero if ≥ 3000 ms
- `npm run measure-lcp` alias added; build/prebuild/postbuild scripts left untouched (D-06)
- `data/README.md` Performance section added with the invocation, what it does, the canary-pinning rationale, and the explicit "NOT in CI" note
- Verified end-to-end on current build: **LCP = 1312 ms / 3000 ms (1688 ms headroom)**, exit 0

## Task Commits

1. **Task 1: Author scripts/measure-lcp.sh** — `9712798`
2. **Task 2: Add npm run measure-lcp alias (NOT in build chain)** — `bd3fa6f`
3. **Task 3: Document the runner in data/README.md "Performance" section** — `31ae56d`
4. **Post-execution fix: repair measure-lcp.sh runtime errors** — `a450504`

## Files Created/Modified

- `scripts/measure-lcp.sh` — new local Lighthouse runner (executable)
- `package.json` — `scripts.measure-lcp` entry added
- `data/README.md` — Performance section appended

## Deviations from Plan

- **D-07 canary collapse to `/species/`** (acknowledged in plan `<notes>` and `<interfaces>`): no per-species pages exist in v3.2; the species index is the worst-case page. DuckDB derivation query preserved as a script comment.
- **Lighthouse flag adjustment** (post-execution fix, `a450504`): the plan text in Task 1 prescribed `--preset=desktop --form-factor=mobile`, but Lighthouse 13 rejects that combo with `Screen emulation mobile setting (false) does not match formFactor setting (mobile)`. Dropped `--preset=desktop`; added explicit `--screenEmulation.mobile=true`. The explicit `--throttling.cpuSlowdownMultiplier=4` already overrides the mobile-preset default, so the desktop preset was load-bearing only for "disable auto-throttle" — which the explicit override accomplishes anyway. Net result: mobile measurement, mobile screen, mobile throttle, explicit CPU slowdown — closer to the D-06 spec spirit than the original flag combo.
- **JSON parse path**: plan used `require('${OUT_JSON}')`; macOS `mktemp -t lcp-XXXXXX.json` appends its random suffix AFTER the template, producing `lcp-XXXXXX.json.abc123` and defeating require()'s `.json` extension detection. Switched to `fs.readFileSync + JSON.parse`.

## Issues Encountered

- First end-to-end run failed twice before producing the LCP value:
  1. `--preset=desktop` + `--form-factor=mobile` rejected by Lighthouse validation (fixed by dropping the desktop preset).
  2. `require('/tmp/lcp-XXXXXX.json.<rand>')` failed with `SyntaxError: Unexpected token ':'` because the path didn't end in `.json` (fixed by switching to `fs.readFileSync + JSON.parse`).
- Both fixes ship in `a450504`; the script now runs cleanly end-to-end on macOS.

## Known Stubs

None. The script is a real measurement; the data/README documentation is final.

## Threat Flags

None. The script is local-only, ephemeral, and uses `npx` for Lighthouse + serve so no new project dependencies are added. No network endpoints introduced; no auth surface; no schema changes.

## Next Phase Readiness

- PERF-02 satisfied: documented command exists, mobile measurement, current build under budget at 1312 ms (44% of budget — generous headroom).
- Plan 082-08 (UAT, PERF-06) can now record the PERF-02 spot-check row with the concrete LCP value 1312 ms.
- Future per-species page work (Phase 83+) must re-pin `CANARY_PATH` via the DuckDB query embedded in the script comment.

## Self-Check

- `scripts/measure-lcp.sh` — FOUND, executable, 65 lines
- `package.json` `scripts.measure-lcp` — FOUND
- `data/README.md` "## Performance" section — FOUND with `npm run measure-lcp`, `PERF-02`, and `scripts/measure-lcp.sh` references
- `npm run measure-lcp` end-to-end exit 0 with LCP 1312 ms — VERIFIED
- D-07 deviation note recorded above — DONE
- Commits 9712798, bd3fa6f, 31ae56d, a450504 — VERIFIED via git log

## Self-Check: PASSED

---
*Phase: 082-hardening*
*Completed: 2026-05-05*
