---
phase: 175-floral-host-provenance
reviewed: 2026-06-30T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - .github/workflows/deploy.yml
  - _data/species_hosts.js
  - _pages/species-detail.njk
  - data/dbt/models/intermediate/int_species_host_plants.sql
  - data/dbt/models/sources.yml
  - data/dbt/models/staging/stg_inat__host_plant_lineage.sql
  - data/host_plant_lineage.py
  - data/nightly.sh
  - data/run.py
  - data/species_export.py
  - data/tests/test_host_plant_lineage.py
  - data/tests/test_species_hosts_export.py
  - src/styles/taxon-pages.css
  - src/tests/data-species_hosts.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: resolved
resolution:
  resolved_in: 31f41296
  warnings_fixed: [WR-01, WR-02, WR-03]
  info_deferred: [INFO-01 dangling-middot, INFO-02 docstring-count]
  note: "All 3 warnings fixed in commit 31f41296 (genus rank-guard, deterministic list order + tiebreaker test, deploy.yml absence guard). 2 info items deferred as cosmetic."
---

# Phase 175: Code Review Report

**Reviewed:** 2026-06-30
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 175 adds a floral-host provenance feature: a plant-lineage pipeline step, a
private dbt intermediate, a `species_hosts.json` sidecar, an Eleventy loader, a
"Collected from" render block, and the nightly/deploy release wiring.

The XSS focus area is **clean** — host family/genus names render through plain
`{{ }}` interpolation with no `dump`/`safe` filter, so Nunjucks autoescape applies.
The absence-tolerance focus area is **clean** — `_data/species_hosts.js` returns
`{}` on a missing or malformed file. The dbt mart contract invariant is respected:
the new model is an `intermediate` external materialization, and only a source-table
entry was added to `sources.yml`; no `marts/*.yml` was touched. canonical_name casing
matches (both arms are lowercase), so the njk lookup resolves.

Three substantive issues remain: a genus-fallback that mislabels higher-rank hosts,
a missing deterministic sort tiebreaker that undermines the byte-stable idempotency
the nightly diff gate relies on, and a non-absence-tolerant fetch in `deploy.yml`
that can red the build in the data-before-code window.

## Warnings

### WR-01: Genus fallback fabricates a bogus genus for higher-rank (family/tribe/subfamily) hosts

**File:** `data/dbt/models/intermediate/int_species_host_plants.sql:33`
**Issue:** The genus expression is
`COALESCE(tle.genus, split_part(obs.taxon__name, ' ', 1))`. The lineage walk only
populates `tle.genus` for species- and genus-rank hosts. For the documented
"long tail of family/tribe/etc." hosts (CONTEXT §Data Findings), `tle.genus` is NULL
and the fallback takes the first token of the higher taxon's own name. A family-rank
host (`taxon__name = 'Asteraceae'`) yields `genus = 'Asteraceae'`; a tribe-rank host
(`'Cardueae'`) yields `genus = 'Cardueae'`. The "Collected from" block then renders a
nonsense pseudo-genus, e.g. `Asteraceae · Asteraceae, Solidago, Cirsium`. Sample
counts stay correct (each host observation still maps to one pair), but the displayed
genus list is wrong for every higher-rank host.
**Fix:** Only apply the split_part fallback when the host is at species/genus rank; for
coarser ranks leave genus NULL (the njk already skips null-genus rows):
```sql
COALESCE(
    tle.genus,
    CASE WHEN obs.taxon__rank IN ('species', 'genus')
         THEN split_part(obs.taxon__name, ' ', 1)
    END
) AS genus
```

### WR-02: Missing deterministic tiebreaker breaks the byte-stable idempotency the diff gate depends on

**File:** `data/dbt/models/intermediate/int_species_host_plants.sql:48` (and `data/species_export.py:425`)
**Issue:** Both the model `ORDER BY canonical_name, sample_count DESC` and the export
read `ORDER BY canonical_name, sample_count DESC` lack a tiebreaker for rows that
share a `sample_count`. `json.dumps(sort_keys=True)` sorts dict keys but NOT the
`families`/`genera` **lists** — their order is the DuckDB row order, and Python's sort
in `species_export.py` is stable so it preserves that order for ties. With no
deterministic secondary key, equal-count families/genera can be emitted in a different
order across two dbt builds, so `species_hosts.json` is not guaranteed byte-stable.
The plan explicitly required idempotency "for the nightly diff gate"; the in-process
idempotency test (`test_idempotent_write`) passes but cannot catch this cross-build
churn. Result: spurious daily diffs (and a published file that flaps) once ties exist.
**Fix:** Add a stable secondary key in both places, e.g. model
`ORDER BY canonical_name, sample_count DESC, family, genus` and export
`ORDER BY canonical_name, sample_count DESC, family, genus`; and break ties in the
Python family sort (`key=lambda f: (-f["sample_count"], f["family"])`).

### WR-03: deploy.yml species_hosts fetch is not absence-tolerant — reds the build before the first nightly republish

**File:** `.github/workflows/deploy.yml:59-60`
**Issue:** `SPECIES_HOSTS_FILE=$(jq -r .species_hosts /tmp/manifest.json)` returns the
string `null` when the live manifest predates the nightly.sh change, and the
unconditional `aws s3 cp s3://.../data/null public/data/species_hosts.json` then fails
under `set -e`, failing the build. The plan's clean-checkout gate
(`rm -f public/data/species_hosts.json && npm run build`) only exercises the *loader's*
absence tolerance — it does not cover this fetch-step failure mode. Every push in the
up-to-24h window between code merge and the next nightly publish would red CI and block
all deploys. (This matches the pre-existing higher_taxa/collectors fetch pattern, so it
is release-sequencing fragility rather than a regression, but it is newly introduced
surface and is cheaply guarded.)
**Fix:** Guard the copy so the build degrades to the empty-object loader path:
```bash
SPECIES_HOSTS_FILE=$(jq -r .species_hosts /tmp/manifest.json)
if [ "$SPECIES_HOSTS_FILE" != "null" ] && [ -n "$SPECIES_HOSTS_FILE" ]; then
  aws s3 cp s3://${{ vars.S3_BUCKET_NAME }}/data/$SPECIES_HOSTS_FILE public/data/species_hosts.json
fi
```
Alternatively, enforce a data-before-code publish (nightly republishes the manifest
with the species_hosts key before the code lands), per
[[project_occurrences_contract_release_sequence]].

## Info

### IN-01: Family with only null-genus rows renders a trailing "· "

**File:** `_pages/species-detail.njk:66`
**Issue:** `{{ fam.family }} · {% for g in fam.genera %}…{% endfor %}` always emits the
middot separator even when `fam.genera` is empty, producing `Family · ` with a dangling
separator. This is rare in practice (WR-01's fallback usually fills genus), but a family
whose host observations all have a NULL `taxon__name` would hit it.
**Fix:** Only render the separator and genera when `fam.genera` is non-empty, e.g. wrap
the `· …` tail in `{%- if fam.genera and fam.genera.length > 0 -%}`.

### IN-02: species_export docstrings drifted on artifact count/order

**File:** `data/species_export.py:6` and `:186,:196`
**Issue:** The module docstring's prose says it "emits seven artifacts" but the bullet
list enumerates six; `export_species_parquet`'s one-line docstring (line 186) still reads
"…+ photos.json + higher_taxa.json" and omits species_hosts.json, while the longer
docstring (line 198) lists it. Purely documentation drift — no behavioral impact.
**Fix:** Reconcile the count and include `species_hosts.json` consistently in all three
docstrings.

---

_Reviewed: 2026-06-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
