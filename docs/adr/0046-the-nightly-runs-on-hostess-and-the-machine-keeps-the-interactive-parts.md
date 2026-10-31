# 0046 — The nightly runs on Hostess, and the Machine keeps only the interactive parts

Date: 2026-10-30
Status: Accepted
Supersedes the pipeline half of [0042](0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)
("the API does not split from the pipeline") and, with it, the parts of
[0044](0044-what-the-pipeline-writes-lives-on-the-volume.md) that put the pipeline's caches on the
volume. Keeps [0042](0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)'s synchronous note
publish, [0017](0017-scoped-note-render.md)'s scoped render and
[0045](0045-a-deploy-renders-only-when-a-page-input-changed.md)'s deploy render. Work:
`beeatlas-uibw`.

## Context

The nightly of 2026-10-30 built the data and then published nothing. The Stelis pin it ran under
had changed Stelis's own task code, so every task re-ran: about 1,000 CPU-seconds, against about
700 on an ordinary night. That used up the burst allowance of the Machine's two shared CPUs, Fly
throttled it, and the JavaScript test gate that runs last took 660 s instead of 58 s and failed on
timeouts (`beeatlas-nm4n`). Any change that forces a full rebuild will do the same.

The same work measured the same morning on Hostess, Peter's workstation (a Ryzen 5 5600 with
30 GB), against production's DuckDB:

| Step | Hostess | Machine, ordinary night | Machine, 2026-10-30 |
|---|---|---|---|
| Data build, every task re-run | 301 s | — | 1,096 s |
| Data build, unchanged tasks skipped | 163 s | 585 s | — |
| Full site build | 10 s | 22 s | 283 s |
| `pnpm run test:data` | 13 s | 59 s | 685 s, failed |

So the Machine is sized and paid for all day to run a job that needs its CPU for ten minutes a
night, and it still runs that job three to four times slower than a computer that is already
on.

0042 kept the pipeline on the Machine because a note save runs a Stelis build, an Eleventy render
and a merge-swap before it answers, and so needs the Stelis state, the export, the checkout and
the site root on one filesystem. Reading what that build actually is shows that only a small part
of the pipeline is involved. The scoped build (`--from notes-harvest notes`) runs one task,
`notes-harvest`, which reads `collectors.json` from the export and the live `notes.db` and writes
`notes/<species>.json`. The render reads the export, the last full build's `_site`, and the build
receipt and Vite manifest under `.cache/`. No note save touches the DuckDB, dbt, an ingest or a
source credential. No task reads the `notes` artifact, so the rest of the graph can be built
without it.

## Decision

**The nightly runs on Hostess, from the same Stelis graph, with a state dir of its own.** The
graph stays one `beeatlas` project in the Stelis repository. Hostess builds every target except
`notes` into its own state dir. The Machine keeps a state dir of its own for the same project,
which note saves and the finishing step below share, so each state dir still has a single
writer. No change to Stelis or to the graph is needed. Splitting the graph into two projects
([Stelis ADR 0019](https://github.com/rainhead/stelis/blob/b922c1eb34171fcffe6366d84d0d89958d52e696/docs/adr/0019-one-state-dir-per-concurrent-build.md))
and moving it into this repository
([Stelis ADR 0020](https://github.com/rainhead/stelis/blob/b922c1eb34171fcffe6366d84d0d89958d52e696/docs/adr/0020-a-projects-graph-lives-in-its-repo.md))
are left for when the graph next changes, which is when ADR 0020 said beeatlas would move.

**Hostess builds at the commit the Machine is running.** A systemd user timer starts the run at
03:00 Pacific, with lingering enabled so it runs while nobody is logged in; a night missed while
Hostess was off runs once at the next boot, at low priority. The run reads the Machine's `GITHUB_SHA` (the manifest's `build_id` names
the commit that last rendered, not the one deployed) and checks out that commit, detached, in a
checkout of its own, never the development checkout, with Stelis at `fly/stelis-commit`. All of
its state lives outside that checkout, because the build receipt's deploy component counts
untracked files in it. The DuckDB, the Stelis state dir, the raw caches and the integration
baseline live on Hostess, and the DuckDB and the Stelis state dir are backed up to the pipeline
bucket.

**Hostess never holds the notes store.** At the start of the run it copies the Machine's
`export/notes/` into its own export, and renders the site from that.

**Every gate runs on Hostess, before anything is sent.** The integration gate, the full site build
and `test:data` run there. A failed gate sends nothing.

**Hostess sends the build with rsync, then runs the finishing step on the Machine.** The connection
is a Fly SSH tunnel opened with a token scoped to SSH on this app alone (`flyctl tokens create
ssh`). rsync runs on the Machine as the `app` user, preserves modification times to the
sub-second (the receipt compares them), and writes into a staging directory on the volume: the
export, `_site`, `build-log.html`, and the build receipt and Vite manifest from `.cache/`. Then,
over the same session, Hostess runs the finishing step as `app`. Under the publish lock it runs
`--from notes-harvest notes` in the Machine's state dir against the live `notes.db`, re-renders the
species whose notes moved since that state dir last looked, and merge-swaps. The species it
re-renders are a superset of those whose notes changed while the nightly ran, so a note saved
during the run is published from the live store and is not overwritten by Hostess's copy.

**The finishing step's exit code is the publish's outcome, and Hostess acts on it.** Hostess
advances the integration baseline, records Stelis's publish receipt (`--mark-publish`) and sends
the healthcheck ping only when the finishing step reports a publish. If the Machine was deployed to
a new commit after Hostess read it, the staged tree fails the receipt check, and the finishing step
exits with a code of its own instead of rendering in full. Hostess then checks out the new commit,
rebuilds and sends again, which costs it seconds and would cost the Machine minutes of the
throttling this decision removes. A full render on the Machine stays only as a last resort.

**The image keeps only what serving and a note save need:** Caddy, the API, Litestream, Racket and
Stelis, the DuckDB CLI with `sqlite_scanner` (the notes store's per-species keys are read through
it, and without them every note save would harvest every species), Node and Eleventy for the
render, and the Python that `notes_harvest` and the API import. dbt, the ingests' Python
dependencies and credentials, the nightly's schedule entry and the pipeline backups leave it. The
Machine's size is chosen afterwards by measurement; a note save whose receipt check fails falls
back to a full render, so that render's memory peak sets the floor.

## Consequences

- If Hostess is off at 03:00, the nightly waits for the next boot, and the data is older by
  however long that takes. Note saves, sign-in and serving do not depend on Hostess. The
  healthcheck ping moves to Hostess and is sent only after a publish, so a late or failed night
  still alerts.
- Hostess holds a Fly token that can open SSH to this app, as root, and so can read `notes.db` and
  the API's secrets. A compromise of Hostess is therefore a compromise of production. The scripts
  drop to the `app` user, but the token itself does not limit that. It also holds the Ecdysis
  credentials, a key for the pipeline bucket alone (`beeatlas-hostess-pipeline`), and the
  operator's key (IAM user `rainhead`), which deploys this app through CDK's bootstrap roles. That
  user keeps, by choice, a hand-made inline policy granting `s3:*` on every object in the
  account, so Hostess *can* read the notes store's backups: "Hostess never holds the notes store"
  is true of what the nightly copies, not of what its credentials allow. The Fly secrets for the
  ingests are removed once nothing on the Machine reads them.
- Before the Machine stops running the pipeline, its caches move to Hostess: the raw downloads,
  the Ecdysis ZIP (behind sign-in at the source), the geography and Burke caches, dlt's loader
  state and the integration baseline. The Machine's old Stelis state dir is archived, not left in
  place.
- The Machine keeps a copy of the export, because a deploy's render and a note's render both read
  it.
- The production nightly now depends on a workstation's operating system, updates and power. That
  is a step back in operational independence from 0042, taken knowingly: what fails is freshness,
  which the site already tolerates for a day, and not anything a user does.

## Rejected alternatives

**A larger or performance-class Machine.** It would end the throttling, but it pays all day for CPU
the nightly uses for minutes, and it would still be slower than Hostess.

**Make the note publish asynchronous** (0042's first rejected alternative). Still rejected, on 0042's
product grounds: an author saves a note and reloads to see it live. This decision keeps that.

**Hostess publishes into the site root directly**, building notes from a copy of the store and
sending the result straight to where Caddy serves it. It keeps the Machine simpler, but a note saved
after Hostess took its copy would be overwritten by the older page until the next save or nightly.

**Send the build through S3** (Hostess uploads, the Machine pulls). It needs no inbound connection
to the Machine and survives either side being down, and Hostess holds a bucket key for backups in
any case. But it uploads whole objects where rsync sends only changed files, and the publish's
outcome would need a channel of its own back to Hostess, where over SSH it is the finishing step's
exit code.

**Join the Machine to the tailnet** and rsync over it. It matches how Hostess shares other things,
but it adds `tailscaled` to the image and an auth key to the Fly secrets, for a connection Fly's
own SSH already provides.

**Split the graph and move it into this repository first.** That gives the cleaner model sooner,
but none of it is needed for the move: one project with two state dirs keeps each state dir to one
writer. It would put a Stelis change (a default for `--project` once no graph is registered) and a
cross-repository move on the critical path. Deferred, not rejected.

**Run the pipeline in GitHub Actions.** Rejected for 0042's reason: Stelis is fast because its state
and the DuckDB stay warm between runs, and CI would restore and save them every night.
