---
phase: 075-authoring-scaffold
gathered: 2026-04-30
source: extracted from 075-RESEARCH.md `## Validation Architecture` per Nyquist gate
---

# Phase 75 Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with happy-dom 20.8.9 |
| Config file | `vite.config.ts` (root; `test:` block) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |
| Test count target | **172 → 172** (no test count change required; CONTEXT decision Claude's-Discretion bullet allows but does not require a 173rd test) |

## Phase Requirements → Test Map

Note: Phase 75 has no explicit `REQ-XX` IDs in PROJECT.md or ROADMAP.md. The CONTEXT.md `<decisions>` table is the requirements set. Each decision maps to an automated shell smoke (preferred) or a manual UAT step where in-browser rendering is the only available oracle.

| Req (CONTEXT) | Behavior | Test Type | Automated Command | New File? |
|---------------|----------|-----------|-------------------|-----------|
| Decision #1: orphan page emits to `/_scaffold-check/` | `_site/_scaffold-check/index.html` exists post-build | smoke | `npm run build && test -f _site/_scaffold-check/index.html` | No (shell smoke in plan verify block) |
| Decision #1: page contains build-info | Page contains version strings | smoke | `npm run build && grep -E 'eleventy.+3\.[0-9]+\.[0-9]+' _site/_scaffold-check/index.html` | No |
| Decision #2: Nunjucks layout chain | base.njk + default.njk render successfully | smoke | implicit in `npm run build` exit 0 + scaffold-check page exists | No |
| Decision #3: two-layer chain | Page contains `<bee-header>` (from default.njk) AND wraps `<main>` content | smoke | `npm run build && grep '<bee-header' _site/_scaffold-check/index.html && grep '<main>' _site/_scaffold-check/index.html` | No |
| Decision #4: bee-header chrome embedded | `<bee-header>` element + hashed bundle script tag in scaffold-check.html | smoke | `npm run build && grep -E 'src="/assets/bee-header-[A-Za-z0-9_-]+\.js"' _site/_scaffold-check/index.html` | No (THIS IS THE LOAD-BEARING ASSUMPTION-A5 PROBE) |
| Decision #5: bee-header bundle exists | `_site/assets/bee-header-*.js` exists | smoke | `npm run build && ls _site/assets/bee-header-*.js \| head -1` | No |
| Decision #5: SPA bundle unchanged in shape | `_site/assets/index-*.js` still exists; `_site/index.html` still references it | smoke | `npm run build && grep -E 'src="/assets/index-[A-Za-z0-9_-]+\.js"' _site/index.html` | No (Phase 74 invariant regression check) |
| 172 tests stay green | Vitest run | unit | `npm test` | ✅ existing |
| `VITE_MAPBOX_TOKEN` keeps working | SPA still loads Mapbox tiles | manual UAT | `npm run dev` → http://localhost:8080/ → tiles render | manual |
| Bee-header renders on `/_scaffold-check/` in dev | Visible chrome | manual UAT | `npm run dev` → http://localhost:8080/_scaffold-check/ → header visible | manual |
| Bundle size <100 KB gzipped | bee-header bundle within budget | smoke | `gzip -c _site/assets/bee-header-*.js \| wc -c` < 102400 | No (informational) |

## Sampling Rate (Nyquist)

- **Per task commit:** `npm test` (172 tests; happy-dom; <1s)
- **Per wave merge:** `npm test && npm run build` plus the smoke-grep block above (8 assertions, all shell)
- **Phase gate:** Full smoke + manual UAT (open `/_scaffold-check/` in browser; confirm chrome + build-info table; confirm SPA at `/` still works)

Sampling continuity is met: every implementation task in plan 075-01 has an `<automated>` `<verify>` block; the comprehensive build smoke (Plan 01 Task 4) gates the wave.

## Wave 0 Gaps

- [ ] No new test FILES needed in `src/tests/` — existing 172-test suite covers component behavior; build-shape verification is shell-level (no value in unit-testing build orchestration).
- [ ] [ASSUMED] If the planner adds a 173rd test asserting `customElements.get('bee-header')` after importing the entry, it goes in `src/tests/bee-header-entry.test.ts`. Optional; CONTEXT does not require it. Research recommends skipping.
- [ ] No framework install needed (Vitest 4.1.2 already present).

## Critical Probe

**Assumption A5 is load-bearing for the entire phase.** The architecture rests on `@11ty/eleventy-plugin-vite` (`appType: 'mpa'`) parsing `<script type="module" src="…">` tags across every templated HTML output and rewriting the path to a hashed bundle. pnwmoths' built `_site/` provides three-page evidence, but the first beeatlas build is the contract test.

The probe MUST appear as an automated acceptance criterion (not a manual UAT) in plan 075-01:

```bash
grep -qE 'src="/assets/bee-header-[A-Za-z0-9_-]+\.js"' _site/_scaffold-check/index.html
```

If this fails on the first build, the rest of Phase 75's architecture has to be rethought before proceeding. Plan 01 Task 4 already gates this — listed here as the canonical record.
