# Phase 44: Pipeline Wiring and Discovery - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Upload generated feed files to S3 on every nightly run, and add a browser autodiscovery `<link>` tag to `index.html`. Two requirements: PIPE-02 and DISC-01.

</domain>

<decisions>
## Implementation Decisions

### nightly.sh Refactor
- **D-01:** Replace nightly.sh's inline Python snippet with a call to `run.py` directly (`~/.local/bin/uv run python run.py`). This eliminates the divergence — nightly.sh currently runs only 5 steps while run.py has 8 (geographies, ecdysis, links, inat, projects, anti-entropy, export, feeds). The refactor adds anti-entropy and feeds at once.
- **D-02:** Keep existing env var exports (`export DB_PATH EXPORT_DIR`) before calling run.py — all pipeline modules respect these env vars already.

### S3 Feeds Upload
- **D-03:** Use `aws s3 sync "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"` — handles ~200+ feed files efficiently without uploading unchanged files.
- **D-04:** Existing four `aws s3 cp` calls for parquet/geojson files stay as-is. Feeds upload is an addition, not a replacement.
- **D-05:** Current CloudFront invalidation path `/data/*` already covers feeds — no change needed.

### HTML Autodiscovery Tag
- **D-06:** Add `<link rel="alternate" type="application/atom+xml" title="Washington Bee Atlas — All Recent Determinations" href="/data/feeds/determinations.xml">` to the `<head>` of `frontend/index.html`.

### Claude's Discretion
- Exact placement of the `<link>` tag within `<head>` (after charset/viewport meta tags is conventional)
- Whether to add a newline/comment separator before the new `<link>` tag

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline files
- `data/nightly.sh` — current script to be refactored; understand existing step structure and env vars before modifying
- `data/run.py` — the orchestrator that nightly.sh will delegate to; understand all 8 steps
- `data/feeds.py` — uses `EXPORT_DIR` env var (defaults to `frontend/public/data/`; in nightly.sh context = `/tmp/beeatlas-export/`)

### Frontend
- `frontend/index.html` — receives the autodiscovery tag in `<head>`

### Requirements
- PIPE-02: Feed XML files written to S3 by nightly.sh
- DISC-01: `<link rel="alternate" type="application/atom+xml">` tag in index.html

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `run.py` `main()`: already calls all 8 steps including feeds — can be invoked directly from nightly.sh
- `feeds.py` `main()`: respects `EXPORT_DIR` env var, writes to `$EXPORT_DIR/feeds/`
- nightly.sh `EXPORT_DIR=/tmp/beeatlas-export`: already exported before Python block — run.py will inherit it

### Established Patterns
- nightly.sh uses `~/.local/bin/uv run python -` for inline Python; same prefix applies for `uv run python run.py`
- S3 uploads use `--no-progress` flag and `--profile "$AWS_PROFILE"` — consistent for new sync call
- `cd "$SCRIPT_DIR"` already done before Python block — run.py is in the same directory

### Integration Points
- Step 2 (run pipelines) is where inline Python gets replaced with `run.py` call
- Step 3 (push exports) gets a `feeds` sync line added after the 4 existing `s3 cp` calls
- `index.html` `<head>` — append after existing meta/link tags

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 44-pipeline-wiring-and-discovery*
*Context gathered: 2026-04-11*
