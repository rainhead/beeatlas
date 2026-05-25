# Requirements: Washington Bee Atlas v4.1

**Defined:** 2026-05-25
**Core Value:** Tighten learning cycles for volunteer collectors; convey liveness and togetherness among participants.

## v4.1 Requirements

### Validation Gaps (Nyquist)

- [ ] **VAL-01**: Phase 89 has a complete, passing VALIDATION.md (`nyquist_compliant: true`) retroactively written
- [ ] **VAL-02**: Phase 90 VALIDATION.md updated to `nyquist_compliant: true` (currently false)
- [ ] **VAL-03**: Phase 91 has a VALIDATION.md created and passing
- [ ] **VAL-04**: Phases 89–91 SUMMARY.md frontmatter each include the `requirements-completed` field listing covered SEL-* requirements
- [ ] **VAL-05**: Phase 97 has a complete, passing VALIDATION.md
- [ ] **VAL-06**: Phase 98 has a complete, passing VALIDATION.md; Wave 0 RED tests written retroactively
- [ ] **VAL-07**: Phase 100 has a complete, passing VALIDATION.md
- [ ] **VAL-08**: Phase 98 VERIFICATION.md exists (code verified via SUMMARY + code inspection)
- [ ] **VAL-09**: Phase 112 VERIFICATION.md exists documenting UAT as the verification gate

### Code Quality

- [ ] **CODE-01**: `places_validation.py` raises a clear error if any permit record is missing `issuing_authority` or `type` (PLC-02 runtime enforcement)
- [ ] **CODE-02**: `run.py` module docstring accurately lists all pipeline steps including `places-load`, `places-export`, `places-maps`, `topology-postprocess`
- [ ] **CODE-03**: `uv run pytest` on `data/` exits 0 — the 3 pre-existing `test_dbt_diff.py` failures resolved

## Future Requirements

- **TAB-01**: Determinations for my specimens listed by recency (requires iNat determination data in pipeline)
- **TAB-02**: Specimens by named land owner / last season (requires land ownership data source)
- **TAB-03**: Common floral hosts by month and region (requires cross-table aggregation)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Runtime TAX-04/CHECK-03 S3 verification | Fires on first nightly cron on maderas; no code change needed, deferred |
| `speicmenLayer` typo fix | Intentionally deferred per CLAUDE.md |
| dlt pipeline write-path tests | Deferred from v1.7; not blocking |
| EPA L3 ecoregion CRS risk | Latent risk in future shapefile ingestion; no current code broken |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAL-01..04 | Phase 114 | Pending |
| VAL-05..08 | Phase 115 | Pending |
| VAL-09 | Phase 115 | Pending |
| CODE-01 | Phase 116 | Pending |
| CODE-02 | Phase 116 | Pending |
| CODE-03 | Phase 116 | Pending |

**Coverage:**
- v4.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-25*
*Last updated: 2026-05-25 after v4.1 milestone start*
