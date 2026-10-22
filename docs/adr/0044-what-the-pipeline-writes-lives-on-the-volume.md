# 0044 — What the pipeline writes lives on the volume, behind symlinks from the checkout

Date: 2026-10-22
Status: Accepted
Implements part of [0042](0042-beeatlas-moves-to-fly-as-one-stateful-machine.md) (the image and the
volume); `beeatlas-3je9`.

## Context

0042 put the site, the DuckDB, the Stelis state, the export and the notes store on the one volume,
under the `$BASE_DIR` layout `data/nightly.sh` already takes from its environment. It also named
the state that today lives *inside the checkout* and would be lost with it in the image model:
`data/raw/taxa.csv.gz` (38 MB, re-fetched against a rate-limited source), `data/raw/taxa_cache.json`,
`data/raw/ecdysis_cache/` (21 MB, an auth-gated source), and the build receipt under `.cache/`.
Writing the image surfaced three more of the same kind: `_site` (about 2 GB per render),
`data/dbt/target` (dbt's sandbox), and dlt's working directory under `$HOME`.

Fly's root filesystem is the wrong place for any of them twice over. It is capped near 8 GB
uncompressed, image included, and it is throttled for writes and not meant to hold them. And it is
replaced on every deploy, so a cache there is a cache that empties on each release.

The paths are spread over Python (`taxa_pipeline`, `ecdysis_pipeline`), node (`build-receipt.mjs`,
Eleventy and Vite's output), dbt's project config and the Stelis graph (`raw-file-paths` in
`src/beeatlas.rkt`). Teaching each one an environment variable would touch two repositories and
the content-addressed inputs of several tasks, for a move that is purely about where bytes sit.

## Decision

**The image makes each of those paths a symlink into the volume**, and the code is unchanged:

| in the checkout | on the volume | what it holds |
|---|---|---|
| `/app/data/raw` | `/data/raw` | `taxa.csv.gz`, `taxa_cache.json`, `ecdysis_cache/` |
| `/app/.cache` | `/data/cache` | the build receipt |
| `/app/_site` | `/data/site` | the rendered site, before merge-swap into `/data/htdocs` |
| `/app/data/dbt/target` | `/data/dbt-target` | dbt's sandbox and compiled models |

The rest of the state is reached by the environment the scripts already read, set in the image:
`VAR_DIR=/data/var` (the DuckDB, the export, the baseline, the Stelis state, the publish lock),
`SITE_ROOT=/data/htdocs`, `NOTES_DB_PATH=/data/notes/notes.db`, and `DLT_DATA_DIR=/data/dlt` for
dlt. `fly/prepare-volume.sh` creates the directories and hands them to `app` at boot, since Fly
mounts the volume owned by root.

Secrets are not state and are not on the volume: `data/.dlt/secrets.toml` and `api/secrets.toml`
are left out of the image and materialized from Fly secrets by the entrypoint (`beeatlas-cjyz`).

## Consequences

- The root filesystem carries code and dependencies only: the checkout, two `node_modules`
  trees, the uv environments and Stelis. Everything that grows is on the volume, which is sized
  and snapshotted for it.
- A Stelis input that is a symlink is read through it, and content-addressed by what it reads;
  the graph does not know the files moved.
- A fresh volume starts empty, so the first nightly re-fetches the taxa and ecdysis caches once.
  That is the migration's one-time cost, and the reason `data/raw` is restored from the offsite
  backup at cutover rather than rebuilt (`beeatlas-j65i`).
- `rsync` in `merge-swap.sh` now copies from `/data/site` to `/data/htdocs`, both on the volume,
  which keeps its mtime-based prune exactly as it was.

## Rejected alternatives

**Environment variables for each path.** Correct in principle, and the shape the rest of the
layout already has. Rejected for this move because it crosses two repositories and the hashed
inputs of several tasks to achieve what four symlinks do; it remains the right answer the day one
of these paths needs to differ between hosts for a reason other than where the bytes live.

**Leaving `_site` on the root filesystem.** It is regenerated each run, so losing it costs
nothing; but 2 GB on a throttled, capped disk is the wrong trade, and `merge-swap.sh` is faster
with both ends on the same filesystem.
