---
created: 2026-05-14
priority: low
context: surfaced during Phase 88 cutover review; the Lambda execution path was abandoned at v1.7 (geographies OOM, 15-min timeout) and `data/nightly.sh` on maderas is the canonical execution path per CLAUDE.md `## Known State`
---

# Retire `data/stub_handler.py` and its Lambda surface

## Problem

`data/stub_handler.py` is the dormant Lambda entrypoint from v1.7. Its docstring says "runs dlt pipelines, exports data to S3, invalidates CloudFront" — exactly the work `nightly.sh` does now. It's referenced by `data/Dockerfile:21` (`CMD ["stub_handler.handler"]`) and there is at least one `infra/execution.log` showing a real Lambda invocation failure from this codepath.

Per CLAUDE.md `## Known State`: *Lambda CDK artifacts exist in AWS but the active execution path is `data/nightly.sh` on maderas (nightly cron)*. So `stub_handler.py` is dead code that ships in the Docker image without being used.

## Goal

Remove the Lambda execution path entirely — code, Dockerfile, and (optionally) the CDK stack.

## Scope (proposed order)

1. **Verify the Lambda is truly unused.** Confirm the CloudWatch logs show no recent invocations (last invocation in `infra/execution.log` is from when?). If something still pokes it occasionally, find out what.
2. **Delete `data/stub_handler.py`** + the matching Dockerfile `CMD` line + any container-image build wiring that exists only for the Lambda.
3. **Decide on the CDK stack.** Two options:
   - Keep the stack but delete just the function (preserves the deployment-pipeline shape for future serverless work)
   - Delete the stack entirely (`cdk destroy beeatlasstack` + remove the `infra/` Lambda definition); cleaner but loses any work-in-progress baseline
   - **Recommended:** delete the stack; if a future phase wants Lambda again, CDK reconstruction is cheap
4. **Sweep `infra/execution.log`** — historical debug artifact; either delete or move to `.planning/forensics/` if any of its content has archival value
5. **Update CLAUDE.md `## Known State`** — drop the "Lambda CDK artifacts exist but the active execution path is..." paragraph; replace with a one-liner that the pipeline runs as `data/nightly.sh` on maderas

## Risk

Low if the Lambda is verified dead. Medium-low if anyone still has CloudWatch alarms or EventBridge schedules pointing at it — those need to be removed first to avoid alert noise.

## Estimated size

Quick task — ~30 minutes for code + Dockerfile + CLAUDE.md edits. Additional ~15 minutes if doing `cdk destroy` (interactive).

## Status

Pending — deferred from Phase 88. Natural follow-on now that nightly.sh is the verified single source of truth.
