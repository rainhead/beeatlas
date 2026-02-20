# Bee Atlas Data Project

## Project Overview
This is a data project for a bee atlas, collecting and integrating bee occurrence data from multiple sources to support biodiversity research and mapping in Washington State and beyond.

## Directory Structure
- `scripts/` - Data download and processing scripts (Python)
- `ecdysis/` - Ecdysis collection data (DarwinCore format)
- `gbif-wa-bees/` - GBIF data for Washington bees
- `inat/` - iNaturalist observation data
- `osu_mm/` - Oregon State University Museum data
- `data/` - Processed data outputs
- `assemble.sql` - Main DuckDB script to load and assemble data

## Data Sources
1. **GBIF** - Global Biodiversity Information Facility backbone taxonomy
2. **Ecdysis** - Symbiota collections portal (https://ecdysis.org)
3. **iNaturalist** - Community science observations
4. **OSU Museum** - Oregon State University Museum specimens

## Critical File Format Quirk ⚠️

**The ecdysis `.tab` files have inconsistent delimiters despite identical file extensions:**

| File | Extension | Actual Format | Delimiter |
|------|-----------|---------------|-----------|
| `occurrences.tab` | `.tab` | TSV | `\t` (tab) |
| `identifications.tab` | `.tab` | **CSV** | `,` (comma) |
| `multimedia.tab` | `.tab` | **CSV** | `,` (comma) |
| `identifiers.tab` | `.tab` | **CSV** | `,` (comma) |

**Only `occurrences.tab` is actually tab-separated!** The others are comma-separated despite the `.tab` extension.

### SQL Implications
When loading these files with DuckDB:
- **occurrences.tab**: Use `read_csv_auto(..., delim = '\t', ...)`
- **identifications.tab, multimedia.tab**: Use `read_csv_auto(...)` (default comma delimiter)

## Ecdysis Data Structure

The Ecdysis data follows DarwinCore format with three related tables:

### ecdysis_occurrences (44,969 rows)
Main occurrence records. Primary key: `id`
- Core specimen data (location, date, taxonomy)
- Links to taxonomy via `taxonID`
- Links to collection via `collID`

### ecdysis_identifications (82,164 rows)
Taxonomic determination history. Foreign key: `coreid` → `occurrences.id`
- Multiple identifications per occurrence
- `identificationIsCurrent`: boolean flag for current determination
- `modified`: timestamp of last update

### ecdysis_multimedia (4 rows)
Media files (images) linked to specimens. Foreign key: `coreid` → `occurrences.id`
- Image URLs (thumbnail, full-size, high-quality)
- Metadata and licensing information
- `comments`: timestamp (not text!)

## Schema Definitions

### Source of Truth
`scripts/download.py` contains dtype specifications for all data sources:
- `TAXON_DTYPES` - GBIF backbone taxonomy
- `MASTER_2025_DTYPES` - Field observation data
- `ECDYSIS_DTYPES` - Ecdysis occurrences

### Python → DuckDB Type Mapping
When converting from pandas dtypes to DuckDB SQL types:
- `int64` → `BIGINT` or `INTEGER`
- `Int64` (nullable) → `BIGINT` or `INTEGER`
- `float64` → `DOUBLE`
- `string` → `VARCHAR`
- `category` → `VARCHAR` (or ENUM if defined)
- Python booleans → `BOOLEAN`

## DuckDB/SQL Conventions

### Loading Pattern
Standard pattern used in `assemble.sql`:
```sql
CREATE TABLE table_name AS
SELECT
    CAST(numeric_col AS int) AS numeric_col,
    CAST(float_col AS DOUBLE) AS float_col,
    string_col,  -- No cast needed for VARCHAR
    "reserved_keyword_col"  -- Quote SQL keywords
FROM read_csv_auto(
    'path/to/file',
    header = true,
    nullstr = '',
    all_varchar = true  -- Read everything as VARCHAR first, then cast explicitly
);
```

### SQL Reserved Keywords
The following column names must be quoted in SQL:
- `order` (taxonomy rank)
- `references` (citation field)
- `type` (media type)

Use double quotes: `"order"`, `"references"`, `"type"`

## Data Processing Notes

### Sex Enum
`assemble.sql` defines a custom ENUM type for sex:
```sql
CREATE TYPE sex AS ENUM ('f', 'm');
```
Applied with validation in occurrences table:
```sql
CASE WHEN sex in ('m', 'f') THEN sex::sex END AS sex
```

### Null Handling
- Empty strings in CSV/TSV files are treated as NULL (`nullstr = ''`)
- Use nullable integer types (`Int64` in pandas) when NULLs are expected
- DuckDB handles NULL values by default in all column types

## Git Workflow
- Current branch: `pandas`
- Main branch for PRs: `main`
- Data files are gitignored (tracked via DVC or separately)

## Common Tasks

### Verify File Delimiters
```bash
head -1 file.tab | od -c | head -3  # Look for \t (tab) or , (comma)
```

### Test SQL Scripts
```bash
duckdb test.db < script.sql
duckdb test.db -c "SELECT COUNT(*) FROM table_name"
rm test.db  # Clean up test database
```

### Check DuckDB Auto-Detected Schema
```bash
duckdb :memory: -c "DESCRIBE SELECT * FROM read_csv_auto('file.csv', header=true, sample_size=-1)"
```
