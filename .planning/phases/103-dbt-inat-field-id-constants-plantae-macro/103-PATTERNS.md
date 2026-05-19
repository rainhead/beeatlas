# Phase 103: dbt iNat Field ID Constants & Plantae Macro - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 5 (1 new, 4 modified)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/macros/inat_field_ids.sql` | macro | transform | `data/dbt/macros/emit_feature_collection.sql` | role-match (same skeleton; different body style) |
| `data/dbt/models/intermediate/int_samples_base.sql` | model (intermediate) | transform | itself (in-place edit) | exact |
| `data/dbt/models/intermediate/int_waba_link.sql` | model (intermediate) | transform | itself (in-place edit) | exact |
| `data/dbt/models/intermediate/int_combined.sql` | model (intermediate) | transform | itself (in-place edit) | exact |
| `data/dbt/models/intermediate/int_ecdysis_base.sql` | model (intermediate) | transform | itself (in-place edit) | exact |

## Pattern Assignments

### `data/dbt/macros/inat_field_ids.sql` (macro, new file)

**Analog:** `data/dbt/macros/emit_feature_collection.sql`

**Macro skeleton pattern** (lines 29–43 of analog — the `{% macro %}` delimiter and argument-passing form):

```sql
{% macro emit_feature_collection(model_relation, property_name, out_path) %}
...SQL body...
{% endmacro %}
```

The new file uses the same delimiter pair. Integer-constant macros take no arguments; the
`is_plant_taxon` macro takes one argument (`alias`). Both forms are valid dbt Jinja2.

**Integer-constant macro pattern** — body is a bare literal on one line, no whitespace padding:

```sql
{% macro inat_ofv_specimen_count() %}8338{% endmacro %}
```

One macro per logical line. Comments placed between macro blocks (not inside them) to avoid
injecting comment text into rendered SQL.

**Parameterized expression macro pattern** — trim markers (`{%- -%}`) suppress newlines:

```sql
{% macro is_plant_taxon(alias) -%}
CASE WHEN {{ alias }}.taxon__iconic_taxon_name = 'Plantae' THEN {{ alias }}.taxon__name ELSE NULL END
{%- endmacro %}
```

The `alias` argument is interpolated with `{{ alias }}` (double-brace, no quotes) matching
how the existing analog passes `model_relation` and `out_path` via `{{ model_relation }}` and
`{{ out_path }}`.

**Comment convention** — file-level header block before first macro; per-macro comments after
the `{% endmacro %}` line, not inside the macro body:

```sql
-- Named constants for iNaturalist observation field value (OFV) field IDs.
-- Replaces anonymous integer literals in intermediate models.

{% macro inat_ofv_specimen_count() %}8338{% endmacro %}
-- field_id = 8338: "Bee Collection: Number of bees collected"
```

---

### `data/dbt/models/intermediate/int_samples_base.sql` (model, in-place edits)

**Current state** (`data/dbt/models/intermediate/int_samples_base.sql`, lines 1–18):

```sql
-- samples_base projection: 9 columns from iNat observations + count OFV + sample_id OFV.
-- Mirrors export.py:86-103 (samples_base CTE).
SELECT
    op.id                                                                       AS observation_id,
    op.user__login                                                              AS host_inat_login,
    CAST(op.observed_on AS VARCHAR)                                             AS sample_date,
    op.observed_on                                                              AS sample_date_raw,
    op.longitude                                                                AS sample_lon,
    op.latitude                                                                 AS sample_lat,
    CAST(sc.value AS INTEGER)                                                   AS specimen_count,
    TRY_CAST(sid.value AS INTEGER)                                              AS sample_id,
    CASE WHEN op.taxon__iconic_taxon_name = 'Plantae' THEN op.taxon__name ELSE NULL END AS sample_host
FROM {{ ref('stg_inat__observations') }} op
JOIN {{ ref('stg_inat__ofvs') }} sc
    ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
LEFT JOIN {{ ref('stg_inat__ofvs') }} sid
    ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
```

**Three edits required:**
1. Line 12: replace bare CASE expression with `{{ is_plant_taxon('op') }}`
2. Line 15: replace `8338` with `{{ inat_ofv_specimen_count() }}`
3. Line 17: replace `9963` with `{{ inat_ofv_sample_id() }}`

**Alignment convention:** existing column list uses space-padding to align `AS` keywords at
column 80. Macro call `{{ is_plant_taxon('op') }}` is longer than the original CASE expression;
preserve the `AS sample_host` suffix but allow the padding to shift — do not alter surrounding
column alignment.

---

### `data/dbt/models/intermediate/int_waba_link.sql` (model, in-place edit)

**Current state** (`data/dbt/models/intermediate/int_waba_link.sql`, lines 1–11):

```sql
-- catalog_suffix -> MIN(waba.id) via waba ofvs field_id=18116.
-- Mirrors export.py:46-55 (waba_link CTE).
SELECT
    CAST(ofv.value AS BIGINT) AS catalog_suffix,
    MIN(waba.id) AS specimen_observation_id
FROM {{ ref('stg_waba__observations') }} waba
JOIN {{ ref('stg_waba__ofvs') }} ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
    AND ofv.value != ''
GROUP BY catalog_suffix
```

**One edit required:**
- Line 9: replace `18116` with `{{ inat_ofv_catalog_suffix() }}`

**Header comment:** the comment on line 1 references `field_id=18116` by number — leave as-is
(it is documentation, not a load-bearing SQL literal; RESEARCH.md §open-questions notes this).

---

### `data/dbt/models/intermediate/int_combined.sql` (model, in-place edit)

**Relevant lines** (lines 82–83 of `data/dbt/models/intermediate/int_combined.sql`):

```sql
LEFT JOIN {{ ref('stg_waba__ofvs') }} ofv1718
    ON ofv1718._dlt_root_id = sob.waba_dlt_id AND ofv1718.field_id = 1718
```

**One edit required:**
- Line 83: replace `1718` with `{{ inat_ofv_host_obs_url() }}`

**Alias `ofv1718` is NOT renamed** — RESEARCH.md §open-questions explicitly defers this as
cosmetic scope creep outside DBT-01/DBT-02.

---

### `data/dbt/models/intermediate/int_ecdysis_base.sql` (model, in-place edit)

**Current state of the CASE line** (`data/dbt/models/intermediate/int_ecdysis_base.sql`, line 21):

```sql
    CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host,
```

**One edit required:**
- Line 21: replace bare CASE expression with `{{ is_plant_taxon('inat') }}`, keeping `AS inat_host,`

**Spacing note:** align `{{ is_plant_taxon('inat') }}` with the indentation of surrounding
column expressions (4 spaces). The existing alignment padding before `AS inat_host` can be
dropped — `{{ is_plant_taxon('inat') }}` expands at render time and the rendered SQL will be
readable regardless.

---

## Shared Patterns

### dbt macro call syntax
**Source:** `data/dbt/macros/emit_feature_collection.sql` (lines 29, 36, 39, 42)
**Apply to:** all call sites in intermediate models

```sql
{{ macro_name() }}          -- zero-argument macro (integer constant)
{{ macro_name('alias') }}   -- one-argument macro (expression with table alias)
```

Double-brace, no spaces inside braces, single-quoted string arguments when passing an alias.
This matches the existing project usage of `{{ ref('...') }}` and `{{ model_relation }}`.

### Verification command
**Source:** `data/dbt/run.sh` (wrapper; sets `DBT_PROFILES_DIR`, `DBT_PROJECT_DIR`)
**Apply to:** after every `.sql` edit

```bash
bash data/dbt/run.sh build
```

Never invoke `dbt build` directly — the wrapper resolves the DuckDB profile path
(`path: ../beeatlas.duckdb` is relative to the dbt project dir set by the wrapper).

---

## No Analog Found

None — all files have clear analogs or are in-place edits of existing files.

---

## Metadata

**Analog search scope:** `data/dbt/macros/`, `data/dbt/models/intermediate/`
**Files scanned:** 6 (1 macro, 5 intermediate models)
**Pattern extraction date:** 2026-05-18
