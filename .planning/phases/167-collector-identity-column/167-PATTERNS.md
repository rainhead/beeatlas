# Phase 167: Collector Identity Column - Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 3 (modified only — no new files)
**Analogs found:** 3 / 3

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_combined.sql` | dbt intermediate model | transform | existing COALESCE columns in same file (e.g. `canonical_name`, `taxon_id`) | exact |
| `data/dbt/models/marts/occurrences.sql` | dbt mart model | transform | existing `j.*` projections in same file (lines 74–91) | exact |
| `data/dbt/models/marts/schema.yml` | dbt contract + data tests | config | existing `taxon_id` not_null test with severity/where (lines 81–91) | exact |

---

## Pattern Assignments

### `data/dbt/models/intermediate/int_combined.sql` (dbt intermediate, transform)

**Analog:** existing COALESCE columns in the same file — `canonical_name` (line 48) and `taxon_id` (line 49) — ARM 1 (`ecdysis`), illustrating the positional convention: derived/COALESCE columns appear after the raw source fields and before `'ecdysis' AS source`.

**Core COALESCE pattern** (lines 48–54, ARM 1 as reference):
```sql
COALESCE(syn_e.accepted_name, e.canonical_name) AS canonical_name,
COALESCE(ctt.taxon_id, g_e.taxon_id)::INTEGER  AS taxon_id,
NULL                                            AS image_url,
NULL                                            AS obs_url,
NULL                                            AS user_login,
NULL                                            AS license,
'ecdysis'                                       AS source,
```

**New column to add — identical expression in all 5 arms (last field before `AS source`):**
```sql
COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login,
```

Per-arm source fields (from RESEARCH.md §Exact Mechanics §3):

| ARM | Line(s) for 3 inputs | `specimen_inat_login` | `host_inat_login` | `user_login` |
|-----|----------------------|-----------------------|-------------------|-------------|
| ARM 1 `ecdysis` | 44, 40, 52 | `sob.specimen_inat_login` | `s.host_inat_login` | `NULL AS user_login` |
| ARM 2 `waba_sample` | ~102, ~98, ~110 | `NULL AS specimen_inat_login` | `obs.user__login AS host_inat_login` | `NULL AS user_login` |
| ARM 3 `waba_specimen` | ~151, ~147, ~165 | `sob.specimen_inat_login` | `NULL AS host_inat_login` | `NULL AS user_login` |
| ARM 4 `inat_obs` | ~236, ~233, ~244 | `NULL AS specimen_inat_login` | `NULL AS host_inat_login` | `io.user_login` |
| ARM 5 `checklist` | ~297, ~293, ~305 | `NULL::VARCHAR AS specimen_inat_login` | `NULL::VARCHAR AS host_inat_login` | `NULL::VARCHAR AS user_login` |

In every arm the COALESCE references the bare alias names (not the `alias.field` form used in upstream CTEs), because by the time the SELECT list runs, the aliases have already resolved. Follow the same convention.

---

### `data/dbt/models/marts/occurrences.sql` (dbt mart, transform)

**Analog:** the existing final SELECT column list (lines 74–91). Every int_combined column is projected as `j.<column_name>`. The last explicit column before the JOIN clauses is `j.collapsed_count` (line 91).

**Existing final SELECT tail** (lines 85–92):
```sql
    j.canonical_name,
    j.taxon_id,
    j.source, j.image_url, j.obs_url, j.user_login, j.license,
    fc.county, fe.ecoregion_l3,
    j.checklist_id,
    j.verbatim_name,
    j.locality,
    j.collapsed_count
FROM joined j
```

**New projection to append — after `j.collapsed_count`, before `FROM`:**
```sql
    j.collapsed_count,
    j.collector_inat_login
FROM joined j
```

Position here must match the position in schema.yml (37th column, appended last). This satisfies the `test_occurrences_schema_matches` ordered-column-list check in `data/tests/test_dbt_diff.py`.

Note: `j.specimen_inat_login` is NOT and must NOT be added here. It exists in int_combined as a COALESCE input but is intentionally absent from the mart SELECT (confirmed: no match in file). Only `collector_inat_login` is projected.

---

### `data/dbt/models/marts/schema.yml` (dbt contract + data tests, config)

**Analog:** the `taxon_id` column entry with a severity-scoped `not_null` test (lines 79–91). This is the only existing example of a `not_null` generic test with `config: where: / severity:` in the repo.

**Existing pattern to copy** (lines 79–91):
```yaml
      - name: taxon_id
        data_type: integer
        data_tests:
          # ... comment ...
          - not_null:
              config:
                severity: warn
                where: "canonical_name is not null and canonical_name <> '' and canonical_name not in ('anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae')"
```

**New entry to append after the `taxon_id` block (at line 92, before `- name: occurrence_places`):**
```yaml
      - name: collector_inat_login
        data_type: varchar
        data_tests:
          # D-05 (Phase 167): WABA-named arms are small and provably 100% resolved;
          # a NULL here is a join regression. Hard-error to block nightly.
          - not_null:
              config:
                severity: error
                where: "source in ('waba_sample', 'waba_specimen')"
          # D-06 (Phase 167): ecdysis has ~2,767 unresolvable NULLs (no matched iNat obs).
          # Warn-only; surfaces drift count each build without blocking nightly.
          # Baseline 2026-06-24: 2,767 of 48,801 ecdysis rows. Warn count = current drift.
          - not_null:
              config:
                severity: warn
                where: "source = 'ecdysis'"
```

**Critical D-06 predicate note:** The `where` clause must be `source = 'ecdysis'` only — NOT `source = 'ecdysis' and collector_inat_login is null`. Adding the null check creates a tautology (all tested rows trivially fail; the count is meaningless as a drift signal). The correct form lets dbt count the NULLs itself among all ecdysis rows.

**Contract bump:** The `columns:` block for `occurrences` goes from 36 to 37 entries. The existing contract header (`enforced: true`) is unchanged. Position of the new entry in schema.yml must mirror its position in the occurrences.sql SELECT (both appended last) to satisfy the ordered-list parity check.

---

## Shared Patterns

### COALESCE derivation in UNION ALL arms
**Source:** `data/dbt/models/intermediate/int_combined.sql` lines 48–49 (canonical_name, taxon_id)
**Apply to:** all 5 UNION ALL arms when adding `collector_inat_login`

The pattern is: add the derived column using bare field names (aliases already resolved at SELECT time), maintain identical column name and position across all arms so the UNION ALL typechecks. NULL-typed arms use `NULL` or `NULL::VARCHAR` as needed for the inputs; the COALESCE expression itself is always the same string.

### dbt `not_null` with severity + where scoping
**Source:** `data/dbt/models/marts/schema.yml` lines 88–91 (taxon_id test)
**Apply to:** `collector_inat_login` D-05 (severity: error) and D-06 (severity: warn)

The `where:` clause restricts which rows the test inspects. `not_null` then fails on any tested row that is NULL. Use `where: "source in ('waba_sample', 'waba_specimen')"` (D-05) and `where: "source = 'ecdysis'"` (D-06).

---

## No Analog Found

None — all three modified files have exact in-file analogs.

---

## Metadata

**Analog search scope:** `data/dbt/models/intermediate/`, `data/dbt/models/marts/`
**Files scanned:** 3 source files read directly
**Pattern extraction date:** 2026-06-24
