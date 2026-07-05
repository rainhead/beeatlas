# Runbook: maderas git remote & deploy

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
