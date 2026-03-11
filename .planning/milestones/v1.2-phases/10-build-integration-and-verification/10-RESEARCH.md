# Phase 10: Build Integration and Verification - Research

**Researched:** 2026-03-10
**Domain:** GitHub Actions CI, shell scripting, S3 cache round-trip, parquet schema verification
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INAT-03 | Pipeline produces `samples.parquet` (observation_id, observer, date, lat, lon, specimen_count nullable) | Pipeline code (download.py) is fully implemented and wired into build-data.sh; Phase 10 must verify the end-to-end output is correct and that CI orchestrates it properly |
</phase_requirements>

---

## Summary

Phase 9 delivered all pipeline code — `data/inat/download.py`, `scripts/build-data.sh`, `scripts/cache_restore.sh`, `scripts/cache_upload.sh`, and the five `package.json` scripts. Phase 10 is a verification and CI-wiring phase: the pipeline code is done, but the CI workflow does not yet call the cache scripts, and the S3 bucket name environment variable is not forwarded to the build step that needs it.

The three success criteria map to three distinct gaps. First, a local end-to-end run of `npm run build` must produce `data/samples.parquet` with the correct six-column schema and at least one row — this should work today once run, but it hasn't been validated with a live network call. Second, the CI `build` job must be updated to: (a) pass `S3_BUCKET_NAME` as an env var to the build step, and (b) call `npm run cache-restore` before build and `npm run cache-upload` after. Third, the CI workflow must pass on push to main, which requires the deploy job's credential ordering to not interfere.

**Primary recommendation:** Update `deploy.yml` to wire cache-restore → build → cache-upload as explicit named steps in the `build` job, passing `S3_BUCKET_NAME` env var; run a live `npm run build` locally to confirm parquet output; then push and verify CI green.

---

## Current State Inventory

### What Phase 9 Delivered (already in repo, committed)

| File | Status | What It Does |
|------|--------|-------------|
| `data/inat/download.py` | DONE | Full/incremental iNat fetch → `data/samples.parquet` + `data/last_fetch.txt` |
| `scripts/build-data.sh` | DONE | Calls ecdysis pipeline then iNat download, copies both parquets to `frontend/src/assets/` |
| `scripts/cache_restore.sh` | DONE | `aws s3 cp` both cache files from `s3://$BUCKET/cache/`, graceful on miss |
| `scripts/cache_upload.sh` | DONE | `aws s3 cp` both cache files to `s3://$BUCKET/cache/` |
| `package.json` scripts | DONE | `build`, `build:data`, `fetch-inat`, `cache-restore`, `cache-upload` |
| `frontend/src/assets/samples.parquet` | DONE | Zero-row stub, force-tracked (`git add -f`), correct schema |
| `data/tests/test_inat_download.py` | DONE | 15 unit tests, all passing |

### What Is NOT Done (Phase 10 scope)

1. **CI does not call `npm run cache-restore` or `npm run cache-upload`** — the `build` job only calls `npm run build`.
2. **`S3_BUCKET_NAME` is not passed as an env var to the build job steps** — `cache_restore.sh` and `cache_upload.sh` both do `BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"` (will hard-fail without it).
3. **Local `npm run build` with live network has not been run** — the pipeline code is implemented but the parquet output with real data has not been verified.
4. **`deploy` job in CI rebuilds from scratch** without cache wiring (acceptable — deploy job can optionally get the same treatment, or just focus on `build` job for the cache requirement).

---

## Architecture Patterns

### CI Workflow Structure (current)

```
build job:
  - checkout
  - setup-uv
  - setup-node
  - npm ci
  - Configure AWS credentials (OIDC)   ← AWS creds ARE available here
  - npm run build                       ← build-data.sh runs here, needs S3_BUCKET_NAME
```

The `aws-actions/configure-aws-credentials@v4` step sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` in the environment for subsequent steps. The `aws` CLI works after this step. So `npm run build` already has AWS CLI access. The missing piece is just `S3_BUCKET_NAME` as an env var.

### Required CI Changes

**Pattern: Split the monolithic `npm run build` into explicit pipeline steps**

```yaml
# build job steps (after AWS credentials configured):

- name: Restore S3 cache
  run: npm run cache-restore
  env:
    S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}

- name: Build
  run: npm run build
  env:
    S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}

- name: Upload S3 cache
  run: npm run cache-upload
  env:
    S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}
```

**Why step-level env, not job-level env:** Job-level `env:` works too and is less repetitive. Either is correct. Job-level is cleaner.

```yaml
jobs:
  build:
    env:
      S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}
    steps:
      ...
      - name: Restore S3 cache
        run: npm run cache-restore
      - name: Build
        run: npm run build
      - name: Upload S3 cache
        run: npm run cache-upload
```

### cache_restore.sh Behavior on Cache Miss

`cache_restore.sh` uses `2>/dev/null || echo "..."` — it never exits non-zero on cache miss. First CI run (cold cache) will print "not in cache" and continue. `download.py` detects no `samples.parquet` + no `last_fetch.txt` and does full fetch. This is correct and intentional.

### deploy Job — Credential Ordering Bug

In the current `deploy` job, the step order is:
1. checkout
2. setup-uv
3. setup-node
4. npm ci
5. **npm run build** ← runs WITHOUT AWS credentials
6. Configure AWS credentials
7. Sync to S3

If `npm run build` calls `build-data.sh` which calls `cache_restore.sh` which calls `aws s3 cp`, it will fail in the deploy job because AWS creds aren't configured yet. The deploy job needs the same fix: move `Configure AWS credentials` before `npm run build` (already done in `build` job; `deploy` job has it backwards).

**Options for deploy job:**
- Option A: Mirror the `build` job fix — move credentials before build, add cache-restore/upload steps
- Option B: Skip cache in deploy job — call `npm run fetch-inat` directly instead of `npm run build` (duplicates logic)
- Option C: Make `cache_restore.sh` non-fatal on missing AWS creds (not recommended — could mask real failures)
- **Recommended: Option A** — same treatment for both jobs for consistency. `deploy` job only runs on main, and the cache will be warm from the `build` job on the same push.

Note: On a push to main, both `build` and `deploy` jobs run. The `deploy` job `needs: build` — so `build` finishes first. By the time `deploy` runs, the S3 cache was just uploaded by `build`. But `deploy` re-runs `npm run build` from scratch (fresh checkout), so it will do an incremental fetch (very fast since `build` just ran).

---

## Standard Stack

### Core (all already installed/configured)

| Tool | Version | Purpose |
|------|---------|---------|
| `actions/checkout@v4` | v4 | Checkout repo |
| `astral-sh/setup-uv@v5` | v5 | Install uv for Python pipeline |
| `actions/setup-node@v4` | v4 | Node 22, npm cache |
| `aws-actions/configure-aws-credentials@v4` | v4 | OIDC auth |
| `pandas` | ≥3.0.0 | DataFrame, parquet write |
| `pyarrow` | ≥22.0.0 | Parquet engine |
| `pyinaturalist` | ≥0.20.2 | iNat API client |

No new dependencies needed for Phase 10.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 cache miss handling | Custom retry/fallback logic | Already in `cache_restore.sh` with `|| echo` pattern | Phase 9 solved this |
| parquet schema validation | Custom assertion code | `pandas.read_parquet` + column/dtype checks inline | Two-liner |
| incremental fetch orchestration | New script | `download.py main()` already handles | Phase 9 solved this |

---

## Common Pitfalls

### Pitfall 1: `S3_BUCKET_NAME` not available in build step
**What goes wrong:** `cache_restore.sh` exits immediately with `S3_BUCKET_NAME: S3_BUCKET_NAME not set` (bash `${VAR:?}` parameter expansion), causing the CI build to fail before any data is fetched.
**Why it happens:** `vars.S3_BUCKET_NAME` is a GitHub Actions variable that must be explicitly passed into workflow steps via `env:`.
**How to avoid:** Add `env: S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}` at job level or on each step that needs it.
**Warning signs:** CI fails on `Restore S3 cache` step with "S3_BUCKET_NAME not set".

### Pitfall 2: AWS credentials step after build in deploy job
**What goes wrong:** `npm run build` (in deploy job) calls `aws s3 cp` via `cache_restore.sh` before AWS credentials are configured — fails with "Unable to locate credentials".
**Why it happens:** The current `deploy` job has `Configure AWS credentials` AFTER `npm run build`.
**How to avoid:** Move `Configure AWS credentials` step to before `npm run build` in the deploy job (mirrors fix in build job).
**Warning signs:** Deploy job fails on `Build` step with AWS credentials error.

### Pitfall 3: `data/samples.parquet` not written before `cp` in build-data.sh
**What goes wrong:** If `download.py` raises an exception, `samples.parquet` is not written (or is stale), but `build-data.sh` does `cp samples.parquet frontend/src/assets/samples.parquet` unconditionally.
**Why it happens:** `build-data.sh` uses `set -euo pipefail` so it will exit on error — the `cp` step won't run if `download.py` fails. But if `data/samples.parquet` doesn't exist yet (first run without cache), and `download.py` fails midway...
**How to avoid:** The pipeline already handles this correctly: `set -euo pipefail` causes shell to exit on any error. If `download.py` fails, `cp` never runs, and CI fails with a clear error. This is correct behavior.
**Note:** On first CI run, `cache_restore.sh` will print "not in cache" but succeed (exit 0). `download.py` will do full fetch. This is the intended cold-cache path.

### Pitfall 4: `frontend/src/assets/samples.parquet` stub gets overwritten with live data
**What it is:** This is intentional and correct — `build-data.sh` copies `data/samples.parquet` over the stub. The stub only exists to prevent CI failures before the pipeline runs. Once the pipeline works, the live data replaces it every build.
**Not a pitfall:** Expected behavior.

### Pitfall 5: deploy job rebuilds from scratch (no artifacts passed from build job)
**What it is:** GitHub Actions jobs don't share filesystem state. The deploy job checks out fresh and rebuilds. This means the iNat pipeline runs twice on a push to main.
**Impact:** ~30 seconds extra on deploy job. The second run is incremental (fast) because build job just uploaded fresh cache.
**Mitigation options:** Use `actions/upload-artifact` / `actions/download-artifact` to pass `frontend/dist/` from build to deploy, avoiding the rebuild. This is a nice-to-have optimization, not a blocker.
**Recommendation for Phase 10:** Do not optimize; accept the double run. Out of scope.

---

## Code Examples

### Verifying parquet output schema (local smoke test)

```python
# Run from data/ directory: uv run python -c "..."
import pandas as pd
df = pd.read_parquet("samples.parquet")
expected_cols = {"observation_id", "observer", "date", "lat", "lon", "specimen_count"}
assert set(df.columns) == expected_cols, f"columns mismatch: {set(df.columns)}"
assert df.dtypes["observation_id"] == "int64"
assert str(df.dtypes["specimen_count"]) == "Int64"
assert len(df) > 0, "parquet has zero rows"
print(f"OK: {len(df)} rows, null rate: {df['specimen_count'].isna().mean():.1%}")
```

### deploy.yml build job env block (recommended pattern)

```yaml
jobs:
  build:
    name: Build frontend
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    env:
      S3_BUCKET_NAME: ${{ vars.S3_BUCKET_NAME }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOYER_ROLE_ARN }}
          aws-region: us-west-2
      - name: Restore S3 cache
        run: npm run cache-restore
      - name: Build
        run: npm run build
      - name: Upload S3 cache
        run: npm run cache-upload
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.x (configured in `data/pyproject.toml`) |
| Config file | `data/pyproject.toml` (no pytest.ini; pytest auto-discovers `data/tests/`) |
| Quick run command | `cd /path/to/data && uv run pytest tests/test_inat_download.py -q` |
| Full suite command | `cd /path/to/data && uv run pytest tests/ -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INAT-03 | `samples.parquet` produced with correct schema and ≥1 row | smoke (live) | `cd data && uv run python inat/download.py && uv run python -c "import pandas as pd; df=pd.read_parquet('samples.parquet'); assert len(df)>0; assert set(df.columns)=={'observation_id','observer','date','lat','lon','specimen_count'}; print('OK:', len(df), 'rows')"` | ❌ requires live run |
| INAT-03 | CI cache round-trip succeeds | manual CI verification | Push branch, observe GitHub Actions build job log | ❌ requires CI run |
| INAT-03 | deploy.yml passes on push to main | manual CI verification | Push to main, observe CI pass + deploy | ❌ requires CI run |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_inat_download.py -q` (15 unit tests, <1s)
- **Per wave merge:** `npm run fetch-inat` (live iNat smoke, ~30s)
- **Phase gate:** CI green on push to main before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all unit-testable behaviors. Phase 10 success criteria are integration/CI-level and require live network + CI run.

---

## Open Questions

1. **Does the `deploy` job need cache-restore/upload too?**
   - What we know: `deploy` runs `npm run build` which calls `build-data.sh` which calls `download.py`. If `cache_restore.sh` runs before it, `download.py` gets warm cache and does incremental fetch.
   - What's unclear: Whether the credential ordering fix is needed in the deploy job.
   - Recommendation: Fix the deploy job the same way as the build job — move AWS credentials before build, add cache-restore and cache-upload steps. Consistency is better than having two different patterns in the same workflow.

2. **Will `npm run cache-upload` fail if `data/last_fetch.txt` doesn't exist?**
   - What we know: `cache_upload.sh` calls `aws s3 cp "$CACHE_DIR/last_fetch.txt"` — if the file doesn't exist, `aws s3 cp` exits non-zero, and `set -euo pipefail` causes the script to exit non-zero.
   - What's unclear: Can `download.py` ever succeed but fail to write `last_fetch.txt`? No — `download.py` writes `last_fetch.txt` after `to_parquet()` completes. So if `download.py` succeeds, both files exist.
   - Recommendation: No issue, no action needed.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `scripts/build-data.sh`, `scripts/cache_restore.sh`, `scripts/cache_upload.sh`, `data/inat/download.py`, `.github/workflows/deploy.yml`, `package.json` — all read directly from repo
- Direct test run: `uv run pytest tests/test_inat_download.py` — 15/15 passing, confirmed 2026-03-10
- Direct schema verification: `frontend/src/assets/samples.parquet` confirmed 0-row stub with correct 6-column schema

### Secondary (MEDIUM confidence)
- GitHub Actions `env:` at job level vs step level — standard documented behavior; verified pattern from aws-actions docs

---

## Metadata

**Confidence breakdown:**
- Current state inventory: HIGH — all files read directly from repo
- CI gap analysis: HIGH — read deploy.yml directly, identified missing steps
- Pitfalls: HIGH — derived from direct code reading, not speculation
- Fix patterns: HIGH — standard GitHub Actions env var pattern

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain — GitHub Actions YAML patterns don't change frequently)
