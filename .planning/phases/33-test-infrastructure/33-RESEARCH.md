# Phase 33: Test Infrastructure - Research

**Researched:** 2026-04-04
**Domain:** Vitest + happy-dom setup in an existing Vite/TypeScript project
**Confidence:** HIGH

## Summary

This phase installs Vitest 4.x and happy-dom into `frontend/`, extends the existing `vite.config.ts` with a `test:` block, and adds a single trivial passing test. The work is mechanical: Vitest is the natural companion to Vite (shared transform pipeline) and integrates with minimal configuration. The only decision worth validating is how to handle the `tsconfig.json` `types` array given the project already declares `"types": ["vite/client"]`.

The recommended approach for the `types` question is to use the `/// <reference types="vitest/config" />` triple-slash directive in `vite.config.ts` rather than adding `"vitest/globals"` to `tsconfig.json`. This avoids touching tsconfig and sidesteps any risk of conflicts with `vite/client`. Test files use explicit `import { expect, test } from 'vitest'` imports rather than relying on globals, which is consistent with the project's strict TypeScript posture and avoids needing `"types": ["vitest/globals"]` at all.

**Primary recommendation:** Install `vitest` and `happy-dom` as devDependencies, add `/// <reference types="vitest/config" />` to `vite.config.ts`, extend the config's `test:` block with `environment: 'happy-dom'`, add `"test": "vitest run"` script to `package.json`, write a trivial `src/smoke.test.ts` with explicit imports.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Extend `vite.config.ts` with a `test:` block — do not create a separate `vitest.config.ts`. The existing config is minimal (3 lines); no reason to split it.
- **D-02:** Set `environment: 'happy-dom'` in the test config block so DOM APIs are available.
- **D-03:** Co-locate test files alongside source (`src/filter.test.ts`, `src/url-state.test.ts`, etc.). This is the standard Vite/Vitest convention and matches the project's single-directory source structure.
- **D-04:** The first test is a pure assertion with no module imports (`expect(1 + 1).toBe(2)`) or equivalent. Current frontend modules have DuckDB import side effects at the module level; testing them in isolation will be addressed in Phase 34. The Phase 33 test only validates that the harness is wired correctly.

### Claude's Discretion

- Test file name for the trivial test (e.g., `src/setup.test.ts` or `src/smoke.test.ts`)
- Whether to add `"types": ["vitest/globals"]` to tsconfig or use explicit imports — choose whichever avoids conflicts with the existing `"types": ["vite/client"]` setup
- npm test script exact form (e.g., `vitest run` for CI-style exit, vs `vitest` for watch mode — `vitest run` preferred for `npm test`)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Vitest + happy-dom installed and configured in `frontend/`; `npm test` script runs the suite and exits non-zero on failure | Vitest 4.1.2 + happy-dom 20.8.9 satisfy this; `vitest run` exits non-zero on failure by design |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.2 | Test runner, assertion library | Native Vite integration — shares the Vite transform pipeline; no separate Babel/ts-jest config needed |
| happy-dom | 20.8.9 | DOM environment for tests | Faster than jsdom; listed as a first-class Vitest environment; officially supported via `environment: 'happy-dom'` |

### Supporting

No additional packages required for this phase. The trivial smoke test needs no libraries beyond `vitest` itself.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| happy-dom | jsdom | jsdom is more complete but slower; happy-dom is sufficient and preferred per D-02 |
| extending vite.config.ts | separate vitest.config.ts | Separate file adds complexity for no benefit given the minimal existing config; D-01 locks this |
| explicit `import { test, expect } from 'vitest'` | `globals: true` + `vitest/globals` tsconfig type | Globals require adding to `tsconfig.json` types array; explicit imports are cleaner and avoid type conflicts |

**Installation:**
```bash
npm install -D vitest happy-dom
```

**Version verification (confirmed 2026-04-04):**
- `vitest`: 4.1.2 (latest stable, verified via `npm view vitest version`)
- `happy-dom`: 20.8.9 (latest stable, verified via `npm view happy-dom version`)

## Architecture Patterns

### Recommended Project Structure

After this phase, `frontend/src/` gains one new file:

```
frontend/
├── vite.config.ts       # extended with test: block + /// reference
├── package.json         # +vitest, +happy-dom devDeps; +"test" script
└── src/
    └── smoke.test.ts    # trivial passing test (or setup.test.ts)
```

Co-located test files (D-03) means future tests live beside their subjects:
```
src/
├── filter.ts
├── filter.test.ts       # Phase 38
├── url-state.ts
└── url-state.test.ts    # Phase 38
```

### Pattern 1: Triple-slash directive with existing vite.config.ts

**What:** Add `/// <reference types="vitest/config" />` as the first line of `vite.config.ts` so TypeScript knows about the `test:` property. Import `defineConfig` from `vite` (unchanged).

**When to use:** When you already have a `vite.config.ts` and don't want to change the import. This is the Vitest 4 documented approach when keeping Vite's `defineConfig`.

**Example:**
```typescript
// Source: https://vitest.dev/guide/
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
  },
});
```

### Pattern 2: Explicit imports in test files (no globals)

**What:** Each test file imports `test`, `expect`, etc. from `'vitest'` explicitly. No `globals: true` in config. No `"vitest/globals"` in tsconfig types.

**When to use:** This project has `"types": ["vite/client"]` in tsconfig. Adding `"vitest/globals"` alongside it risks type conflicts and is unnecessary when using explicit imports. Explicit imports are also more legible.

**Example:**
```typescript
// Source: https://vitest.dev/guide/
import { expect, test } from 'vitest';

test('smoke', () => {
  expect(1 + 1).toBe(2);
});
```

### Anti-Patterns to Avoid

- **Separate vitest.config.ts:** Violates D-01; duplicates build config; not needed for a project of this size.
- **globals: true with tsconfig types injection:** The `"types": ["vite/client"]` array in tsconfig is explicit; adding `"vitest/globals"` to it risks conflicts and is unnecessary. Use explicit imports instead.
- **Importing from a source module in the smoke test:** D-04 prohibits this because frontend modules have DuckDB module-level side effects. The smoke test must be self-contained (`expect(1 + 1).toBe(2)`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript transform for tests | Custom ts-node/esbuild pipeline | Vitest (uses Vite's transform) | Vitest reuses the existing Vite/TypeScript config automatically |
| DOM environment | Manual DOM mocking | happy-dom via `environment: 'happy-dom'` | Handles browser globals, window, document without per-test setup |
| Test exit code for CI | Shell wrapper script | `vitest run` | Non-watch mode exits 0 on pass, non-zero on failure by default |

**Key insight:** Vitest requires zero additional transform configuration in a Vite project — it shares the same pipeline. Adding it is genuinely additive: two packages, three config lines, one script.

## Common Pitfalls

### Pitfall 1: Old triple-slash syntax `<reference types="vitest" />`

**What goes wrong:** In Vitest 4, `/// <reference types="vitest" />` (without `/config`) no longer provides the `test:` block types for `defineConfig`.
**Why it happens:** Vitest 4 reorganized its type exports.
**How to avoid:** Use `/// <reference types="vitest/config" />` (with `/config`).
**Warning signs:** TypeScript error on the `test:` property in `vite.config.ts`.

### Pitfall 2: Test file imports a module with DuckDB side effects

**What goes wrong:** Importing any existing `src/*.ts` module causes DuckDB WASM initialization to fire during test collection, which fails in a Node/happy-dom environment.
**Why it happens:** `duckdb.ts` and modules that import it have module-level side effects.
**How to avoid:** D-04 explicitly prohibits any module imports in the Phase 33 smoke test. The pure arithmetic assertion (`expect(1 + 1).toBe(2)`) avoids this entirely. Phase 34 eliminates the side effects before Phase 38 adds real module imports.
**Warning signs:** Test runner hangs or throws WASM-related errors during setup.

### Pitfall 3: `vitest run` vs `vitest` in the npm script

**What goes wrong:** Using `vitest` (no subcommand) in `npm test` starts watch mode, which never exits in CI.
**Why it happens:** `vitest` defaults to watch mode when a TTY is detected; in some CI environments it doesn't detect TTY and behaves differently — inconsistent.
**How to avoid:** Use `"test": "vitest run"` — run mode always exits after completing the suite.
**Warning signs:** `npm test` hangs waiting for file changes.

### Pitfall 4: `noUncheckedIndexedAccess` and test assertions

**What goes wrong:** The project tsconfig has `noUncheckedIndexedAccess: true`. Test code that indexes arrays without checking for undefined (e.g., `arr[0].prop`) will produce TypeScript errors.
**Why it happens:** This tsconfig flag adds `| undefined` to all array index access types.
**How to avoid:** The smoke test uses no array access, so this is not a Phase 33 issue. Documented here so Phase 38 is aware.

## Code Examples

### Final vite.config.ts

```typescript
// Source: https://vitest.dev/guide/
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
  },
});
```

### package.json scripts section (after change)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

### src/smoke.test.ts (trivial passing test, recommended name)

```typescript
// Source: https://vitest.dev/guide/
import { expect, test } from 'vitest';

test('harness is wired', () => {
  expect(1 + 1).toBe(2);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/// <reference types="vitest" />` | `/// <reference types="vitest/config" />` | Vitest 4.0 | Old form no longer types the `test:` block |
| `jsdom` as default DOM env | `happy-dom` (faster, explicit opt-in) | Vitest 1.x+ | happy-dom is preferred for speed; jsdom remains available |

**Deprecated/outdated:**
- `<reference types="vitest" />` (without `/config`): deprecated in Vitest 4; use `vitest/config`.

## Open Questions

1. **Test file name: `smoke.test.ts` vs `setup.test.ts`**
   - What we know: Both are reasonable; CONTEXT.md leaves this to discretion
   - What's unclear: Project convention has no existing test files to follow
   - Recommendation: Use `src/smoke.test.ts` — "smoke" is a recognized term for a bare harness validation test; "setup" could imply test setup code (fixtures, hooks)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest runtime | Yes | v24.12.0 | — |
| npm | package install | Yes | (bundled with Node) | — |
| vitest | test runner | No (not yet installed) | install 4.1.2 | — |
| happy-dom | DOM environment | No (not yet installed) | install 20.8.9 | — |

**Missing dependencies with no fallback:**
- `vitest` and `happy-dom` must be installed as devDependencies — this is the entire purpose of Phase 33.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test block — does not exist yet, Wave 0) |
| Quick run command | `cd frontend && npm test` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | `npm test` runs Vitest and exits non-zero on failure | smoke | `cd frontend && npm test` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npm test`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/smoke.test.ts` — trivial passing test to validate harness (TEST-01)
- [ ] `frontend/vite.config.ts` test block — add `environment: 'happy-dom'`
- [ ] Framework install: `npm install -D vitest happy-dom` in `frontend/`
- [ ] `package.json` script: `"test": "vitest run"`

## Sources

### Primary (HIGH confidence)

- https://vitest.dev/guide/ — installation requirements (Vite >=6, Node >=20), `vitest run` subcommand, explicit imports pattern
- https://vitest.dev/guide/environment — `environment: 'happy-dom'` config, `npm install -D happy-dom` requirement
- https://vitest.dev/config/ — `/// <reference types="vitest/config" />` directive for Vitest 4
- npm registry (`npm view vitest version`, `npm view happy-dom version`) — confirmed versions 4.1.2 and 20.8.9

### Secondary (MEDIUM confidence)

- https://github.com/vitest-dev/vitest/issues/1019 — context on triple-slash directive migration in Vitest 4
- WebSearch results on `vitest/globals` + `vite/client` conflicts — pattern confirmed: explicit imports avoid needing `vitest/globals` in tsconfig entirely

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed against npm registry; Vitest/Vite compatibility verified (Vitest 4 requires Vite >=6, project uses Vite ^6.2.3)
- Architecture: HIGH — three-line config change, documented in official Vitest guide
- Pitfalls: HIGH for DuckDB side-effect risk (known project-specific issue from CONTEXT.md); HIGH for `vitest/config` triple-slash (official docs); MEDIUM for `noUncheckedIndexedAccess` (inferred from tsconfig, not tested)

**Research date:** 2026-04-04
**Valid until:** 2026-07-04 (Vitest releases frequently but the configuration API is stable in v4)
