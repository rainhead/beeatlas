---
status: resolved
trigger: "taxon filter autocomplete shows genus name twice — once as 'Bombus (genus)' and once as 'Bombus'"
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:00:00Z
---

## Current Focus

hypothesis: Specimens identified only to genus level have scientificName = bare genus name (e.g. 'Bombus') in the frontend parquet, causing them to appear in both the genus options list (via the genus column) and the species options list (via the scientificName column).
test: Confirmed by querying frontend/public/data/ecdysis.parquet directly.
expecting: N/A — confirmed.
next_action: Return diagnosis to caller.

## Symptoms

expected: Typing "Bombus" shows distinct, clearly labelled options for filtering by the genus vs. by a specific taxon name
actual: Shows "Bombus (genus)" AND "Bombus" as two separate datalist suggestions
errors: No runtime error — cosmetic/UX issue
reproduction: Type "Bombus" in the taxon filter input
started: Always present (data artifact)

## Eliminated

- hypothesis: The species list contains "Bombus sp." which the browser renders without the "sp."
  evidence: frontend/public/data/ecdysis.parquet has scientificName = 'Bombus' (bare), not 'Bombus sp.'
  timestamp: 2026-04-06

## Evidence

- timestamp: 2026-04-06
  checked: frontend/src/bee-map.ts buildTaxaOptions()
  found: Builds three option groups — families (label: "X (family)"), genera (label: "X (genus)"), species (label: raw scientificName value). The species group uses the scientificName field verbatim with no rank annotation.
  implication: If scientificName = 'Bombus', it appears in the species group as just "Bombus".

- timestamp: 2026-04-06
  checked: frontend/public/data/ecdysis.parquet via DuckDB
  found: 244 rows where scientificName = 'Bombus' AND genus = 'Bombus'. These are specimens identified only to genus level. The Ecdysis database stores genus-only IDs as the bare genus name (no "sp." suffix), unlike the data/ecdysis.parquet pipeline which uses 'Bombus sp.'.
  implication: These 244 rows cause 'Bombus' to be added to the species Set in buildTaxaOptions, producing a TaxonOption {label: 'Bombus', name: 'Bombus', rank: 'species'}. Combined with the genus option {label: 'Bombus (genus)', name: 'Bombus', rank: 'genus'}, two entries appear in the datalist.

- timestamp: 2026-04-06
  checked: frontend/src/filter.ts buildFilterSQL()
  found: When rank='species', the SQL clause is `scientificName = 'Bombus'` — correctly matches only genus-named records. When rank='genus', the clause is `genus = 'Bombus'` — matches all Bombus species including the genus-level ones.
  implication: The two options produce genuinely different filter results: "Bombus (genus)" matches all ~2000 Bombus records; "Bombus" matches only the ~244 genus-level-only records.

- timestamp: 2026-04-06
  checked: data/export.py export_ecdysis_parquet()
  found: scientific_name is taken directly from ecdysis_data.occurrences.scientific_name with no transformation. Bare genus names come from the upstream Ecdysis database.
  implication: This is a data source characteristic, not a pipeline bug. Cannot be changed without altering source data or adding a transformation step.

## Resolution

root_cause: Specimens identified only to genus level have scientificName = bare genus name (e.g. 'Bombus') in the frontend parquet (244 Bombus rows, ~75 additional genera). buildTaxaOptions() adds every distinct scientificName to the species Set, so 'Bombus' appears twice in the datalist: once from the genus column (labelled 'Bombus (genus)') and once from the scientificName column (labelled 'Bombus', no rank). The two entries are semantically distinct: the genus entry filters all records where genus='Bombus' (~2000 records); the species entry filters records where scientificName='Bombus' (~244 genus-level-only records).

fix: (diagnosis only — no code changes made)
verification: N/A
files_changed: []
