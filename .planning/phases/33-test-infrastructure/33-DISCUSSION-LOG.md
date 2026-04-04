# Phase 33: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 33-test-infrastructure
**Areas discussed:** Test file location, Vitest config, Initial trivial test

---

## Test File Location

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located (`src/filter.test.ts`) | Standard Vite/Vitest pattern; tests live next to source files | ✓ |
| `test/` directory at `frontend/` root | Clear separation; common in Jest projects | |

**User's choice:** Recommended default (co-located)
**Notes:** User accepted all recommended choices without modification.

---

## Vitest Config

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `vite.config.ts` with `test:` block | Single config file; standard when vite.config is minimal | ✓ |
| Separate `vitest.config.ts` | Clean separation from build config | |

**User's choice:** Recommended default (extend vite.config.ts)
**Notes:** Config is already minimal (3 lines); no reason to split.

---

## Initial Trivial Test

| Option | Description | Selected |
|--------|-------------|----------|
| Pure assertion, no imports (`expect(1+1).toBe(2)`) | Validates harness only; avoids module side effect issues | ✓ |
| Import a pure constant or type from a module | Slightly more meaningful but fragile until Phase 34 | |

**User's choice:** Recommended default (pure assertion)
**Notes:** Current modules (filter.ts, duckdb.ts) have module-level side effects that Phase 34 will remove. Importing them in Phase 33 tests would be premature.

---

## Claude's Discretion

- Test file name for the initial smoke test
- Whether to use `vitest/globals` types or explicit imports
- npm test script form (`vitest run` vs `vitest`)
