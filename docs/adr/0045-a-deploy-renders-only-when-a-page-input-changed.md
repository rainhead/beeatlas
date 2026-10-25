# 0045 — A deploy re-renders the site only when something a page is built from changed

Date: 2026-10-25
Status: Accepted
Refines [0042](0042-beeatlas-moves-to-fly-as-one-stateful-machine.md) (the first boot of a new
image re-renders the site); builds on [0017](0017-scoped-note-render.md)'s build receipt;
`beeatlas-ky6d`.

## Context

Every push to `main` deploys, and the first boot of each new image re-rendered all ~1,700 pages
(`data/publish-code.sh`, started by `fly/start.sh` whenever the image's commit differs from the
one last rendered). The trigger was the commit, so a deploy that changed only a pipeline script,
a runbook or the Stelis pin paid for a full render all the same: the deploy of #157 on
2026-10-25 changed `data/nightly.sh`, `data/publish-notes.sh`, `scripts/fetch-data.sh`, an ADR
and the Stelis pin, and re-rendered everything. The render holds the publish lock for minutes,
on a Machine whose CPU credit the restart has just reset, so a note saved meanwhile waits 60 s
and is told "saved; publish pending" (seen at 03:54Z that day).

The build receipt already answers a near neighbour of the question. A note save asks it "may I
render a few pages over this tree?", and it says yes when the render's inputs, the Vite manifest,
the data dir and `_site`'s file list all match the last full build. A deploy asks something
broader: "would a full build of this image produce the site already served?" A full build reads
more than the note path's `render` component covers. It leaves out `pnpm-lock.yaml` on purpose
(a dependency bump does not make a scoped render unsound), and with it `node_modules`; and it
also misses `public/`, `.nvmrc`, the `.env` files and the scripts that build the bundle.

## Decision

The receipt gains a fifth component, `deploy`: a content hash of every file in the repo except a
list of paths no page is built from (`DEPLOY_IGNORE` in `scripts/build-receipt.mjs`): documents,
the pipeline under `data/`, the API, the Machine's config under `fly/`, AWS, CI and editor
settings, and named operator tools in `scripts/`. `--check-deploy` requires all five components
to match. The note path's `--check` ignores `deploy`, as before.

`publish-code.sh` runs `--check-deploy` after taking the publish lock, and also requires the
served `manifest.json` to be byte-identical to `_site`'s. The receipt describes `_site`, not what
is served, and merge-swap writes the manifest last, so a match means this `_site` was published in
full. When both pass, it publishes nothing and exits 0, and `fly/start.sh` records the commit as
rendered.

The served manifest's `build_id` then keeps naming the commit that last rendered the site, not
the deployed one. That is true to its meaning, "which code produced this publish", and the next
render (the nightly, or a deploy that changes a page input) moves it.

## Why a list of what to leave out

The two ways to be wrong cost very different amounts. Leaving out a file a build reads lets a
deploy skip a render it needed, and the site stays stale until the next nightly, silently.
Including a file no build reads costs one unnecessary render, which is what every deploy did
before. Listing what to include would make every new input a silent stale site until someone
remembered to list it; listing what to leave out makes every new file force a render until
someone decides it cannot reach a page. `src/tests/build-receipt.test.ts` pins both directions,
including that an unclassified new file forces a render.

The digest runs over the image's `/app`, which on 2026-10-25 held exactly the files of a clean
export of the same commit (217 under this rule), so nothing the image build writes there makes
two images of the same inputs look different.

## Rejected

- **Adding only `pnpm-lock.yaml`**, as beeatlas-ky6d first proposed. It closes the gap ADR 0017's
  amendment relies on, but leaves `public/`, `.nvmrc` and the bundle scripts uncovered: a deploy
  that changed only an app icon would skip its render.
- **Putting the lockfile into `render`.** That would make every dependency bump invalidate the
  note path's receipt, for no gain: the deploy that brings the bump renders in full anyway.
- **Deciding from the git diff between the two commits.** The image carries no `.git`, and the
  receipt already records what the served site was built from, which is the thing that matters
  rather than what the previous image happened to be.
