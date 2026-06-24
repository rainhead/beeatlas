---
phase: 163
slug: ecdysis-download-requires-authenticated-session
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 163 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest >=9.0.2 (+ pytest-randomly) |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| **Quick run command** | `cd data && uv run pytest tests/test_ecdysis_auth.py` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~2 seconds (quick) / fast tier <5 min (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_ecdysis_auth.py`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite green + `git check-ignore -v data/.dlt/secrets.toml` resolves
- **Max feedback latency:** ~5 seconds (unit tier; network mocked)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (security prereq) | 01 | 0 | D-1 secret storage | T-163 credential-leak-via-commit | secrets.toml cannot be committed | manual/CI grep | `git check-ignore -v data/.dlt/secrets.toml` | n/a | ⬜ pending |
| (login fields) | 01 | 1 | D-2 auth flow | — | POST sends `login`/`password`/`action=login`/`remember` to `/profile/index.php` | unit | `cd data && uv run pytest tests/test_ecdysis_auth.py -k login_fields` | ❌ W0 | ⬜ pending |
| (session reuse) | 01 | 1 | D-2 auth flow | — | download reuses the authenticated `Session` (login-then-download order) | unit | `... -k session_reuse` | ❌ W0 | ⬜ pending |
| (json/401 raises) | 01 | 1 | D-2 guard | T-163 corrupt-zip-cached | JSON/401 body raises; bad magic bytes never cached | unit | `... -k json_error_raises` | ❌ W0 | ⬜ pending |
| (cache fallback) | 01 | 1 | D-3 resilience | T-163 corrupt-zip-cached | valid cached ZIP reused on download failure, NO network | unit | `... -k cache_fallback` | ❌ W0 | ⬜ pending |
| (no-cache hard fail) | 01 | 1 | D-3 resilience | — | download fails AND no usable cache → raises | unit | `... -k no_cache_hard_fail` | ❌ W0 | ⬜ pending |
| (no password in logs) | 01 | 1 | V7 logging | T-163 credential-leak-via-logs | error strings/prints never include the password value | unit (source assertion) | `... -k password_not_logged` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_ecdysis_auth.py` — new file, all unit behaviors above (HTTP mocked per-test, Pattern D from `test_resolve_taxon_ids.py`; no conftest change).
- [ ] gitignore entry covering `data/.dlt/secrets.toml` — MUST land before any credentials are written to disk.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One real authenticated download yields a valid ZIP and the pipeline completes through `generate-sqlite` | D-1/D-2 integration | Requires the operator's real Ecdysis credentials on maderas; not on CI or dev machines | On maderas with creds in `data/.dlt/secrets.toml`: `cd data && uv run python run.py` (or `bash data/nightly.sh`); confirm STEP 1 `ecdysis` loads and the run reaches `generate-sqlite`. |
| Post-login success markers | D-2 | Only verifiable with real creds; design avoids depending on login-HTML (download guard is the success signal) | Observed implicitly when the manual integration download succeeds. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (new test file + gitignore)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
