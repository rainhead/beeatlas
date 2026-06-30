---
quick_id: 260629-tqw
title: "Count all checklist records (incl. non-georeferenced) for attribution + suppress contradictory '0 checklist records' line"
status: ready
created: 2026-06-30
area: data pipeline (dbt + export) + species templates
resolves_todo: .planning/todos/pending/checklist-count-zero-but-on-checklist.md
decisions:
  - "Operator chose the deeper DATA fix AND the display fallback (Both)."
  - "New column checklist_record_count = ALL checklist records for a species, every coord_flag, synonym-resolved. Distinct from checklist_count (georeferenced point records that must equal occurrences.parquet — kept unchanged)."
  - "Source the new count from the RAW source('checklist_data','checklist_records_full'), NOT stg_checklist__records_full (which filters coord_flag='valid' AND re-reads ../raw/taxa.csv.gz, absent locally)."
  - "Display: show the new total count; when it is still 0 for a listed species, fall back to 'Listed on the WA Bee Atlas checklist' (detail) / 'On checklist' (compact genus/subgenus spans) instead of '0 checklist records'."
  - "_data/species.js genus-tile gating stays on checklist_count (georeferenced) — gating is intentionally separate from display; out of scope."
---

## Goal

Remove the self-contradictory "0 checklist records · Bartholomew et al. 2024" line on
species pages for the 40 species that are on the published checklist but report 0
georeferenced point records.

Validated blast radius (against current `public/data/species.json` + live DB):
- 40 species render the bare line (on_checklist, checklist_count=0, occurrence_count=0).
- **27** have non-georeferenced raw records in `checklist_data.checklist_records_full`
  → the new `checklist_record_count` gives them a real count (e.g. Nomada aldrichi = 1, one `null_coord` record).
- **13** have zero raw records of any kind (pure list memberships, e.g. andrena cyanura,
  bombus lapponicus, megachile cleomis) → new count is still 0 → the display fallback covers them.

## Task 1 — Data: add `checklist_record_count` to the species universe + mart + contract + export

**files:**
- `data/dbt/models/intermediate/int_species_universe.sql`
- `data/dbt/models/marts/species.sql`
- `data/dbt/models/marts/schema.yml`
- `data/species_export.py`

**action:**

1. `int_species_universe.sql` — add a new CTE alongside `checklist_count_agg` (after it, ~line 57):
   ```sql
   checklist_record_count_agg AS (
       -- Total checklist records per species INCLUDING non-georeferenced ones
       -- (every coord_flag), for the species-page attribution count. Distinct from
       -- checklist_count_agg above, which counts only coord-bearing point records that
       -- flow into occurrences.parquet. Reads the RAW source (not
       -- stg_checklist__records_full) so it bypasses that model's coord_flag='valid'
       -- filter and its ../raw/taxa.csv.gz genus-bridge dependency. Synonym-resolved
       -- (int_synonyms) like the other checklist aggs so listed records keyed under a
       -- synonym merge under the accepted canonical_name.
       SELECT
           COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name,
           COUNT(*) AS checklist_record_count
       FROM {{ source('checklist_data', 'checklist_records_full') }} cr
       LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = cr.canonical_name
       WHERE cr.canonical_name IS NOT NULL
       GROUP BY 1
   ),
   ```
   In the `species_universe` SELECT, add (right after the `checklist_count` line ~132):
   ```sql
           COALESCE(crca.checklist_record_count, 0)::BIGINT AS checklist_record_count,
   ```
   And add the join next to `checklist_count_agg cca`:
   ```sql
       LEFT JOIN checklist_record_count_agg crca
           ON crca.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
   ```

2. `marts/species.sql` — add `checklist_record_count,` to the passthrough SELECT
   (right after `checklist_count,`). Update the header comment: 21→22 SQL columns,
   "21 SQL columns + 1 Python-added slug = 22 final columns" → "22 + 1 = 23".

3. `marts/schema.yml` — in the `species` mart `columns:` list, add right after the
   `checklist_count` entry (~line 200):
   ```yaml
         - name: checklist_record_count
           data_type: bigint
   ```

4. `species_export.py`:
   - Add `'checklist_record_count'` to `SPECIES_COLUMNS` immediately after
     `'checklist_count'` (keep `'slug'` last — the read query uses `SPECIES_COLUMNS[:-1]`).
   - Add `('checklist_record_count', pa.int64()),` to the pyarrow `schema` immediately
     after the `checklist_count` entry.
   - Bump the column-count comments: line ~51 "22 columns" → "23 columns"; docstring
     "22 cols" → "23 cols" and "21-col"/"21 cols" mart references → "22-col"/"22 cols".

**verify:**
- `cd data && bash data/dbt/dbt/run.sh ...` is NOT reliable locally (Ecdysis auth gate +
  stg_checklist__records_full reads ../raw/taxa.csv.gz). Instead validate the new CTE logic
  directly against the live DB source table (read-only):
  ```bash
  cd data && uv run python -c "
  import duckdb; con=duckdb.connect('beeatlas.duckdb', read_only=True)
  print('nomada aldrichi all-records:', con.sql(\"select count(*) from checklist_data.checklist_records_full where canonical_name='nomada aldrichi'\").fetchall())
  print('total grouped species:', con.sql('select count(distinct canonical_name) from checklist_data.checklist_records_full').fetchall())
  "
  ```
  Expect nomada aldrichi = 1.
- `cd data && uv run dbt parse` (or `compile`) succeeds — proves the new SQL + contract parse.
  If a full warehouse is unavailable, at minimum `dbt parse` must pass with no contract errors.
- `cd data && uv run pytest -m "not integration"` stays green (no unit regressions).

**done:** `checklist_record_count` is an emitted bigint column on the species mart, declared
in the enforced contract, present in `SPECIES_COLUMNS` + pyarrow schema, and the new CTE
parses. Nomada aldrichi's raw count is confirmed = 1.

## Task 2 — Display: use the total count + suppress the contradiction

**files:**
- `_pages/species-detail.njk`
- `_pages/genus.njk`
- `_pages/subgenus.njk`

**action:**

1. `species-detail.njk` (the `{%- if sp.on_checklist -%}` block, ~lines 21-23):
   ```njk
         {%- if sp.on_checklist -%}
         {%- if sp.checklist_record_count > 0 -%}
         <p class="checklist-attribution">{{ sp.checklist_record_count | quantify("checklist record") }} · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a></p>
         {%- else -%}
         <p class="checklist-attribution">Listed on the WA Bee Atlas checklist · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a></p>
         {%- endif -%}
         {%- endif -%}
   ```

2. `genus.njk` (3 identical `{%- elif sp.on_checklist -%}` count spans, ~lines 47, 75, 103)
   and `subgenus.njk` (1 span, ~line 41): replace each
   `<span class="count">{{ sp.checklist_count | quantify("checklist record") }}</span>`
   with:
   ```njk
   <span class="count">{%- if sp.checklist_record_count > 0 -%}{{ sp.checklist_record_count | quantify("checklist record") }}{%- else -%}On checklist{%- endif -%}</span>
   ```

**verify:**
- `npm test` passes.
- Grep confirms no display usage of `checklist_count` remains in the three templates
  (only the new `checklist_record_count`): `grep -n checklist_count _pages/{species-detail,genus,subgenus}.njk` returns nothing.

**done:** No species template renders "0 checklist records". Listed species with records show
the true total; listed species with zero records show "Listed on the WA Bee Atlas checklist"
(detail) / "On checklist" (compact).

## Notes
- `checklist_count` (georeferenced) is unchanged everywhere it is used for data/gating
  (occurrences.parquet agreement, `_data/species.js` genus-tile gating, the UIX-04 test).
- The existing integration test `data/tests/test_species_checklist_count.py` (checklist_count =
  dedup count) remains valid and unchanged.
