---
phase: 56
slug: export-integration
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-15
---

# Phase 56 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DEM file → export.py | Raster data read from local filesystem; values used as elevation | Integer elevation meters (public geographic data) |
| DuckDB → parquet files | Existing boundary; no new trust issues introduced | Specimen/sample records with elevation appended |
| dem_fixture → test assertions | Synthetic test data; no deployment surface | Test-only; no production data |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-56-01 | Tampering | _dem_cache/wa_3dep_10m.tif | accept | DEM is downloaded from USGS; nightly pipeline runs on trusted maderas host; no user-supplied input path | closed |
| T-56-02 | Information Disclosure | elevation_m column | accept | Elevation is public geographic data derived from public USGS DEM; no PII | closed |
| T-56-03 | Denial of Service | pyarrow read/write of large parquet | accept | Pipeline runs on dedicated host with sufficient memory; not user-facing | closed |
| T-56-04 | Tampering | test_export.py | accept | Test code; not deployed; runs in CI only | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-56-01 | T-56-01 | DEM sourced from USGS 3DEP (authoritative public dataset); pipeline host (maderas) is trusted infrastructure with no external write access; no user-controlled path or content | gsd-security-auditor | 2026-04-15 |
| R-56-02 | T-56-02 | Elevation data is derived from public USGS DEM and contains no PII; already publicly available via mapping services | gsd-security-auditor | 2026-04-15 |
| R-56-03 | T-56-03 | Parquet read/write via pyarrow is a bounded operation on fixed-size pipeline outputs; pipeline is internal cron job on dedicated host, not exposed to untrusted input | gsd-security-auditor | 2026-04-15 |
| R-56-04 | T-56-04 | Test code only; not deployed to production; runs in isolated CI environment | gsd-security-auditor | 2026-04-15 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-15 | 4 | 4 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-15
