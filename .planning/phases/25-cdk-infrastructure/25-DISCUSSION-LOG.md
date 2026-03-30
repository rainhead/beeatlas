# Phase 25: CDK Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-27
**Mode:** Interactive discuss-phase

---

## Areas Discussed

### S3 data bucket
**Q:** Where should Lambda write the exported Parquet and GeoJSON files?
**Options:** Same bucket /data/ prefix | Separate dataBucket
**Selected:** Same bucket, /data/ prefix
**Notes:** Simpler — one bucket, one CloudFront distribution; Lambda role scoped to /data/ prefix only.

---

### NAT Gateway cost / Architecture pivot
**Q:** How should Lambda get internet access for Ecdysis/iNat API calls?
**Selected (free text):** Skip EFS entirely — keep DuckDB in S3 and download on demand
**Notes:** User changed mind during NAT Gateway cost discussion. Dropping EFS + VPC simplifies architecture significantly. Lambda downloads beeatlas.duckdb from S3 to /tmp on each invocation.

---

### S3 DuckDB location
**Q:** Where in S3 should beeatlas.duckdb live?
**Options:** Same siteBucket /db/ prefix | Separate private bucket
**Selected:** Same siteBucket, /db/ prefix
**Notes:** No extra bucket; Lambda role scoped to /db/* only.

---

### Lambda stub design
**Q:** What should the Lambda stub do to prove the architecture works?
**Options:** S3 round-trip | Minimal echo
**Selected:** S3 round-trip
**Notes:** Downloads beeatlas.duckdb from S3 (graceful miss), writes to /tmp, uploads back. Proves IAM + S3 connectivity end-to-end.

---

### Dockerfile placement
**Q:** Where should the Dockerfile for the Lambda image live?
**Options:** data/ | infra/docker/
**Selected:** data/
**Notes:** Natural location — Lambda image contains the Python pipeline code; CDK uses fromImageAsset('data/').

---

## Post-discussion note

User flagged that dropping EFS requires replanning the milestone. REQUIREMENTS.md (LAMBDA-01, LAMBDA-02, LAMBDA-03) and ROADMAP.md success criteria need updating before planning Phase 25.
