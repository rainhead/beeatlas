# Phase 103: dbt iNat Field ID Constants & Plantae Macro - Research

**Researched:** 2026-05-18
**Domain:** dbt macro authoring / SQL constant extraction / Jinja2 templating
**Confidence:** HIGH

---

## Summary

Phase 103 is a pure refactoring of three dbt intermediate models. The four iNat OFV field ID
integer literals (`8338`, `9963`, `18116`, `1718`) appear as anonymous JOIN conditions in
`int_samples_base.sql`, `int_waba_link.sql`, and `int_combined.sql`. These need to be replaced
by named macros in a new file `data/dbt/macros/inat_field_ids.sql`. Separately, an identical
`CASE WHEN taxon__iconic_taxon_name = 'Plantae' THEN taxon__name ELSE NULL END` expression
appears in both `int_ecdysis_base.sql` and `int_samples_base.sql` with different table alias
prefixes; this should be extracted into a parameterized macro.

No new models, no schema changes, no new data columns. The only output contract that matters
is `bash data/dbt/run.sh build` continuing to exit 0 with all tests PASS. The diff test suite
(`test_dbt_diff.py`) provides the full regression guard: if the macro substitution changes
any query semantics, row counts or ecdysis_id key sets will diverge.

**Primary recommendation:** Create one new macro file `data/dbt/macros/inat_field_ids.sql`
with five macros (`inat_ofv_specimen_count`, `inat_ofv_sample_id`, `inat_ofv_catalog_suffix`,
`inat_ofv_host_obs_url`, `is_plant_taxon`). Replace all four integer literals and both CASE
expressions in-place in the three affected models. Run `bash data/dbt/run.sh build` after
every SQL edit to confirm no regressions.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DBT-01 | `data/dbt/macros/inat_field_ids.sql` defines named macros for all four OFV field IDs; anonymous literals replaced in all intermediate models; `dbt build` passes | Four literal sites identified in three files; macro authoring pattern established |
| DBT-02 | Duplicated `is_plant_taxon` CASE expression extracted into a shared macro; the expression does not appear in more than one `.sql` file; `dbt build` passes | Two identical expressions identified with differing table alias prefixes; parameterized macro approach documented below |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OFV field ID constants | dbt macros layer | — | Shared SQL constants live in `macros/`; consumed by any model that needs them |
| Plantae CASE predicate | dbt macros layer | — | Parameterized macro eliminates duplication across two intermediate models |
| JOIN condition evaluation | dbt intermediate layer | — | The JOIN logic itself stays in each model; only the literal value is delegated to a macro |
| Regression testing | `test_dbt_diff.py` / `dbt build` | — | Row count + key-set parity is the regression gate; no new test needed |

---

## Current Code Inventory

### OFV field ID literals in SQL [VERIFIED: grep]

All four anonymous integer literals appear exclusively in intermediate models:

| File | Line | Field ID | Semantic meaning |
|------|------|----------|-----------------|
| `data/dbt/models/intermediate/int_samples_base.sql` | 15 | `8338` | Specimen count OFV (`sc.field_id = 8338`) |
| `data/dbt/models/intermediate/int_samples_base.sql` | 17 | `9963` | Sample ID OFV (`sid.field_id = 9963`) |
| `data/dbt/models/intermediate/int_combined.sql` | 83 | `1718` | Host observation URL OFV (`ofv1718.field_id = 1718`) |
| `data/dbt/models/intermediate/int_waba_link.sql` | 9 | `18116` | Ecdysis catalog suffix OFV (`ofv.field_id = 18116`) |

Comments in `stg_inat__ofvs.sql` and `stg_waba__ofvs.sql` name each field ID but are not
load-bearing SQL — they are documentation only and do not need macro substitution.

### Duplicated `is_plant_taxon` CASE expressions [VERIFIED: grep]

| File | Line | Alias prefix | Output column |
|------|------|--------------|---------------|
| `data/dbt/models/intermediate/int_ecdysis_base.sql` | 21 | `inat.` | `inat_host` |
| `data/dbt/models/intermediate/int_samples_base.sql` | 12 | `op.` | `sample_host` |

Both expressions have the same structure: `CASE WHEN {alias}.taxon__iconic_taxon_name = 'Plantae' THEN {alias}.taxon__name ELSE NULL END`. The table alias differs; the output column alias is assigned by the calling model, not by the macro.

### Existing macro file [VERIFIED: ls]

`data/dbt/macros/emit_feature_collection.sql` — the sole existing macro. Its body is a full
SQL statement (a DuckDB `COPY` command). The integer-constant macros follow the same Jinja2
`{% macro name() %}` skeleton but their body is just the integer literal, which dbt renders
inline wherever `{{ macro_name() }}` appears.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dbt-core | 1.10.1 | Jinja2 macro rendering, model compilation | Already installed; locked via `run.sh` uvx pin |
| dbt-duckdb | 1.10.1 | DuckDB adapter | Already installed; locked via `run.sh` uvx pin |

No new packages required for this phase. All work is authoring `.sql` files.

**Version verification:** `bash data/dbt/run.sh --version` → Core: 1.10.1 [VERIFIED: bash]

---

## Package Legitimacy Audit

No new packages are installed in this phase.

---

## Architecture Patterns

### Pattern 1: Integer-constant macro (dbt / Jinja2)

**What:** A macro whose body is a bare integer literal. When rendered into SQL, `{{ macro_name() }}` is replaced with the integer. No arguments required.

**When to use:** Anywhere an integer literal has domain meaning (a field ID, a status code, a magic number) and could appear in multiple models.

**Example:**
```sql
-- data/dbt/macros/inat_field_ids.sql
{% macro inat_ofv_specimen_count() %}8338{% endmacro %}
{% macro inat_ofv_sample_id() %}9963{% endmacro %}
{% macro inat_ofv_catalog_suffix() %}18116{% endmacro %}
{% macro inat_ofv_host_obs_url() %}1718{% endmacro %}
```

**Call site (in a model):**
```sql
JOIN {{ ref('stg_inat__ofvs') }} sc
    ON sc._dlt_root_id = op._dlt_id AND sc.field_id = {{ inat_ofv_specimen_count() }} AND sc.value != ''
```

**Source:** dbt macro documentation pattern [ASSUMED]; cross-validated against the existing `emit_feature_collection.sql` macro in this project which uses the same `{% macro name(args) %}...{% endmacro %}` skeleton [VERIFIED: file read].

### Pattern 2: Parameterized expression macro (dbt / Jinja2)

**What:** A macro that accepts a table alias argument and renders a SQL expression referencing `{alias}.column_name`. The output column alias is NOT part of the macro — the calling model assigns it with `AS column_name`.

**When to use:** When the same SQL expression fragment appears in multiple models with only the table alias differing.

**Example:**
```sql
{% macro is_plant_taxon(alias) -%}
CASE WHEN {{ alias }}.taxon__iconic_taxon_name = 'Plantae' THEN {{ alias }}.taxon__name ELSE NULL END
{%- endmacro %}
```

**Call site in `int_ecdysis_base.sql`:**
```sql
{{ is_plant_taxon('inat') }} AS inat_host,
```

**Call site in `int_samples_base.sql`:**
```sql
{{ is_plant_taxon('op') }} AS sample_host
```

**Why whitespace matters:** The `-%}` / `{%-` trim markers prevent extra newlines from being
injected into the rendered SQL. Without them, dbt inserts blank lines around macro expansions
which are harmless for DuckDB but produce noisier compiled SQL. Trim markers are optional but
idiomatic. [ASSUMED]

**Source:** dbt Jinja2 macro parameter docs [ASSUMED]; consistent with the emit_feature_collection.sql argument-passing pattern already present in this project [VERIFIED: file read].

### Macro naming convention

The existing macro is named with snake_case verb-noun (`emit_feature_collection`). Consistent
naming for the new macros:

| Macro name | Returns | Rationale |
|------------|---------|-----------|
| `inat_ofv_specimen_count` | `8338` | OFV field ID for specimen count on iNat observations |
| `inat_ofv_sample_id` | `9963` | OFV field ID for sample ID on iNat observations |
| `inat_ofv_catalog_suffix` | `18116` | OFV field ID for Ecdysis catalog suffix on WABA observations |
| `inat_ofv_host_obs_url` | `1718` | OFV field ID for host observation URL on WABA observations |
| `is_plant_taxon` | CASE expression | Returns taxon name when iconic taxon is Plantae |

All five macros can live in a single file `data/dbt/macros/inat_field_ids.sql`.

### Anti-Patterns to Avoid

- **Putting macros in separate files per macro:** dbt allows multiple macros per file; grouping
  all five in one file keeps the domain concept cohesive and reduces file count.
- **Encoding the AS alias inside the macro:** The `is_plant_taxon` macro must not include
  `AS inat_host` or `AS sample_host` — the alias differs per call site and belongs in the model.
- **Using dbt `vars` instead of macros:** dbt project variables (`{{ var('name') }}`) are
  possible for scalar constants but require `vars:` entries in `dbt_project.yml` and a
  different call syntax (`{{ var('name') }}`). The existing project uses macros (not vars)
  and the macro approach is more readable at the call site.
- **Running `dbt compile` instead of `dbt build` to verify:** Compilation only checks Jinja2
  rendering; `dbt build` actually executes the SQL and runs the schema tests. The success
  criterion requires `dbt build` to pass, not just `dbt compile`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Named SQL constants | A Python script that replaces literals at build time | dbt macros | Macros are Jinja2-native; no extra tooling; already how this project handles shared SQL |
| Regression testing | New pytest test that re-executes the JOIN | Existing `test_dbt_diff.py` + `dbt build` | The diff suite already verifies row counts and key-set parity; macro substitution is behavioral-transparent |

---

## Common Pitfalls

### Pitfall 1: dbt macro name collision with built-in dbt macros
**What goes wrong:** dbt ships many built-in macros (e.g., `log`, `run_query`, `ref`, etc.).
If a user-defined macro name shadows a built-in, the behavior is undefined.
**Why it happens:** dbt's macro namespace is flat across project macros and built-ins.
**How to avoid:** The names proposed (`inat_ofv_*`, `is_plant_taxon`) do not conflict with
known dbt built-ins. Verify by running `bash data/dbt/run.sh build` after creating the macro
file — a name collision would surface as a compile error with a descriptive message.
**Warning signs:** `dbt compile` or `dbt build` error citing "macro … is not defined" or
unexpected rendering.

### Pitfall 2: Whitespace injection from macro expansion altering SQL semantics
**What goes wrong:** A macro body that starts or ends with a newline can inject whitespace
into SQL in unexpected places (e.g., inside a string literal or a JOIN condition).
**Why it happens:** Jinja2 preserves the whitespace in the macro body between `%}` and `{%`.
**How to avoid:** Use trim markers (`{%- macro name() -%}` / `{%- endmacro -%}`) or write the
body on a single line. For integer constants this is moot (a bare integer on one line has no
leading/trailing newlines). For `is_plant_taxon`, keep the CASE expression on one line or use
trim markers.
**Warning signs:** `dbt compile` output (in `target/compiled/`) shows unexpected whitespace in
JOIN conditions; this is visible but harmless for DuckDB.

### Pitfall 3: Running `uv run pytest` instead of `bash data/dbt/run.sh build` to verify SQL changes
**What goes wrong:** pytest does not invoke dbt; pytest tests operate against a fixture DB
with raw seed data, not against the compiled dbt models. A macro authoring mistake (e.g.,
wrong integer literal in the macro body) will not be caught by pytest.
**Why it happens:** Easy to reach for the familiar pytest command after editing a `.sql` file.
**How to avoid:** After every SQL edit, run `bash data/dbt/run.sh build` from the repo root.
The guardrail in STATE.md is explicit: "`dbt build` required after ANY `.sql` change under
`data/dbt/` — pytest does not run dbt."
**Warning signs:** dbt test passes but diff test fails on the next `dbt build` run.

### Pitfall 4: Forgetting to run `dbt build` in the correct working directory context
**What goes wrong:** `run.sh` sets `DBT_PROFILES_DIR` and `DBT_PROJECT_DIR` and CDs into
the dbt project dir before invoking dbt. Running `dbt build` directly (without the wrapper)
may pick up the wrong profiles.yml.
**Why it happens:** The wrapper script handles profile discovery; bypassing it breaks the
relative path `path: ../beeatlas.duckdb` in `profiles.yml`.
**How to avoid:** Always invoke via `bash data/dbt/run.sh build`, never `dbt build` directly.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + `bash data/dbt/run.sh build` |
| Config file | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `bash data/dbt/run.sh build` (after any SQL change) |
| Full suite command | `cd data && uv run pytest && bash data/dbt/run.sh build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DBT-01 | All four OFV field IDs referenced via named macros; no anonymous literals in JOIN conditions | static-grep | `grep -rn 'field_id = [0-9]' data/dbt/models/intermediate/` → 0 results | N/A (grep) |
| DBT-01 | `dbt build` compiles and runs with all tests PASS after literal replacement | integration | `bash data/dbt/run.sh build` | ✅ (existing) |
| DBT-01 | Output parity: sandbox diff vs public/data unchanged | integration | `uv run --project data pytest data/tests/test_dbt_diff.py -x` | ✅ (existing) |
| DBT-02 | `CASE WHEN taxon__iconic_taxon_name = 'Plantae'` appears in at most one `.sql` file | static-grep | `grep -rn "iconic_taxon_name" data/dbt/models/` → 1 result | N/A (grep) |
| DBT-02 | `dbt build` passes after CASE expression extraction | integration | `bash data/dbt/run.sh build` | ✅ (existing) |

### Sampling Rate
- **Per SQL edit:** `bash data/dbt/run.sh build` — mandatory per STATE.md guardrail
- **Phase gate:** `bash data/dbt/run.sh build` + `uv run --project data pytest data/tests/test_dbt_diff.py` green before verification

### Wave 0 Gaps
None — existing test infrastructure (dbt build + test_dbt_diff.py) covers all phase requirements. No new test files needed.

---

## Code Examples

### Complete new macro file

```sql
-- data/dbt/macros/inat_field_ids.sql
-- Named constants for iNaturalist observation field value (OFV) field IDs.
-- Replaces anonymous integer literals in intermediate models.
-- See: data/dbt/models/intermediate/int_samples_base.sql, int_waba_link.sql, int_combined.sql

{% macro inat_ofv_specimen_count() %}8338{% endmacro %}
-- field_id = 8338: "Bee Collection: Number of bees collected" — number of specimens in sample

{% macro inat_ofv_sample_id() %}9963{% endmacro %}
-- field_id = 9963: "Bee Collection: Sample ID" — collector's sequential sample number

{% macro inat_ofv_catalog_suffix() %}18116{% endmacro %}
-- field_id = 18116: "Bee Collection: Ecdysis catalog number suffix" — links WABA obs to Ecdysis record

{% macro inat_ofv_host_obs_url() %}1718{% endmacro %}
-- field_id = 1718: "Observation URL" — host plant observation URL on provisional WABA rows

-- Shared CASE expression: returns taxon__name when the observation is a Plantae record,
-- NULL otherwise. Used in int_ecdysis_base.sql and int_samples_base.sql.
-- alias: the SQL table alias for the iNat observations table in the calling model.
{% macro is_plant_taxon(alias) -%}
CASE WHEN {{ alias }}.taxon__iconic_taxon_name = 'Plantae' THEN {{ alias }}.taxon__name ELSE NULL END
{%- endmacro %}
```

### Updated call site: `int_samples_base.sql`

```sql
SELECT
    op.id                                                                       AS observation_id,
    op.user__login                                                              AS host_inat_login,
    CAST(op.observed_on AS VARCHAR)                                             AS sample_date,
    op.observed_on                                                              AS sample_date_raw,
    op.longitude                                                                AS sample_lon,
    op.latitude                                                                 AS sample_lat,
    CAST(sc.value AS INTEGER)                                                   AS specimen_count,
    TRY_CAST(sid.value AS INTEGER)                                              AS sample_id,
    {{ is_plant_taxon('op') }}                                                  AS sample_host
FROM {{ ref('stg_inat__observations') }} op
JOIN {{ ref('stg_inat__ofvs') }} sc
    ON sc._dlt_root_id = op._dlt_id AND sc.field_id = {{ inat_ofv_specimen_count() }} AND sc.value != ''
LEFT JOIN {{ ref('stg_inat__ofvs') }} sid
    ON sid._dlt_root_id = op._dlt_id AND sid.field_id = {{ inat_ofv_sample_id() }}
WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
```

### Updated call site: `int_ecdysis_base.sql` (only the CASE line changes)

```sql
    {{ is_plant_taxon('inat') }}                                               AS inat_host,
```

### Updated call site: `int_waba_link.sql`

```sql
    AND ofv.field_id = {{ inat_ofv_catalog_suffix() }}
```

### Updated call site: `int_combined.sql`

```sql
LEFT JOIN {{ ref('stg_waba__ofvs') }} ofv1718
    ON ofv1718._dlt_root_id = sob.waba_dlt_id AND ofv1718.field_id = {{ inat_ofv_host_obs_url() }}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anonymous integer literals in JOIN conditions | Named macros in `macros/inat_field_ids.sql` | Phase 103 | No semantic change; grep for literals now finds docs/comments only |
| Duplicated CASE expression in two models | Single `is_plant_taxon(alias)` macro | Phase 103 | One authoritative definition; both models consume it |

**No deprecated patterns introduced by this phase** — the change is additive (new macro file)
plus in-place substitution in three existing models.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | dbt macro body consisting of a bare integer literal renders that literal verbatim in SQL (no wrapping, no type coercion) | Code Examples | If dbt adds quotes or coerces to a different type, `field_id = 8338` would break. Mitigated: `dbt build` will immediately surface any mismatch. |
| A2 | Trim markers `{%- -%}` suppress whitespace around the `is_plant_taxon` macro expansion without altering the SQL value | Code Examples | Extra whitespace is harmless for DuckDB; trim markers affect readability of compiled SQL only, not semantics. Risk is LOW. |
| A3 | Multiple macros may coexist in a single `.sql` file in the dbt `macros/` directory | Architecture Patterns | If dbt requires one macro per file, each macro needs its own file. Easily verified by running `dbt build`. Risk is LOW — standard dbt behavior supports multi-macro files. |

---

## Open Questions

1. **Should staging model comments (stg_inat__ofvs.sql, stg_waba__ofvs.sql) be updated to reference the macro names?**
   - What we know: Comments in staging models currently document the field IDs by number only.
   - What's unclear: Whether updating comments to say "see `inat_ofv_specimen_count()` macro" adds value or creates drift risk.
   - Recommendation: Update the staging model comments to reference the macro names; this is a one-line documentation change with no risk.

2. **Is `int_combined.sql` line 2 comment (`-- ARM 2 (provisional WABA via ofv1718)`) a refactor target?**
   - What we know: The comment `ofv1718` is a local alias name, not the integer `1718`. The alias `ofv1718` in the SQL body uses the integer only in the JOIN condition (line 83).
   - What's unclear: Whether to rename the alias from `ofv1718` to `ofv_host_obs_url` for consistency.
   - Recommendation: Keep the alias `ofv1718` — renaming an alias is cosmetic scope creep outside DBT-01/DBT-02. The success criterion targets anonymous SQL JOIN conditions, not alias names. Add a TODO comment if desired.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dbt-core (via uvx) | `bash data/dbt/run.sh build` | ✓ | 1.10.1 | — |
| dbt-duckdb (via uvx) | `bash data/dbt/run.sh build` | ✓ | 1.10.1 | — |
| uv | `run.sh` wrapper | ✓ (system) | — | — |
| Python 3.13 (uvx target) | `run.sh` forces `--python 3.13` | ✓ (uvx provisions) | 3.13 | — |

**Missing dependencies with no fallback:** None.

---

## Security Domain

This phase does not introduce authentication, sessions, access control, cryptography, or
external network calls. The only change is Jinja2 macro authoring in local `.sql` files.
ASVS categories V2–V6 do not apply.

---

## Sources

### Primary (HIGH confidence)
- `data/dbt/macros/emit_feature_collection.sql` — existing macro in project; establishes `{% macro name(args) %}...{% endmacro %}` skeleton and multi-arg calling pattern [VERIFIED: file read]
- `data/dbt/models/intermediate/*.sql` — authoritative source for all literal occurrences and CASE expression locations [VERIFIED: grep]
- `data/dbt/run.sh` — authoritative invocation path; dbt version 1.10.1 confirmed [VERIFIED: bash]
- `.planning/STATE.md` — guardrail: "`dbt build` required after ANY `.sql` change" [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- dbt macro documentation (general Jinja2 macro pattern with `{% macro %}` blocks) [ASSUMED — consistent with observed project usage]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Code inventory (what needs changing): HIGH — all four field ID literals and both CASE expressions located by grep with exact line numbers
- Macro syntax: MEDIUM-HIGH — Jinja2 macro pattern confirmed against existing in-project macro; exact whitespace behavior is ASSUMED but low-risk
- Test coverage: HIGH — existing `dbt build` + `test_dbt_diff.py` fully exercise the affected models; no new tests needed

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (dbt 1.10.1 is pinned; macro syntax is stable)
