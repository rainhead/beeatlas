---
phase: 163
slug: ecdysis-download-requires-authenticated-session
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-24
---

# Phase 163 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (`163-01-PLAN.md` `<threat_model>`); all mitigations
> verified against the implementation (`163-VERIFICATION.md`, `163-REVIEW.md`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| pipeline → Ecdysis (`ecdysis.org`) | Untrusted third-party HTTP response (downloaded ZIP / login HTML) crosses into the pipeline | Binary ZIP / HTML / JSON error bodies (untrusted) |
| operator → disk (`data/.dlt/secrets.toml`) | Plaintext Symbiota credential at rest on maderas; must never cross into git | Username + password (secret) |
| pipeline → logs/stdout | Error/print output may leak secrets if credentials are interpolated | Diagnostic strings (must be secret-free) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-163-01 | Information Disclosure | `data/.dlt/secrets.toml` committed to git | mitigate | `data/.gitignore:4` (`.dlt/secrets.toml`) lands in Task 1 before any creds; `git check-ignore -v data/.dlt/secrets.toml` resolves (exit 0) | closed |
| T-163-02 | Information Disclosure | password echoed in print/exception/traceback (`_login_session`, `_assert_zip_response`, fallback warning) | mitigate | Password never interpolated into any message; `password` appears only at assignment + as a function arg. Pinned by `test_password_not_logged` (hard-fail branch) **and** `test_password_not_logged_on_fallback_warning` (WARNING-print branch, WR-04) | closed |
| T-163-03 | Tampering | corrupt/JSON "ZIP" written to `data/.ecdysis_cache/44.zip` then consumed downstream | mitigate | `_assert_zip_response` (`raise_for_status` → Content-Type → `PK\x03\x04` magic-bytes) runs inside the try, before the atomic write; `_is_valid_cached_zip` (`testzip()`) re-validates the fallback. Covered by `json_error_raises` + `cache_fallback` | closed |
| T-163-04 | Spoofing / MITM | man-in-the-middle on the login/download HTTP | mitigate | HTTPS enforced by hardcoded `https://ecdysis.org` URLs (`ECDYSIS_LOGIN_URL`, `ECDYSIS_DOWNLOAD_URL`); no http→ downgrade introduced | closed |
| T-163-05 | Denial of Service | Ecdysis outage / auth break zeroes the nightly | mitigate | D-3 cache-fallback reuses a valid cached ZIP (warn) on failure; hard-fail only with no usable cache. Covered by `cache_fallback` + `no_cache_hard_fail`. **Verified in production** during UAT: an expired-password 401 degraded gracefully to the cached ZIP instead of aborting the nightly | closed |
| T-163-SC | Tampering | npm/pip/cargo installs (supply chain) | accept | No new packages installed this phase — `requests` / `dlt` / `zipfile` / `pytest` all already dependencies. See Accepted Risks Log | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-163-01 | T-163-SC | No new third-party packages were added this phase; all imports (`requests`, `dlt`, `zipfile`, `pytest`) are pre-existing project dependencies, so no package-legitimacy gate applies | Peter Abrahamsen (operator) | 2026-06-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-24 | 6 | 6 | 0 | Claude (gsd-secure-phase, short-circuit from plan-time register; mitigations verified in 163-VERIFICATION.md / 163-REVIEW.md) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-24
