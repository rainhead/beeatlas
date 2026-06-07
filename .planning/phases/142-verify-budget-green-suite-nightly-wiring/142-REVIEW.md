---
phase: 142-verify-budget-green-suite-nightly-wiring
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - data/nightly.sh
  - data/scripts/verify-clean-checkout.sh
  - data/tests/test_resolve_checklist_names.py
  - data/tests/test_checklist_reconcile.py
  - data/tests/test_checklist_pipeline.py
  - data/pyproject.toml
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 142: Code Review Report

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 142 wires the `@integration` test tier into `data/nightly.sh` as a pre-publish hard gate, adds a clean-checkout proof script, and hardens three order-dependence bugs plus a self-contained fuzzy-candidate fixture.

The nightly wiring is largely sound: block 2b's gate genuinely exits non-zero before any S3 upload, the EXIT trap is preserved (each S3 copy uses `|| true` so the exit code survives), and `if ! cmd` correctly coexists with `set -euo pipefail`. The clean-checkout script's worktree lifecycle is trap-safe and verified to work against a `mktemp -d` target. The fuzzy-candidate fixture is genuinely self-contained — I empirically reproduced 19 fuzzy hits at `score_cutoff=85` (well above the `>=13` bar) using only DB-seeded rows, and confirmed `resolve_checklist_names` sources its candidate pool from the seeded `checklist_records_full` + `canonical_to_taxon_id` tables, not from any external file.

The one blocker is a direct contradiction inside the fuzzy test itself: the fixture was made self-contained precisely because `data/checklist_unmatched.csv` is gitignored, yet `test_at_least_13_fuzzy_candidates` still hard-asserts that exact gitignored file exists. The assertion is dead weight on the happy path (the file is present on maderas) but converts the test from "self-contained" to "fails on any clean checkout" — defeating the stated Phase 142 design intent and the D-07 self-containment spirit the fixture docstring invokes.

## Critical Issues

### CR-01: Self-contained fuzzy test still hard-asserts the gitignored `checklist_unmatched.csv` exists

**File:** `data/tests/test_resolve_checklist_names.py:357-364`
**Issue:** The fixture was rewritten in Phase 142 to inline 19 verbatim rows + 20 bridge entries specifically so it does NOT depend on `data/checklist_unmatched.csv`. The fixture docstring (lines 152-159) states the file is "gitignored... and would be absent in a clean checkout. Inlining keeps the fixture self-contained." I confirmed `git check-ignore data/checklist_unmatched.csv` reports it ignored.

Yet `test_at_least_13_fuzzy_candidates` does:
```python
unmatched_path = Path(mod.__file__).parent / "checklist_unmatched.csv"
assert unmatched_path.exists(), (
    f"checklist_unmatched.csv not found at {unmatched_path}; "
    "this file must be committed (Phase 134 output)"
)
```
`unmatched_path` is never read after this assertion — the actual fuzzy generation runs `resolve_checklist_names(refresh=True)` against the seeded DB. So the only effect of these lines is to make the test FAIL with a misleading "this file must be committed" message in any environment where the gitignored output is absent (fresh clone, CI integration run, the very clean-checkout scenario `verify-clean-checkout.sh` simulates).

It passes today only because maderas carries the pipeline output. This is a latent failure that contradicts the phase's own self-containment goal and the assertion message is factually wrong (the file is gitignored, not committed).

**Fix:** Delete the existence assertion entirely (lines 357-364), since the test no longer uses the file:
```python
    tmp_path, mod = checklist_resolver_db

    # Fuzzy candidates are generated from the self-contained DB fixture
    # (checklist_records_full + canonical_to_taxon_id seeds), not from any
    # external file. checklist_unmatched.csv is gitignored and intentionally
    # NOT a dependency of this test (see fixture docstring).
    import pygbif  # noqa: PLC0415
    with patch.object(pygbif.species, "name_backbone",
                      return_value=_fake_gbif_response("NONE")):
        mod.resolve_checklist_names(refresh=True)
```
Also drop the now-stale comment block at lines 359-370 that describes reading the "real data/checklist_unmatched.csv file" and a `generate_fuzzy_candidates(...)` signature that does not match the actual `_generate_fuzzy_candidates` API.

## Warnings

### WR-01: Block 1c embeds shell-interpolated variables directly into Python `-c` source

**File:** `data/nightly.sh:136-167`
**Issue:** `$BUCKET`, `$AWS_PROFILE`, `$REPO_ROOT`, and `$_PREV_MANIFEST` are interpolated by the shell directly into the Python heredoc body as bare string literals (`bucket = '$BUCKET'`, `dest = '$REPO_ROOT/public/data'`, etc.). If any of those values ever contained a single quote, newline, or backslash, the generated Python would break syntactically or — worse — allow code injection into the interpreter. These are currently controlled config defaults, so this is not a live exploit, but it is a fragile pattern that turns a future config change (e.g. an env-supplied `BUCKET` or a `$HOME` with unusual characters via `REPO_ROOT`) into an injection surface.

**Fix:** Pass the values as `argv`/env instead of string-splicing them into source:
```bash
uv run python3 - "$BUCKET" "$AWS_PROFILE" "$REPO_ROOT/public/data" "$_PREV_MANIFEST" <<'PY'
import json, subprocess, sys
bucket, profile, dest, manifest_path = sys.argv[1:5]
manifest = json.load(open(manifest_path))
...
PY
```
The `<<'PY'` (quoted heredoc) disables shell interpolation entirely; values arrive as `sys.argv`.

### WR-02: Manifest-derived S3 keys are not validated before use

**File:** `data/nightly.sh:156-167`
**Issue:** `hashed` comes straight from the previous run's `manifest.json` and is interpolated into the S3 source key `s3://{bucket}/data/{hashed}`. The local destination names are hardcoded (good — no local path traversal), but a manifest value containing `../` or an absolute-looking segment would be passed verbatim to `aws s3 cp` as the source key. Within S3's flat keyspace this only lets a tampered manifest redirect reads to other keys in the same bucket (same trust boundary), so impact is contained — but there is no shape check (e.g. `^[a-z_]+-[0-9a-f]{12}\.[a-z]+$`) confirming the value is a plausible content-hashed artifact name before it is used.

**Fix:** Validate each manifest value against the expected hashed-filename pattern before the `aws s3 cp`, and skip with a WARN on mismatch:
```python
import re
HASHED = re.compile(r'^[a-z_]+-[0-9a-f]{12}\.[a-z]+$')
...
if not HASHED.match(hashed):
    print(f'WARN: manifest value {hashed!r} for {local} is not a hashed artifact name — skipping', file=sys.stderr)
    continue
```

### WR-03: `verify-clean-checkout.sh` runs `uv sync --frozen` inside the worktree, which can hit the network despite the "no network" claim

**File:** `data/scripts/verify-clean-checkout.sh:6, 46`
**Issue:** The header asserts "No network access." but line 46 runs `uv sync --frozen` against a fresh worktree whose `.venv` does not exist. The script's own assumption block (lines 11-13) admits "If the cache is cold, `uv sync --frozen` will require network access to prime it." So the top-of-file guarantee ("No network access") and the body contradict each other. In CI (Phase 143 TCI-01/TCI-02), a cold uv cache will cause this "offline proof" to silently reach out to PyPI, undermining the test it claims to perform and potentially failing in air-gapped runners.

**Fix:** Either soften the header to match reality ("No network access *given a warm uv cache*"), or make the network dependency explicit/offline:
```bash
uv sync --frozen --offline   # fail loudly if the cache is cold rather than silently fetching
```
and update the header comment accordingly.

### WR-04: `test_at_least_13_fuzzy_candidates` is `@integration` but the docstring/comments describe behavior that no longer matches the code

**File:** `data/tests/test_resolve_checklist_names.py:349-382`
**Issue:** Beyond CR-01, the docstring (line 351) says the test "uses the real data/checklist_unmatched.csv file" and the inline comments (lines 366-370) describe a `generate_fuzzy_candidates(unmatched_names, candidate_names, score_cutoff=85)` entry point. Neither is true: the real module exposes `_generate_fuzzy_candidates(...)` (different name/signature), the test never passes the file's contents to anything, and the candidate pool is built from `inaturalist_data.canonical_to_taxon_id` (line 323 of `resolve_checklist_names.py`). A future reader debugging a fuzzy regression will be sent to the wrong file and a non-existent API. This is misleading documentation on a gating test.

**Fix:** Rewrite the docstring/comments to describe the actual self-contained DB-seeded path (19 verbatim seeds + 20 bridge entries → `_generate_fuzzy_candidates` via `resolve_checklist_names(refresh=True)`), and remove the references to the external file and the wrong function signature.

### WR-05: Fixture docstring/comments claim "20" verbatim seed rows; only 19 exist, and one bridge entry has no verbatim partner

**File:** `data/tests/test_resolve_checklist_names.py:78-84, 152, 160-183, 185-224`
**Issue:** The fixture docstring (line 80) and the inline comment (line 152) both say "20" verbatim names / "20 bridge entries," but the `INSERT` at lines 164-182 contains exactly 19 verbatim rows. The bridge table (lines 204-223) has 20 entries; the extra one, `'lasioglossum heterorhinu'` (taxon 3007), is a 1-char variation of `lasioglossum heterorhinus`, which is one of the original *exact-match* seed rows (ObjectID 4 at line 148). That bridge entry has no corresponding fuzzy verbatim row, and it is a near-duplicate of an exact-seed canonical — which risks the heterorhinus exact-match row drifting into the fuzzy tier if tier ordering ever changes. The count mismatch (19 vs 20) makes the fixture's invariant hard to audit; I verified empirically that 19 hits are produced, so the `>=13` assertion holds, but the documented contract is wrong.

**Fix:** Correct the counts to 19 verbatim / 19 bridge, and drop the orphan `'lasioglossum heterorhinu'` bridge entry (or add its matching verbatim row) so the fixture is symmetric and the heterorhinus exact-match row cannot be perturbed by a 1-char fuzzy neighbor.

## Info

### IN-01: Block 1c swallows all errors with `2>&1 || true`, hiding partial-pull failures

**File:** `data/nightly.sh:167`
**Issue:** The whole embedded-Python artifact pull is suffixed `2>&1 || true`. This is intentional (graceful-miss), but it means a genuine bug in the pull logic (bad manifest, AWS auth failure) produces only an unstructured WARN that the gate may later interpret as "diff skipped" rather than "baseline missing." Consider surfacing a single explicit "baseline incomplete" marker so block 2b's `test_dbt_diff` skip-vs-fail decision is observable in the log.

### IN-02: `test_checklist_reconcile.py` retains 6 fully-skipped `@_RETIRED` reconcile tests as dead code

**File:** `data/tests/test_checklist_reconcile.py:121-253`
**Issue:** Six tests are decorated `@_RETIRED` (skip) and exercise `reconcile()`, which D-07/RCN-06 removed from the module. They reference `mod.SYNONYMS_PATH`/`mod.UNMATCHED_PATH` that no longer exist and would `AttributeError` if ever un-skipped. Phase 135 already removed the production path; keeping ~130 lines of dead skipped tests is maintenance drag. The Phase 142 `reload_pipeline` save/restore fix correctly guards the two *live* tests in this file, so the fix itself is sound — this is purely about the residual dead bulk.

**Fix:** Delete the `@_RETIRED` block (lines 121-253) and the `_RETIRED` marker; the `test_no_active_reconcile_call`/`test_single_synonym_source` guards in `test_checklist_pipeline.py` already enforce removal.

### IN-03: Three skipped reconcile placeholders in `test_checklist_pipeline.py` are `pass`-body documentation stubs

**File:** `data/tests/test_checklist_pipeline.py:384-415`
**Issue:** `test_reconcile_synonym_override_updates_checklist`, `test_reconcile_unmatched_warn_only`, and `test_reconcile_unmatched_csv_header` are skipped with `pass  # Dead code path; kept as documentation only.` These add no coverage and duplicate the retirement rationale already captured in `test_no_active_reconcile_call`. Same drag as IN-02.

**Fix:** Remove the three stubs; the retirement is enforced by the source-inspection guards.

### IN-04: `_GBIF_PACE_SECONDS` zeroing in the fixture relies on an undocumented module constant existing

**File:** `data/tests/test_resolve_checklist_names.py:96`
**Issue:** `monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)` will raise `AttributeError` (monkeypatch's default is strict) if that private constant is ever renamed/removed in `resolve_checklist_names.py`. Since this fixture gates the integration tier, a refactor of the module's pacing constant would break every test using the fixture with an opaque setup error. Low risk (constant exists today), but worth a `raising=False` or a guard if the constant is considered volatile.

**Fix:** If the constant is stable, leave as-is; otherwise `monkeypatch.setattr(..., 0.0, raising=False)` degrades gracefully.

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
