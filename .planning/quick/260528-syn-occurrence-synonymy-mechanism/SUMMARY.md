---
quick_id: 260528-syn
slug: occurrence-synonymy-mechanism
date: 2026-05-28
status: complete
commit: 6e77c98
---

# Summary: Occurrence-Side Synonymy Mechanism

## What Was Done

Added an extensible occurrence-side synonymy registry to the data pipeline.

**New file:** `data/occurrence_synonyms.csv` — CSV with columns `synonym,accepted_name,source`.
First row: `agapostemon texanus,agapostemon subtilior,Portman et al. 2024`.

**Extended:** `data/canonical_name.py` — added `apply_synonym(name)` function backed by
a lazy-loaded `_SYNONYMS` dict. Applies post-canonicalization: `apply_synonym(canonicalize(x))`.
Module-level `OCCURRENCE_SYNONYMS_PATH` is patchable in tests.

**Updated:** `checklist_pipeline._update_occurrences_canonical_name()` and
`inat_obs_pipeline.load_inat_obs()` — both now apply `apply_synonym()` after `canonicalize()`,
so the mapping covers all occurrence sources uniformly.

**Tests:** 5 new tests in `test_canonical_name.py` — unit tests with monkeypatched `_SYNONYMS`,
None passthrough, CSV integration test, and composed `apply_synonym(canonicalize(...))` test.

## To Add Future Synonyms

Add a row to `data/occurrence_synonyms.csv`:
```
synonym_canonical,accepted_canonical,Citation Author Year
```
Both names must be in canonical form (lowercase, D-04 applied). No code changes needed.
