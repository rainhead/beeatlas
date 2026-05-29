---
quick_id: 260528-syn
slug: occurrence-synonymy-mechanism
date: 2026-05-28
description: Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024)
---

# Quick Task 260528-syn: Occurrence-Side Synonymy Mechanism

## Goal

Create an extensible registry for taxon synonymies applied uniformly to all occurrence
record sources (Ecdysis + iNat obs). Seed with the Agapostemon texanus → subtilior
mapping from Portman et al. 2024.

## Tasks

### Task 1: Create occurrence_synonyms.csv
- **File:** `data/occurrence_synonyms.csv`
- **Action:** New CSV with header `synonym,accepted_name,source`; add Agapostemon row
- **Done:** canonical lowercase names; source citation included

### Task 2: Extend canonical_name.py with apply_synonym()
- **File:** `data/canonical_name.py`
- **Action:** Add lazy-loaded `_SYNONYMS` dict, `_ensure_synonyms()` loader, `apply_synonym(name)`
- **Done:** function returns accepted name for known synonyms, else name unchanged; None passthrough

### Task 3: Apply synonymy in both pipelines
- **Files:** `data/checklist_pipeline.py`, `data/inat_obs_pipeline.py`
- **Action:** Import `apply_synonym`; wrap `canonicalize()` calls with `apply_synonym(canonicalize(x))`
- **Done:** both occurrence sources apply synonymy post-canonicalization

### Task 4: Add tests
- **File:** `data/tests/test_canonical_name.py`
- **Action:** Tests for apply_synonym: known mapping, passthrough, None, CSV integration, composed with canonicalize
- **Done:** 5 new tests all pass; full pipeline tests unaffected
