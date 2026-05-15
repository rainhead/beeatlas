# Phase 92: Slug Migration & Pipeline Prep — Research

**Researched:** 2026-05-15
**Domain:** Data pipeline / slug format migration
**Confidence:** HIGH

## Summary

Phase 92 changes how species slugs are generated in `species_export.py` and updates all consumers. The current `_slugify()` function in `data/feeds.py` produces flat, lowercase, ASCII slugs: `Andrena milwaukeensis` → `andrena-milwaukeensis`. The new format is `Genus/specificEpithet`: `Andrena/milwaukeensis`.

The slug is written in exactly one place — `data/species_export.py` line 141 (`r['slug'] = _slugify(r['scientificName'])`). It is consumed by: (1) `data/species_maps.py` which names SVG output files `{slug}.svg`; (2) `_pages/species.njk` which references `/data/species-maps/{sp.slug}.svg`; (3) `data/tests/test_dbt_diff.py` which asserts the slug column exists.

`content/species-photos.toml` does NOT use slugs as keys — it uses `scientificName` strings (e.g., `"Andrena milwaukeensis"`). The REQUIREMENTS.md description of migrating photo keys "to match the hierarchical slug format" likely means ensuring all keys are in the same `scientificName` form that the new URL hierarchy will use. There are 106 bare-word lowercase keys (e.g., `[species.agapostemon]`) that do not match any `scientificName` in `species.json` — these would be flagged as warnings by `validate-species.mjs`. These stale/orphaned entries need investigation.

**Primary recommendation:** Change slug production in `species_export.py` from `_slugify(scientificName)` to `f"{genus}/{specific_epithet}"` for rows that have `specific_epithet`, preserving the current fallback for genus-only rows. Update `species_maps.py` to write SVGs into subdirectories (`maps_dir / genus / f"{specific_epithet}.svg"`). Update `species.njk` to use the new path. Audit and clean `species-photos.toml` bare-word keys.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Slug computation | Python pipeline (species_export.py) | — | Slug is generated once at export time, stored in species.parquet + species.json |
| SVG file naming/location | Python pipeline (species_maps.py) | — | Reads slug from species.parquet; names files accordingly |
| Template reference to SVG | Frontend Server (Eleventy/Nunjucks) | — | species.njk interpolates `sp.slug` into img src path |
| Photo manifest lookup | Frontend Server (Eleventy/Nunjucks) | — | _data/photos.js exposes TOML keys as Record keyed by name |
| Slug validation | Test suite | CI | test_dbt_diff.py + validate-species.mjs |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-03 | `species_export.py` updates the `slug` field to the new hierarchical path format (`Genus/specificEpithet`); `content/species-photos.toml` keys are migrated to match | Change slug computation in `export_species_parquet()` from `_slugify(scientificName)` to `f"{genus}/{specific_epithet}"`; update SVG path in `species_maps.py` and `species.njk`; investigate + fix 106 bare-word TOML keys that are already orphaned |
</phase_requirements>

## Standard Stack

No new libraries required. This phase is pure Python/JS refactoring within the existing stack. [VERIFIED: codebase grep]

### Core (already installed)
| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| `data/feeds.py:_slugify` | — | Current flat-slug producer | Will NOT be changed — feeds.py slug is still used for feed file names (collector/genus feeds); only species_export.py consumption changes |
| `data/species_export.py` | — | Writes slug to species.parquet + species.json | Primary edit target |
| `data/species_maps.py` | — | Names SVG files by slug | Must handle slash in slug → subdirectory |
| `_pages/species.njk` | — | Renders `sp.slug` into img src | Must update src path |
| `content/species-photos.toml` | — | Photo manifest keyed by scientificName | Key format investigation needed |

## Architecture Patterns

### System Architecture Diagram

```
dbt build
    └── data/dbt/target/sandbox/species.parquet (18 cols, no slug)
            │
            ▼
    species_export.py
            │  reads 18-col parquet
            │  computes slug = f"{genus}/{specific_epithet}" (NEW)
            │  writes slug column
            ├── public/data/species.parquet  (19 cols)
            └── public/data/species.json     (includes slug field)
                        │
            ┌───────────┘
            │
    species_maps.py
            │  reads slug from public/data/species.parquet
            │  for each slug like "Andrena/milwaukeensis"
            │  writes: public/data/species-maps/Andrena/milwaukeensis.svg
            └── public/data/species-maps/{Genus}/{epithet}.svg
                        │
    Eleventy build
            │  _data/species.js reads species.json (includes slug)
            │  species.njk renders sp.slug
            └── <img src="/data/species-maps/{sp.slug}.svg">
                  (works because sp.slug = "Andrena/milwaukeensis"
                   and the file is at species-maps/Andrena/milwaukeensis.svg)
```

### Recommended Project Structure (after migration)

```
public/data/species-maps/
├── Agapostemon/
│   ├── femoratus.svg
│   ├── texanus.svg
│   └── virescens.svg
├── Andrena/
│   ├── aculeata.svg
│   ├── amphibola.svg
│   └── ...
└── ...
```

Note: The existing flat `public/data/species-maps/*.svg` files will be wiped by `species_maps.py`'s D-04 wipe-and-rewrite at the start of each run. No manual cleanup needed.

### Pattern 1: New Slug Computation

**What:** Replace `_slugify(scientificName)` with direct `genus/specific_epithet` construction.

**When to use:** For species rows (those with `specific_epithet` non-null). For genus-only rows (102 rows, none on_checklist), a fallback slug is needed.

**Example:**
```python
# Source: codebase inspection of data/species_export.py line 141 [VERIFIED]
# CURRENT:
r['slug'] = _slugify(r['scientificName'])  # "andrena-milwaukeensis"

# NEW:
genus = r.get('genus') or ''
epithet = r.get('specific_epithet') or ''
if genus and epithet:
    r['slug'] = f"{genus}/{epithet}"        # "Andrena/milwaukeensis"
else:
    # Genus-only rows (102 rows, none on_checklist) — use genus name only
    r['slug'] = genus or _slugify(r['scientificName'])
```

**Pitfall:** The `specific_epithet` column already exists in the 18-col dbt mart output (verified in `data/dbt/models/marts/schema.yml`). No new dbt changes are needed. [VERIFIED: codebase]

### Pattern 2: SVG Path with Subdirectory

**What:** `species_maps.py` uses `out_dir / f"{slug}.svg"` (line 167). With slashes in slug, `Path / "Andrena/milwaukeensis.svg"` automatically creates a subdirectory path. Python's `Path` handles forward slashes correctly on all platforms.

**Example:**
```python
# Source: data/species_maps.py line 167 [VERIFIED: codebase]
# CURRENT:
out_path = out_dir / f"{slug}.svg"           # species-maps/andrena-milwaukeensis.svg

# NEW (no code change needed if slug contains "/" already):
out_path = out_dir / f"{slug}.svg"           # species-maps/Andrena/milwaukeensis.svg
# BUT: must mkdir the subdirectory first:
out_path = out_dir / f"{slug}.svg"
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(...)
```

**Also:** The `total_size` glob at line 246 currently uses `maps_dir.glob('*.svg')` — this will miss files in subdirectories. Must change to `maps_dir.rglob('*.svg')`.

### Pattern 3: Template Reference (No Logic Change Needed)

The Nunjucks template at `_pages/species.njk` line 42 already uses `sp.slug` verbatim:
```
<img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" ...>
```
After the slug becomes `"Andrena/milwaukeensis"`, this renders as `/data/species-maps/Andrena/milwaukeensis.svg` — which is correct. No template change required. [VERIFIED: codebase]

### Anti-Patterns to Avoid

- **Changing `_slugify()` in `feeds.py`:** The feed system uses `_slugify` for collector/genus feed filenames. Those slugs are completely independent of the species slug format and must remain flat ASCII. Do not alter `feeds.py:_slugify`.
- **Applying `_slugify()` to the new hierarchical slug:** The new slug intentionally contains `/` and uppercase — applying `_slugify` would strip both. The new production method must bypass `_slugify` entirely for species rows.
- **Recomputing slug in `species_maps.py`:** `species_maps.py` has a documented Pitfall #3: "NEVER recompute slug from scientificName here." It correctly reads slug from `species.parquet`. This invariant must be preserved — only change `species_export.py`, which is the single source of truth for slug values.
- **Missing `out_path.parent.mkdir()`:** SVG writes will fail with `FileNotFoundError` if the genus subdirectory doesn't exist. The current `_write_species_svg` doesn't mkdir because all output was flat. With the new subdirectory structure, each write needs `out_path.parent.mkdir(parents=True, exist_ok=True)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path-safe slug with `/` | Custom sanitizer | Just `f"{genus}/{epithet}"` — both fields come from dbt-validated schema, guaranteed safe | genus and specific_epithet come from dbt mart with NOT NULL constraints on source checklist |
| TOML key migration script | Complex parser | `@iarna/toml` parse + rebuild, or a targeted `sed`/Python script — keys are a known finite set | 735 entries; simple enough to script directly |

## Runtime State Inventory

This is a content migration, not a rename/refactor of an identifier string used as a key in a datastore. The slug is a computed output field, not a storage key. However, one critical runtime state concern exists:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `public/data/species.parquet` and `public/data/species.json` — both contain `slug` column/field in old flat format | Re-run `species_export.py` after code change — pipeline overwrites these files |
| Live service config | S3 bucket holds `data/species.json` and `data/species.parquet` — fetched by CI build | Nightly pipeline re-upload after the code change lands on maderas will update S3 automatically |
| OS-registered state | None — nightly.sh runs `python run.py` which calls `species_export.py` and `species_maps.py` sequentially | No action — pipeline self-heals on next nightly run |
| Secrets/env vars | None — no secrets reference slug format | None |
| Build artifacts | `public/data/species-maps/*.svg` — 556 files in flat format. `species_maps.py` D-04 wipe-and-rewrite clears these on every run | None — wipe-and-rewrite handles cleanup automatically |

**CI impact:** CI fetches `species.json` and `species.parquet` from S3 (`aws s3 cp`) before building. After the pipeline runs on maderas and uploads updated artifacts, CI picks up new slugs automatically. Before that first nightly run, CI would build with old S3 artifacts containing old slugs — but the Eleventy template references are format-agnostic (`sp.slug` is just interpolated). No broken references during the transition window.

## Common Pitfalls

### Pitfall 1: glob('*.svg') Misses Subdirectories

**What goes wrong:** `species_maps.py` line 246 uses `maps_dir.glob('*.svg')` to compute total file size. After migration, SVGs are in subdirectories (`Andrena/aculeata.svg`, etc.) and `glob('*.svg')` returns zero files.

**Why it happens:** `glob` with a single `*` is non-recursive.

**How to avoid:** Change to `maps_dir.rglob('*.svg')`.

**Warning signs:** Printed stats show "0 bytes" or "0 files" after a successful run.

### Pitfall 2: Missing Parent Directory for SVG Write

**What goes wrong:** `_write_species_svg` calls `out_path.write_text(...)` where `out_path` is now `species-maps/Andrena/milwaukeensis.svg`. The `Andrena/` subdirectory does not exist yet, causing `FileNotFoundError`.

**Why it happens:** The current code only `mkdir(parents=True)` on `maps_dir` itself, not on per-genus subdirectories.

**How to avoid:** Add `out_path.parent.mkdir(parents=True, exist_ok=True)` inside `_write_species_svg` before `write_text`.

### Pitfall 3: Test Fixture Uses Old Slug Format

**What goes wrong:** `data/tests/test_dbt_diff.py` asserts `p_cols[-1] == ('slug', 'VARCHAR')` — this test only checks the column name and type, not the value format. It will continue to pass. [VERIFIED: codebase] However, `src/tests/validate-species.test.ts` fixture has `slug: 'osmia-lignaria'` (line 14). After migration the production slug would be `Osmia/lignaria`. This fixture is used only to test the validate-species script logic (not slug format), so it is not a breaking issue — the fixture slug value is never validated against a pattern.

**How to avoid:** Update test fixture slug to `Osmia/lignaria` for conceptual correctness, though not strictly required for test correctness.

### Pitfall 4: species-photos.toml Bare-Word Keys

**What goes wrong:** `content/species-photos.toml` has 106 bare-word (unquoted, no space) keys like `[species.agapostemon]`. These are parsed by `@iarna/toml` as keys `agapostemon`, `andrena`, etc. — they do NOT match any `scientificName` in `species.json` (which has `"Agapostemon"`, `"Agapostemon femoratus"`, etc.). The `validate-species.mjs` script warns (but does not error) on unknown names. These are likely orphaned entries from a previous import.

**Why it happens:** Old slug-based import script used lowercase genus names as keys; actual species have properly-capitalized `scientificName` values.

**How to avoid:** Per REQUIREMENTS.md PIPE-03, migrate keys to the new format. The migration semantics are: keys in `species-photos.toml` should match `scientificName` values in `species.json`. The 106 bare-word keys need to be either removed (if truly orphaned) or rekeyed to their proper `scientificName`. The 629 quoted keys mostly already match `scientificName` values — with some exceptions for lowercase entries like `"agapostemon subtilior"` (should be `"Agapostemon subtilior"` if that's the `scientificName`).

**Warning signs:** `npm run validate-species` reports warnings for many species names.

### Pitfall 5: photos Lookup Keyed by scientificName, Not Slug

**What goes wrong:** Developer assumes the species-photos.toml migration is a slug-key migration. In fact, `_data/photos.js` exposes TOML entries keyed by the TOML section name, and `species.njk` lookups via `photos[sp.scientificName]`. The TOML key IS the scientificName, not the slug.

**Why it happens:** REQUIREMENTS.md PIPE-03 says "TOML keys match the new hierarchical slug format" — but this is misleading. The TOML section header `[species."Andrena milwaukeensis"]` is keyed by the scientific name string, not by a slug. The new URL hierarchy uses `Genus/specificEpithet` as the *URL path*, not as the TOML key.

**How to avoid:** Do not change TOML keys to `Andrena/milwaukeensis` format — that would break the `photos[sp.scientificName]` lookup in `species.njk`. The TOML migration should normalize existing keys to match their correct `scientificName` values. PIPE-03's "keys match the hierarchical slug format" language needs clarification — it likely means "no orphaned keys", i.e., every key that exists in the TOML should match a known `scientificName`. [ASSUMED — needs user confirmation on exact TOML migration target]

## Code Examples

### Slug Generation (species_export.py)

```python
# Source: data/species_export.py line 140-141 [VERIFIED: codebase]
# Replace this:
for r in species_rows:
    r['slug'] = _slugify(r['scientificName'])

# With this:
for r in species_rows:
    genus = r.get('genus') or ''
    epithet = r.get('specific_epithet') or ''
    if genus and epithet:
        r['slug'] = f"{genus}/{epithet}"
    else:
        # Genus-only or incomplete rows (102 rows in production, none on_checklist)
        r['slug'] = genus if genus else _slugify(r['scientificName'])
    if r.get('month_histogram') is None:
        r['month_histogram'] = list(_ZERO_HIST)
```

### SVG Write with Subdirectory (species_maps.py)

```python
# Source: data/species_maps.py lines 133-172 [VERIFIED: codebase]
# In _write_species_svg, add one line before out_path.write_text:
out_path = out_dir / f"{slug}.svg"
out_path.parent.mkdir(parents=True, exist_ok=True)  # NEW: create Genus/ subdir
out_path.write_text(
    ET.tostring(root, xml_declaration=True, encoding="unicode"),
    encoding="utf-8",
)

# Also fix glob to rglob in generate_species_maps (line 246):
total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))  # was glob
```

### Pytest Test for New Slug Format

```python
# New test to add to data/tests/ (likely test_species_export.py or test_dbt_diff.py)
def test_species_slug_hierarchical_format(fixture_con, export_dir):
    """slug field uses Genus/epithet format for species rows."""
    # Run export (needs species.parquet from dbt in SANDBOX)
    # ... setup ...
    rows = con.execute(
        f"SELECT slug, genus, specific_epithet FROM read_parquet('{species_parquet}')"
        " WHERE specific_epithet IS NOT NULL LIMIT 10"
    ).fetchall()
    for slug, genus, epithet in rows:
        assert slug == f"{genus}/{epithet}", f"Expected {genus}/{epithet}, got {slug}"
    # Verify no slug contains the old pattern (lowercase-dash)
    old_pattern = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{species_parquet}')"
        " WHERE slug LIKE '%-%' AND specific_epithet IS NOT NULL"
    ).fetchone()[0]
    assert old_pattern == 0
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat lowercase slug `andrena-milwaukeensis` | Hierarchical `Andrena/milwaukeensis` | Phase 92 | Enables URL routing at `/species/{Genus}/{specificEpithet}/` in Phase 94 |

**Key design rationale:** The hierarchical slug is both the species URL path segment and the SVG file path. Using `Genus/specificEpithet` means: (1) the `img src` path in `species.njk` directly maps to the static file path without any additional logic, and (2) future genus/species pages (Phase 94) can use the same `slug` field from `species.json` to construct their Eleventy output paths.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TOML migration target is "normalize keys to match `scientificName`" not "convert keys to `Genus/epithet` format" | Pitfall 5, Common Pitfalls | If wrong and TOML keys should literally become `Genus/epithet`, then `_data/photos.js` and `species.njk` lookups would break (they use `sp.scientificName` as key) — would require template changes too |
| A2 | Genus-only rows (102, none `on_checklist`) should use genus name alone as slug (e.g., `"Agapostemon"` not `"Agapostemon/"`) | Standard Stack / Code Examples | If wrong (e.g., they should be excluded from species-maps entirely), affects how `_write_species_svg` handles these rows |

**Confirmation needed from user before execution:** Assumption A1 — what exactly should happen to `species-photos.toml` keys? Options: (a) keep `scientificName`-based keys but remove orphaned bare-word entries, or (b) something else. This determines whether the TOML migration is a cleanup task or a structural key-format change.

## Open Questions

1. **What should happen to the 106 bare-word TOML keys?**
   - What we know: keys like `[species.agapostemon]` do not match any `scientificName`. They were created by some earlier import script. Some have photos attached.
   - What's unclear: Are these orphaned (species not in the WA checklist or occurrence data) or do they represent real entries that need to be rekeyed to their proper `scientificName`?
   - Recommendation: Run `npm run validate-species` before and after — the "unknown species" warnings identify these. If they already warn, they are orphaned and should be removed. If they have photos that belong to real species, rekeying is required.

2. **Slug for genus-only rows (102 rows, `specific_epithet IS NULL`)**
   - What we know: These include rows like `agapostemon` (genus with no epithet), `agapostemon subtilior` (subgenus records), etc. None are `on_checklist`.
   - What's unclear: Should they get a slug at all? The SVG map references `sp.slug` only when `sp.occurrence_count > 0`, so genus-only rows with occurrences need a non-null slug.
   - Recommendation: Use `genus` alone (e.g., `"Agapostemon"`) for genus-only rows. This is safe since Phase 94 genus pages will use a different URL scheme.

## Environment Availability

Step 2.6 SKIPPED — this phase makes no external service calls. All dependencies are already present: Python pipeline, dbt output files, TOML tooling (`@iarna/toml`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Python) | pytest via `uv run pytest` |
| Framework (JS) | Vitest via `npm test` |
| Config file (Python) | `data/pyproject.toml` |
| Config file (JS) | `vitest.config.ts` |
| Quick run command (Python) | `cd data && uv run pytest tests/test_feeds.py tests/test_dbt_diff.py -x` |
| Full suite command | `npm test && cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-03a | `species_export.py` writes `Genus/specificEpithet` slug | unit | `cd data && uv run pytest tests/test_species_export.py::test_slug_hierarchical -x` | ❌ Wave 0 |
| PIPE-03b | No slug contains old `genus-epithet` flat format | unit | `cd data && uv run pytest tests/test_species_export.py::test_no_old_slug_format -x` | ❌ Wave 0 |
| PIPE-03c | species-maps SVGs exist at `Genus/epithet.svg` paths | integration | `cd data && uv run pytest tests/test_species_maps.py::test_svg_hierarchical_path -x` | ❌ Wave 0 |
| PIPE-03d | `validate-species.mjs` passes (no errors on TOML after migration) | integration | `npm run validate-species` | ✅ (script exists; test covers it in `validate-species.test.ts`) |
| PIPE-03e | CI build passes with new slug format | e2e | `npm run build` | ✅ (existing build script) |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_feeds.py tests/test_dbt_diff.py -x && npm run validate-species`
- **Per wave merge:** `npm test && cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_species_export.py` — covers PIPE-03a, PIPE-03b (new file needed for slug format tests)
- [ ] `data/tests/test_species_maps.py` — covers PIPE-03c (may extend existing or create new)

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

This phase makes no changes to authentication, session management, input handling, cryptography, or access control. The slug is computed from dbt-validated database columns (`genus`, `specific_epithet`) that are already sanitized at the source. The slug is used only as a file path component and URL path segment — both rendered server-side by Eleventy at build time, not at runtime. ASVS categories V2-V6 do not apply.

## Sources

### Primary (HIGH confidence)
- `data/species_export.py` — verified slug computation at line 141 [VERIFIED: codebase]
- `data/feeds.py:_slugify` — verified function signature and behavior [VERIFIED: codebase]
- `data/species_maps.py` — verified file write pattern, D-04 wipe-and-rewrite, Pitfall #3 [VERIFIED: codebase]
- `_pages/species.njk` — verified `sp.slug` interpolation at line 42 [VERIFIED: codebase]
- `_data/photos.js` — verified photo lookup key is `name` (TOML section key), not slug [VERIFIED: codebase]
- `data/dbt/models/marts/schema.yml` — verified `specific_epithet` column exists in 18-col contract [VERIFIED: codebase]
- `public/data/species.json` — verified current slug format and species row counts [VERIFIED: codebase]
- `content/species-photos.toml` — verified 735 entries, 106 bare-word keys, 629 quoted keys [VERIFIED: codebase]
- `data/tests/test_dbt_diff.py` — verified existing slug column assertion [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- None

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Slug computation location: HIGH — single source, verified in codebase
- Consumer inventory: HIGH — exhaustive grep across njk, ts, py files
- TOML key semantics: MEDIUM — photos.js keying confirmed, but PIPE-03's stated goal for TOML migration is ambiguous (see Assumption A1)
- Test gaps: HIGH — confirmed no test for hierarchical slug format yet

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (stable codebase; no external API dependencies)
