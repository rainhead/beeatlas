---
phase: 127
slug: inactive-taxon-remapping
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-31
---

# Phase 127 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Scope: 127-01 (Python inactive-taxon safety net) + 127-02 (dbt synonym application layer).
> Register authored at plan time (both PLAN.md files carry a `<threat_model>` block) — this
> audit **verifies mitigations exist**; it does not retroactively build a STRIDE register.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| iNat API → Python | `GET /v1/taxa/{id}` returns `current_synonymous_taxon_ids` + successor records | Untrusted external JSON flowing into a SQL UPSERT and a CSV seed |
| taxa.csv.gz → Python | Monthly iNat open-data dump (gitignored, S3-synced) — successor-name lookup source | Untrusted text → auto_synonyms.csv |
| inactive_unresolved.csv → gate | The gate's authority to block the build depends on this file being authored only by `generate_inactive_remaps()` | Triage rows (build-blocking signal) |
| auto_synonyms.csv → dbt seed | Gitignored, nightly-overwritten CSV; loaded as a dbt seed, UNIONed into the synonym JOIN path | Synonym names → COALESCE rewrites of canonical_name across all occurrence sources |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-127-01 | Tampering | iNat successor name → bridge UPSERT / auto_synonyms.csv | mitigate | Parameterized `?` placeholders (`resolve_taxon_ids.py:226-237`); `csv.writer`/`DictWriter` escaping (lines 253, 259); `lower().strip()` normalization (line 203) | closed |
| T-127-02 | Tampering | Malformed `/v1/taxa/{id}` response shape | mitigate | `.get("results", [])` + empty-results guard (lines 165-166); `or []` normalization (line 183); `except requests.HTTPError` → transient skip, non-blocking (line 147, CR-01) | closed |
| T-127-03 | Elevation of Privilege (bypass) | inactive-gate silently bypassed | mitigate | `check_inactive_gate()` `sys.exit` on any row, no exclusion set (`resolve_taxon_ids.py:274-303`); both CSVs opened `"w"` unconditionally (lines 252, 257); gate STEP precedes `dbt-build` (`run.py:95-98`) | closed |
| T-127-04 | Denial of Service | iNat rate-limit / hang on per-inactive fetch | accept | `_inat_get_with_retry` + `timeout=30` (lines 142-146); `_INAT_PACE_SECONDS` (line 140); WR-05 caps `_INACTIVE_REMAP_MAX_TAXA=500` (line 30) + circuit-breaker (line 31); 0 inactive taxa today | closed |
| T-127-05 | Tampering | SQL injection via `taxa_path` f-string in `read_csv` | accept | `taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")` (line 101) — pure code-derived path, no user/API/env input reaches the f-string | closed |
| T-127-06 | Tampering | CSV-injection via auto_synonyms.csv field content | mitigate | Seed `+column_types: varchar` (`dbt_project.yml:29-33`); parameterless `ref()` JOINs (`int_synonyms.sql:10-15`); WR-03 `_csv_safe()` formula-injection sanitizer (`resolve_taxon_ids.py:46-57`) applied to both curator CSVs (lines 255, 262) | closed |
| T-127-07 | Spoofing/Integrity | auto entry overriding a curated manual decision | mitigate | `int_synonyms` anti-join `WHERE m.synonym IS NULL` (`int_synonyms.sql:14-15`); all 4 consumer sites use `ref('int_synonyms')`; agapostemon texanus regression anchor green | closed |
| T-127-08 | Denial of Service | empty/header-only seed breaks dbt build | accept | D-04 committed header-only placeholder + `+column_types: varchar`; `dbt run.sh build` exits 0 (`INSERT 0`, PASS=57); LEFT JOIN falls through to COALESCE | closed |
| T-127-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages; `data/pyproject.toml` unchanged in phase; no install tasks in either plan | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Verification Notes

- **T-127-06 strengthened beyond plan.** Original mitigation relied on dbt's varchar typing making seed values inert data. Code review (WR-03) added an explicit `_csv_safe()` sanitizer that prefixes `'` to any field starting with `= + - @`, neutralizing spreadsheet formula injection in the curator-facing `auto_synonyms.csv` and `inactive_unresolved.csv`. Covered by `test_csv_formula_injection_is_neutralized`.
- **T-127-02 / T-127-03 refined by CR-01.** Transient iNat API errors (HTTPError after retry budget, or empty `results`) no longer write blocking triage rows — they warn and skip. This prevents a transient outage from hard-failing the nightly build, while genuine taxonomic dead-ends still block. Covered by `test_transient_api_error_does_not_block` and `test_empty_results_does_not_block`.
- **T-127-04 bounded by WR-05.** `_INACTIVE_REMAP_MAX_TAXA=500` and a consecutive-failure circuit-breaker cap worst-case API fan-out.
- The bridge UPSERT (line 226-237) is intentionally **not** run through `_csv_safe()` — it is a parameterized SQL write, where formula injection is irrelevant and SQL injection is structurally impossible.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-127-04 | T-127-04 | Per-inactive API fetch reuses existing pacing + retry infrastructure; 0 inactive taxa today; WR-05 caps (500 max, circuit-breaker at 10 consecutive fails) bound worst case; dormant low-value path | data pipeline | 2026-05-31 |
| AR-127-05 | T-127-05 | `taxa_path` is a code-derived `Path(__file__).parent` join; no user/API/env value reaches the `read_csv` f-string; identical to the pre-existing verified enumeration-query pattern | data pipeline | 2026-05-31 |
| AR-127-08 | T-127-08 | D-04 header-only placeholder committed + `varchar` column_types + verified `dbt run.sh build` exits 0 with `INSERT 0`; downstream LEFT JOIN falls through to COALESCE | data pipeline | 2026-05-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Known Open Design Issues (Non-Security, Not Blockers)

Identified during code review (`127-REVIEW.md`) and intentionally deferred — **not** security blockers:

- **WR-01 (deferred):** Inactive bridge rows are never retired after a successful remap, so the detection query re-finds and re-fetches the same inactive taxa nightly. Impact bounded by the WR-05 caps. Convergence requires a dedicated design phase.
- **WR-04 (by design):** `auto_synonyms.csv` is both git-tracked (header-only placeholder, D-04) and gitignored (nightly regeneration, D-12). Intentional; documented in `127-REVIEW-FIX.md`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-31 | 9 | 9 | 0 | gsd-security-auditor (sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-31
