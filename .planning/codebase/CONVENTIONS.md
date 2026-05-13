# Coding Conventions

**Analysis Date:** 2026-05-13

## TypeScript Strict Mode

**Enabled compiler flags (`tsconfig.json`):**
- `strict: true` — Full strict type checking
- `noUnusedLocals: true` — Error on unused variables
- `noUnusedParameters: false` — Allow unused parameters (intentional for flexibility)
- `noFallthroughCasesInSwitch: true` — Prevent missing case breaks
- `noUncheckedSideEffectImports: true` — Guard against side-effect-only imports without explicit statement
- `noUncheckedIndexedAccess: true` — Require type guards for bracket access
- `verbatimModuleSyntax: true` — Require explicit `type` keyword for type imports
- `rewriteRelativeImportExtensions: true` — Auto-add `.ts` to relative imports in `.ts` files
- `experimentalDecorators: true` — Support `@customElement`, `@state`, etc. (Lit)

**Target:** ES2023, DOM + DOM.Iterable libraries

**Key characteristic:** All inferred types must be correct. Files won't compile with implicit `any`, unguarded indexing, or type mismatches.

## File Naming Conventions

**TypeScript Components (Lit):**
- `kebab-case.ts` — Web components
- Examples: `bee-atlas.ts`, `bee-header.ts`, `bee-species-card.ts`, `bee-species-page.ts`
- Single export per file (the component class)

**TypeScript Utilities:**
- `camelCase.ts` — Functions and pure modules
- Examples: `filter.ts`, `sqlite.ts`, `url-state.ts`, `features.ts`, `seasonality-cache.ts`

**Python:**
- `snake_case.py` — All modules
- Examples: `canonical_name.py`, `checklist_pipeline.py`, `species_maps.py`, `resolve_taxon_ids.py`

**Test Files:**
- TypeScript: `{filename}.test.ts` (co-located in `src/tests/`)
- Python: `test_{module_name}.py` (in `data/tests/`)

## Identifier Naming Patterns

**TypeScript:**

- **Class methods:** `camelCase`
  - Example: `buildFilterSQL()`, `queryTablePage()`, `loadOccurrenceGeoJSON()`
  
- **Properties:** `camelCase`
  - Public: `viewMode`, `taxonName`, `selectedOccIds`
  - Private: `_filterState`, `_visibleIds`, `_mapMoveDebounce`
  - Prefix `_` for private (Lit convention)
  
- **Constants:** `SCREAMING_SNAKE_CASE`
  - Example: `DEFAULT_LON`, `DEFAULT_LAT`, `BUDGET_BYTES`, `ASSETS_DIR`
  
- **Type/Interface names:** `PascalCase`
  - Example: `FilterState`, `OccurrenceRow`, `TaxonOption`, `DataSummary`

**Python:**
  
- **Functions:** `snake_case`
  - Example: `canonicalize()`, `load_checklist()`, `build_filter_sql()`
  
- **Classes:** `PascalCase`
  - Example: `BeeHeader` (rare in data layer — mostly functional)
  
- **Constants:** `SCREAMING_SNAKE_CASE`
  - Example: `BUDGET_BYTES`, `EXPECTED`, `LICENSE_WHITELIST`, `FORBIDDEN`
  
- **Module-level private:** `_leading_underscore`
  - Example: `_INAT_PACE_SECONDS`, `_create_schemas()` (conftest.py)

## Lit Component Patterns

**Custom Element Registration:**
```typescript
@customElement('bee-atlas')
export class BeeAtlas extends LitElement {
  // ...
}
```
- File name matches tag name (kebab-case): `bee-atlas.ts`
- Decorator at class level

**State Management (Lit reactive properties):**
```typescript
@state() private _filterState: FilterState = { /* ... */ };
@state() private _visibleIds: Set<string> | null = null;
```
- Use `@state()` decorator for private reactive properties
- Private prefix `_` (Lit convention)
- Type annotations required
- Initialization at declaration

**Styles:**
```typescript
static styles = css`...`;
```
- Define as static class field using `css` template literal
- Scoped to component via shadow DOM

**Rendering:**
```typescript
override render() {
  return html`<div>${this.property}</div>`;
}
```
- Override `render()` returning a `TemplateResult`
- Use `html` template literal for type safety

**Event Emission:**
```typescript
this.dispatchEvent(new CustomEvent('filter-changed', {
  detail: filterState,
  bubbles: true,
  composed: true,
}));
```
- Emit custom events with `CustomEvent`
- Set `composed: true` for cross-shadow-DOM consumption
- Event names use kebab-case

**Light DOM (Presenter Pattern):**
```typescript
override createRenderRoot() {
  return this; // Light DOM — render into component itself
}
```
- Used for server-rendered presenters (e.g., `BeeSpeciesCard`)
- Do NOT override `render()` — preserves SSR children
- See `src/tests/bee-species-card.test.ts` (D-05 contract)

## Import Organization

**Order (TypeScript files):**
```typescript
1. External dependencies (npm packages)
   import { css, html, LitElement } from 'lit';
   import { customElement, state } from 'lit/decorators.js';
   import mapboxgl from 'mapbox-gl';

2. Internal module imports (src/)
   import { buildFilterSQL, FilterState } from './filter.ts';
   import { getDB } from './sqlite.ts';

3. Side-effect imports (no bindings)
   import './bee-header.ts';
   import './bee-map.ts';
```

**Relative imports:**
- Use relative paths: `import { X } from './filter.ts'`
- `tsconfig.json` forces `.ts` extension via `rewriteRelativeImportExtensions`
- No path aliases in use

**Type imports (when using `verbatimModuleSyntax`):**
```typescript
import type { FilterState, OccurrenceRow } from './filter.ts';
```
- Prefix with `type` keyword (required by strict mode)

## Comments and JSDoc

**JSDoc for exported functions:**
```typescript
/**
 * Builds a SQL WHERE clause from a FilterState object.
 * @param filter - The filter configuration
 * @returns {string} A SQL WHERE expression (e.g., "1 = 1" for empty filter)
 */
export function buildFilterSQL(filter: FilterState): string {
```

**Inline comments:**
- Use sparingly, only when intent is non-obvious
- Explain *why*, not *what* (code should be self-documenting)
- Example from `bee-atlas.ts`:
  ```typescript
  // Monotonic counter used to discard stale async filter-query results.
  // Root cause of chip-removal flicker: _filterState updates synchronously...
  private _filterQueryGeneration = 0;
  ```

**Phase/Issue markers in comments:**
- Reference phase numbers: `// Phase 80 Wave 0 — RED architectural test`
- Reference specific checks: `// ARCH-04 / PAGE-08: forbidden imports`
- See `src/tests/arch.test.ts`, `src/tests/bee-species-card.test.ts`

**Block comments for complex logic:**
```python
# ------------------------------------------------------------------
# LIN-05 ≥95% coverage fixture (Phase 77 plan 01).
# Goal: 20 distinct canonical_names...
# ------------------------------------------------------------------
```
- Used in Python test fixtures for clarity
- See `data/tests/conftest.py` (lines 361–415)

## Python Conventions

**Module docstrings:**
```python
"""Tests for checklist_pipeline.load_checklist (Phase 76 / Plan 03).

Loads the WA bee checklist TSV against an isolated DuckDB and asserts:
  - checklist_data.species has the locked 11-column schema (CHECK-03 / D-04)
  - checklist_data.species_counties preserves per-(species, county) rows
"""
```
- Describe scope and requirements
- List major assertions or responsibilities

**Function docstrings (pytest fixtures):**
```python
def fixture_db(tmp_path_factory):
    """Create a test DuckDB with all schemas and seed data. Returns path to DB file."""
```
- Single-line for simple fixtures
- Multi-line for complex setup

**Class conventions:**
- Minimal use in data layer (mostly functional)
- Fixtures use `@pytest.fixture` decorators instead of classes

## Error Handling

**TypeScript:**
- Return `null` for "not found" / absent cases
- Use optional chaining: `obj?.prop`
- Type guards for unions: `if (value !== null) { /* ... */ }`
- Promise rejection for async failures (caught by try/catch)

**Python:**
- Raise exceptions for error conditions
- Use `try/except` blocks in public API functions
- Custom exceptions in pipelines (e.g., for schema validation)
- `monkeypatch` in tests to mock exception-prone imports (see `conftest.py` line 553)

## Logging

**TypeScript:**
- No global logger framework (console output only where necessary)
- Validation scripts use `console.log()`, `console.warn()`, `console.error()`
- Example: `validate-schema.mjs` prints "ok" / "x" status lines

**Python:**
- No global logger configured in pipeline
- Pipelines print status to stdout
- Tests use DuckDB `.execute()` directly (no logging middleware)
- `monkeypatch` zeros out pacing delays (see `conftest.py` line 559)

## Validation and Pre-Build Gates

**Build script order (package.json):**
```json
"build": "npm run validate-schema && npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size"
```

Order is load-bearing:
1. `validate-schema` — Parquet column contract (DATA-01)
2. `validate-species` — TOML photo manifest (PHOTO-01..PHOTO-05)
3. `typecheck` — TypeScript compilation (no-emit)
4. `eleventy` — Build HTML + Vite bundles
5. `validate-bundle-size` — JS chunk budget (PERF-01)

**Running tests independently:**
```bash
npm test                    # Run all Vitest files
cd data && uv run pytest    # Run all pytest tests
```

## Commit Message Conventions

**Format:** Conventional Commits with scope and phase markers

**Patterns observed:**
- Feature: `feat(scope): description`
  - Example: `feat(084-01): add occurrences contract (TEST-02)`
  
- Fix: `fix(scope): description`
  - Example: `fix(084): address verifier findings — correct schema.yml comment`
  
- Docs: `docs(scope): description`
  - Example: `docs(codebase/STACK.md): correct stale map engine`
  
- Chore: `chore: description`
  - Example: `chore: archive v3.3 dbt Spike milestone`

**Phase work:**
- Use phase number: `feat(083-03): add base-projection intermediate models`
- Reference phase docs: `docs(phase-084): update tracking after wave 2`
- Reference specific rules/gates: `feat(084-02): author test_dbt_diff.py with 9 DIFF-01 and DIFF-02 assertions`

**Special markers:**
- Reference contract checks: `feat(084-01): add occurrences contract (TEST-02)`
- Reference numbered requirements: `feat(084-02): author test_dbt_diff.py with 9 DIFF-01 and DIFF-02 assertions`

## Module Design

**Barrel files:**
- Not used in this project
- Direct imports preferred: `import { buildFilterSQL } from './filter.ts'`

**Default exports:**
- Not used; named exports only

**Module-level state:**
- Minimal; most state is component-level (Lit `@state()`)
- Singletons where necessary: `getDB()` returns cached SQLite connection
- No shared mutable module-level objects in frontend (enforced by architecture)

---

*Convention analysis: 2026-05-13*
