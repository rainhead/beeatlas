# Runbook: maderas git remote & deploy

> **RETIRED 2026-10-24.** BeeAtlas moved to the Fly app on 2026-10-23 ([ADR 0042](../adr/0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)), and its side of maderas was taken down the next day. Kept for the history; operate production with [fly-machine.md](fly-machine.md).

`maderas` is a **non-bare git checkout** (a working tree, not a bare repo) at `maderas:dev/beeatlas/.git`, alongside `origin` (`github.com/rainhead/beeatlas`). The nightly pipeline runs on maderas, and `data/nightly.sh` does a `git pull` at the top of every run — so maderas self-syncs to `origin/main` nightly with no manual step.

## Push-to-deploy (`main`)

Because maderas has `main` checked out, git refuses a normal push to it (`receive.denyCurrentBranch`). It's configured with:

```
git config receive.denyCurrentBranch updateInstead   # (set on maderas)
```

So `git push maderas main` **updates maderas's working tree directly** — but only when that tree and index are **clean**. If maderas has uncommitted changes, the push is **rejected, not clobbered**; clean/commit there, or just let the next `nightly.sh` `git pull` reconcile.

## WIP branches (private-first)

The `denyCurrentBranch` restriction only ever applied to the *checked-out* branch. Any other branch pushes freely:

```
git push maderas my-wip-branch
```

Use this to keep work-in-progress off GitHub — push feature branches to maderas, and only publish to `origin` when ready. `main` remains a push-to-deploy target via `updateInstead`.
