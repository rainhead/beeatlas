# Phase 33: Test Infrastructure - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Install Vitest + happy-dom, configure `npm test` in `frontend/`, and add a trivial passing test. This phase establishes the test harness only — no real test coverage. Real tests are written in Phase 38 against the stable post-refactor API.

</domain>

<decisions>
## Implementation Decisions

### Vitest Configuration
- **D-01:** Extend `vite.config.ts` with a `test:` block — do not create a separate `vitest.config.ts`. The existing config is minimal (3 lines); no reason to split it.
- **D-02:** Set `environment: 'happy-dom'` in the test config block so DOM APIs are available.

### Test File Location
- **D-03:** Co-locate test files alongside source (`src/filter.test.ts`, `src/url-state.test.ts`, etc.). This is the standard Vite/Vitest convention and matches the project's single-directory source structure.

### Initial Trivial Test
- **D-04:** The first test is a pure assertion with no module imports (`expect(1 + 1).toBe(2)`) or equivalent. Current frontend modules have DuckDB import side effects at the module level; testing them in isolation will be addressed in Phase 34. The Phase 33 test only validates that the harness is wired correctly.

### Claude's Discretion
- Test file name for the trivial test (e.g., `src/setup.test.ts` or `src/smoke.test.ts`)
- Whether to add `"types": ["vitest/globals"]` to tsconfig or use explicit imports — choose whichever avoids conflicts with the existing `"types": ["vite/client"]` setup
- npm test script exact form (e.g., `vitest run` for CI-style exit, vs `vitest` for watch mode — `vitest run` preferred for `npm test`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Test Infrastructure — TEST-01 is the only requirement for this phase

### Existing Config
- `frontend/package.json` — current scripts and dependencies (no test runner present)
- `frontend/vite.config.ts` — minimal config to extend with `test:` block
- `frontend/tsconfig.json` — uses `"module": "nodenext"`, `allowImportingTsExtensions`, `"types": ["vite/client"]` — Vitest setup must not conflict

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None relevant to test infrastructure setup

### Established Patterns
- Vite as build tool — Vitest is the natural companion (shared transform pipeline)
- TypeScript strict mode throughout — tests should also be strict
- `"module": "nodenext"` in tsconfig — Vitest's Vite-based transform handles `.ts` imports correctly; no separate tsconfig needed for tests unless tsc type-checking is added

### Integration Points
- `frontend/package.json` — add `vitest` and `@vitest/happy-dom` (or `happy-dom`) to devDependencies; add `"test": "vitest run"` script
- `frontend/vite.config.ts` — add `test:` block with `environment: 'happy-dom'`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-test-infrastructure*
*Context gathered: 2026-04-03*
