---
phase: 43
slug: feed-variants
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-11
---

# Phase 43 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Database values → filesystem paths | Filter values from DuckDB become part of filenames via `_slugify` | Collector names, genus names, county names, ecoregion names (all public) |
| Generated XML → static file serving | Feed XML served as static files on S3/CloudFront | Public occurrence/identification data |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-43-01 | Tampering | `_slugify` → filename | mitigate | `_slugify` strips all non-`[a-z0-9-]` characters via NFKD transliteration + regex; prevents path traversal (`../`, `/`, special chars). Verified by `test_slugify` in `data/tests/test_feeds.py`. | closed |
| T-43-02 | Information Disclosure | Atom feed content | accept | Feed content derived from public occurrence/identification data already served via map UI. Collector names are public. No new PII exposure. | closed |
| T-43-03 | Denial of Service | Large number of variant files | accept | Bounded by distinct values in WA geographies (~39 counties, ~10 ecoregions) and active collectors/genera. File count upper-bounded at thousands of small XML files — no unbounded growth. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-43-01 | T-43-02 | Feed content is a subset of data already publicly accessible via the BeeAtlas map UI. Collector names are explicitly public in the existing determinations feed. No new disclosure surface. | rainhead | 2026-04-11 |
| AR-43-02 | T-43-03 | File count is bounded by WA geography tables (39 counties, ~10 ecoregions) plus active collectors/genera. No unbounded growth vector. All files are small Atom XML. Storage and generation cost is acceptable. | rainhead | 2026-04-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-11 | 3 | 3 | 0 | gsd-secure-phase (inline — threats_open: 0 at classification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-11
