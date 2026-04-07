# Coding Conventions

*Updated: 2026-04-07 (from intel refresh; originally 2026-02-18)*

## Naming Patterns

**Files:**
- TypeScript: kebab-case (`bee-atlas.ts`, `bee-map.ts`, `url-state.ts`)
- Python: snake_case (`run.py`, `export.py`, `ecdysis_pipeline.py`)

**Functions/variables:**
- TypeScript: camelCase
- Python: snake_case; module-level constants SCREAMING_SNAKE_CASE

**Types/classes:**
- TypeScript: PascalCase (`BeeAtlas`, `BeeMap`, `FilterState`)
- CSS custom elements: kebab-case matching file name (`bee-atlas`, `bee-map`)

## TypeScript

**Strict compiler options** (`frontend/tsconfig.json`):
- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`

**Import style:**
- Use `type` keyword for type-only imports: `import type { Extent } from "ol/extent.js"`
- Include `.js` extension on third-party imports; `.ts` on local imports
- `verbatimModuleSyntax` enforced — explicit `type` imports required

**LitElement patterns:**
- `@customElement('tag-name')` at class level
- `@property()` for parent-driven state, `@state()` for internal state
- `updated(changedProperties)` as synchronization boundary between Lit properties and OL canvas operations
- `static styles = css\`...\`` for encapsulated CSS

**Module pattern:** `"type": "module"`, ES2023 target, `experimentalDecorators: true`

## Python

**Packaging:** `uv` with `pyproject.toml`; requires Python 3.14+

**Path handling:** `pathlib.Path` throughout, never `os.path`

**Entry point pattern:**
```python
if __name__ == "__main__":
    main()
```

**Import order:** stdlib → third-party → local

## SQL (DuckDB)

Keywords uppercase; table/column names snake_case. Reserved keyword columns double-quoted (`"order"`, `"type"`).

## Formatting

- TypeScript: 2-space indentation (no formatter config; hand-formatted)
- Python: 4-space indentation
