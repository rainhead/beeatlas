---
phase: 42-feed-generator-core
plan: "01"
asvs_level: 1
audited: "2026-04-09"
threats_total: 4
threats_closed: 4
threats_open: 0
---

# Security Audit — Phase 42: Feed Generator Core

## Result: SECURED

All 4 registered threats are closed. No open threats. No unregistered flags.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-42-01 | Tampering | accept | CLOSED | `data/feeds.py:128` — `duckdb.connect(DB_PATH, read_only=True)`. No write path exists. |
| T-42-02 | Information Disclosure | accept | CLOSED | Ecdysis is a public database; collector names are DarwinCore public record. No PII not already public. |
| T-42-03 | Spoofing (XML injection) | mitigate | CLOSED | `data/feeds.py` — all dynamic values assigned via `.text` (lines 63, 66, 69, 76-79, 99-100, 106) or `.set()` (lines 72, 97, 103-104). `xml.etree.ElementTree` auto-escapes `<`, `>`, `&` in both. No raw string concatenation into XML markup anywhere in the file. Serialization uses `ET.tostring()` on the element tree, not string building. |
| T-42-04 | Denial of Service | accept | CLOSED | Feed generation runs in nightly batch (`run.py` STEPS). No runtime request path. Static file on S3. ~15-20MB file size acceptable for static hosting. |

## Accepted Risks Log

### T-42-01 — Tampering: DB query write risk

**Rationale accepted:** DuckDB is opened `read_only=True` at `data/feeds.py:128`. There is no mechanism for the feed generator to alter database state. Data integrity of `beeatlas.duckdb` is owned by the upstream nightly pipeline, which is out of scope for this phase.

**Residual risk:** Negligible. Read-only connection enforced at the driver level.

### T-42-02 — Information Disclosure: Atom XML content

**Rationale accepted:** All fields written to the Atom feed (taxon name, determiner, collector, collection date, occurrence ID) are present in the public Ecdysis database accessible at `ecdysis.org`. Collector names appear in DarwinCore specimen records that are already public. No internal identifiers, email addresses, or location data beyond what Ecdysis already exposes are included.

**Residual risk:** Negligible. The feed aggregates existing public data into a more convenient format; it does not expose new information.

### T-42-04 — Denial of Service: Large feed size

**Rationale accepted:** The feed is generated once per night by `data/nightly.sh` via `run.py`. There is no HTTP endpoint, no on-demand generation, and no user-triggered compute path. The resulting static file (~15-20MB at 41K entries) is served from S3/CloudFront, where large-file serving is a solved infrastructure concern outside this codebase.

**Residual risk:** Low. A future real-time feed endpoint would require re-evaluation, but no such endpoint exists or is planned in the v2.1 roadmap.

## Unregistered Threat Flags

None. SUMMARY.md `## Threat Flags` explicitly states no new threat surface was detected during implementation.

## Mitigated Threats — Detail

### T-42-03 — XML Injection via taxon/collector names

The declared mitigation — use of `xml.etree.ElementTree` with `.text` assignment, no raw string concatenation — was verified against the full text of `data/feeds.py`.

Verification points:

- `id_el.text`, `title_el.text`, `updated_el.text`, `summary_el.text` — all dynamic DB values set via `.text` attribute (auto-escaped by ElementTree)
- `link_el.set('href', ecdysis_url)` — URL set via `.set()` (auto-escaped by ElementTree)
- `ecdysis_url` is constructed from `ecdysis_id`, an integer column from DuckDB (`o.id`), so injection surface is further reduced to numeric values only
- `ET.tostring(feed, xml_declaration=True, encoding='unicode')` serializes the object tree — no string interpolation into markup at serialization time
- No `ET.fromstring`, `ET.parse`, or any XML parsing of DB-sourced strings occurs

The mitigation is correctly and completely implemented.
