---
phase: 44
slug: pipeline-wiring-and-discovery
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-11
---

# Phase 44 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| nightly.sh → run.py | Shell delegates to Python orchestrator; both run as same user on maderas | Pipeline configuration, env vars (DB_PATH, EXPORT_DIR) — internal only |
| nightly.sh → S3 | Uploads pipeline output to public S3 bucket via AWS CLI with named profile | Feed XML (public determiner names, taxon names, collection dates), parquet, geojson |
| Browser → index.html | Static HTML served to untrusted clients; link tag references static asset | Autodiscovery tag pointing to /data/feeds/determinations.xml (public) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-44-01 | Tampering | nightly.sh | accept | Script runs as cron user on trusted server (maderas); no untrusted input. File permissions restrict write access. | closed |
| T-44-02 | Information Disclosure | S3 feeds upload | accept | Feed XML contains only public data (determiner names, taxon names, collection dates) already visible on the site. No PII beyond what is already public. | closed |
| T-44-03 | Spoofing | index.html link tag | accept | The href is a relative path to a static file on the same origin; no external URL injection vector. Content served over HTTPS via CloudFront. | closed |
| T-44-04 | Denial of Service | s3 sync | accept | Sync is bounded by number of feed files (~200); no user-controlled input affects file count. Runs once nightly. | closed |
| T-44-05 | Elevation of Privilege | run.py delegation | accept | run.py executes the same pipeline steps that were previously inline; no new privilege gained. Runs under same user context. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-44-01 | T-44-01 | Tampering risk accepted: cron job runs under trusted OS user on a controlled server; external write access not possible without prior system compromise | gsd-secure-phase | 2026-04-11 |
| AR-44-02 | T-44-02 | Information disclosure accepted: feed XML is intentionally public — same data visible on the site; no PII exposure | gsd-secure-phase | 2026-04-11 |
| AR-44-03 | T-44-03 | Spoofing accepted: same-origin relative href cannot be injected; HTTPS via CloudFront prevents MitM | gsd-secure-phase | 2026-04-11 |
| AR-44-04 | T-44-04 | DoS accepted: feed file count is pipeline-controlled (~200 files), not user-controlled; nightly cadence limits blast radius | gsd-secure-phase | 2026-04-11 |
| AR-44-05 | T-44-05 | Privilege escalation accepted: delegation to run.py adds no new capabilities — same pipeline steps, same user, same environment | gsd-secure-phase | 2026-04-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-11 | 5 | 5 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-11
