# Coding Conventions

**Analysis Date:** 2026-02-18

## Naming Patterns

**Files:**
- TypeScript: kebab-case (`bee-map.ts`, `parquet.ts`, `style.ts`)
- Python scripts: snake_case (`download.py`, `fetch_inat_links.py`, `labels_2025.py`, `occurrences.py`)
- SQL: lowercase (`schema.sql`)
- Constants/config dicts in Python: SCREAMING_SNAKE_CASE (`TAXON_DTYPES`, `FILE_CONFIGS`, `RAW_DATA_DIR`)

**Functions:**
- TypeScript: camelCase (`firstUpdated`, `render`)
- Python: snake_case (`read_occurrences`, `from_zipfile`, `to_parquet`, `apply_transformations`, `stream_and_convert_file`, `make_dump`)
- Python `main()` entry point is always named `main` and guarded by `if __name__ == "__main__":`

**Variables:**
- TypeScript: camelCase (`specimenSource`, `baseLayer`, `sphericalMercator`)
- Python: snake_case (`zip_path`, `file_key`, `dtype_spec`, `cache_path`)

**Types/Classes:**
- TypeScript: PascalCase (`BeeMap`, `ParquetSource`)
- Python type annotations use lowercase builtins and `typing` module (`dict[str, str]`, `IO[bytes]`, `Path | IO[bytes]`)

**SQL:**
- Table names: snake_case (`dumps`, `occurrences`)
- Column names: snake_case (`catalog_id`, `dump_id`, `dumped_at`)
- SQL keywords: uppercase (`CREATE TABLE`, `PRIMARY KEY`, `DEFAULT`)

## Code Style

**Formatting:**
- No formatter config detected (no `.prettierrc` or `biome.json`); code appears hand-formatted
- TypeScript indentation: 2 spaces
- Python indentation: 4 spaces

**Linting:**
- TypeScript: enforced via `tsconfig.json` with strict compiler options
  - `"strict": true`
  - `"noUnusedLocals": true`
  - `"noUnusedParameters": true`
  - `"noFallthroughCasesInSwitch": true`
  - `"noUncheckedSideEffectImports": true`
  - `"noUncheckedIndexedAccess": true`
- Python: no linter config detected

## Import Organization

**TypeScript (observed in `frontend/src/bee-map.ts`):**
1. Third-party library imports (lit, ol)
2. Local relative imports (`./parquet.ts`, `./assets/...`, `./style.ts`)

**TypeScript import style:**
- Use named imports and `type` keyword for type-only imports: `import type { Extent } from "ol/extent.js"`
- `verbatimModuleSyntax` is enabled, requiring explicit `type` imports
- Include `.js` extensions in imports even for `.ts` source files (e.g., `"lit/decorators.js"`)
- Local imports use `.ts` extension explicitly (e.g., `"./parquet.ts"`)

**Python (observed in `data/scripts/download.py`, `data/ecdysis/occurrences.py`):**
1. Standard library imports (`pathlib`, `sys`, `zipfile`, `io`, `typing`)
2. Third-party library imports (`requests`, `pandas`, `geopandas`)
3. (Local module imports follow, when present)
- `import pandas as pd` and `import geopandas` (no alias for geopandas)

## Error Handling

**TypeScript patterns:**
- Promise `.catch(failure)` passed from OpenLayers loader callbacks (`frontend/src/parquet.ts`)
- No `try/catch` blocks in frontend source; errors propagate via promise chains

**Python patterns:**
- `try/except Exception as e: print(...); raise` in `data/scripts/download.py` - catches, logs with `print`, then re-raises
- `requests.RequestException` used for network-specific error handling
- `response.raise_for_status()` used consistently after HTTP requests
- Silent `None` return on parse failures in `fetch_inat_links.py` (`extract_observation_id`)

## Logging

**TypeScript:**
- `console.debug(...)` for informational messages during data load (e.g., `"Adding ${features.length} features from ${url}"` in `frontend/src/parquet.ts`)

**Python:**
- `print(...)` used throughout for progress and status; no logging framework
- Progress messages use f-strings with percentages and MB counts
- Status updates written inline with `end='', flush=True` for single-line progress

## Comments

**When to Comment:**
- Inline comments explain non-obvious choices: `// NB: this source is unmaintained` (`frontend/src/bee-map.ts`)
- Commented-out code is left with import commented: `// import Fill from "ol/style/Fill.js";` (`frontend/src/style.ts`)
- Python docstrings used for all public module-level functions in `data/scripts/`
- Data type dicts have inline comments grouping related fields: `# IDs and numeric identifiers`, `# Dates`, `# Location`

**Docstring style (Python):**
- One-line summary as first line of docstring
- Multi-step processes use numbered list in docstring body
- Example: `data/scripts/fetch_inat_links.py` module and function docstrings

## TypeScript / JavaScript Specifics

**LitElement Web Components:**
- Decorated with `@customElement('tag-name')` at class level
- `@query('#id')` for DOM element references with `!` non-null assertion
- Optional map property: `map?: OpenLayersMap`
- `static styles = css\`...\`` for encapsulated CSS
- Lifecycle override: `firstUpdated()` for post-render initialization
- `public` access modifier explicitly on lifecycle methods

**Module pattern:**
- `"type": "module"` in `package.json`
- ES2023 target
- `experimentalDecorators: true` for LitElement decorators
- `erasableSyntaxOnly: true` (TypeScript 5.5+)

## Python Specifics

**Data pipeline conventions:**
- Dtype dictionaries defined as module-level constants for pandas `read_csv`
- Nullable integers use `'Int64'` (capital I), non-nullable use `'int64'`
- PyArrow-backed strings specified as `'string'` or `pd.StringDtype()`
- GeoDataFrame always constructed with `crs="EPSG:4326"`
- Column prefix added via `df.add_prefix('ecdysis_')` for namespace isolation

**Script entry point pattern:**
```python
if __name__ == "__main__":
    main()
```

**Path handling:**
- `pathlib.Path` used throughout, never `os.path`
- Paths defined as module-level constants (e.g., `RAW_DATA_DIR = Path("data/raw")`)

**Debugging:**
- `import pdb; pdb.set_trace()` found inline in `data/ecdysis/occurrences.py` line 95 (leftover debug code)

## SQL Conventions

**DuckDB loading pattern (documented in `data/CLAUDE.md`):**
```sql
CREATE TABLE table_name AS
SELECT
    CAST(numeric_col AS int) AS numeric_col,
    string_col,
FROM read_csv_auto(
    'path/to/file',
    header = true,
    nullstr = '',
    all_varchar = true
);
```

**Reserved keyword columns must be double-quoted:** `"order"`, `"references"`, `"type"`

---

*Convention analysis: 2026-02-18*
