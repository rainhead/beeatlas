---
phase: 9
slug: pipeline-implementation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected in `data/` — inline assertions via `uv run python -c` |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `cd data && uv run python -c "import inat.download; print('import OK')"` |
| **Full suite command** | `npm run fetch-inat` (live API smoke test; ~30s for ~9,590 obs) |
| **Estimated runtime** | ~30 seconds (full); ~2 seconds (quick import check) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run python -c "import inat.download; print('import OK')"`
- **After every plan wave:** Run `npm run fetch-inat`
- **Before `/gsd:verify-work`:** Full suite must be green (all 5 success criteria verified)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 0 | INAT-01, INAT-02 | import | `cd data && uv run python -c "import inat.download; print('import OK')"` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 0 | INFRA-05 | smoke | `node -e "const p=require('./package.json'); ['fetch-inat','cache-restore','cache-upload'].forEach(s=>{if(!p.scripts[s]) throw new Error(s+' missing')}); console.log('scripts OK')"` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 0 | CACHE-01 | shell | `bash scripts/cache_restore.sh && echo "restore ok"` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | INAT-01, INAT-02 | integration | `cd data && uv run python -c "from inat.download import fetch_observations; r=fetch_observations(per_page=1); assert len(r)>0; print('fetch OK')"` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | INAT-02 | unit | `cd data && uv run python -c "from inat.observations import extract_specimen_count; assert extract_specimen_count([{'field_id':8338,'value':'3'}])==3; print('extract OK')"` | ✅ | ⬜ pending |
| 9-02-03 | 02 | 1 | INAT-02 | unit | `cd data && uv run python -c "import pandas as pd; import pyarrow.parquet as pq; df=pd.read_parquet('samples.parquet'); assert set(['observation_id','observer','date','lat','lon','specimen_count'])==set(df.columns); print('schema OK')"` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 1 | CACHE-02 | unit | `cd data && uv run python -c "from inat.download import merge_delta; import pandas as pd; old=pd.DataFrame({'observation_id':[1]}); delta=pd.DataFrame({'observation_id':[1,2]}); merged=merge_delta(old,delta); assert len(merged)==2; print('merge OK')"` | ❌ W0 | ⬜ pending |
| 9-03-02 | 03 | 1 | CACHE-03 | manual | `aws s3 ls s3://$S3_BUCKET_NAME/cache/` after running `npm run cache-upload` | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/inat/download.py` — core pipeline script skeleton (importable, functions stubbed)
- [ ] `scripts/cache_restore.sh` — S3 restore script (graceful on cache miss)
- [ ] `scripts/cache_upload.sh` — S3 upload script
- [ ] npm scripts `fetch-inat`, `cache-restore`, `cache-upload` in `package.json`

*Existing infrastructure: `data/inat/observations.py` (Phase 8) covers INAT-02 extract_specimen_count unit test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upload puts both files to S3 | CACHE-03 | Requires live AWS credentials and bucket write access | Run `npm run cache-upload` locally with AWS creds; verify `aws s3 ls s3://$S3_BUCKET_NAME/cache/` shows `samples.parquet` and `last_fetch.txt` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
