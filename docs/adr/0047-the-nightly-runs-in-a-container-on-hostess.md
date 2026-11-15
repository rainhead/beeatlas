# 0047 — The nightly runs in a container on Hostess

Date: 2026-11-14
Status: Accepted
Amends [0046](0046-the-nightly-runs-on-hostess-and-the-machine-keeps-the-interactive-parts.md), which
moved the nightly to Hostess but ran it from host checkouts with host-installed tools. Keeps
everything else 0046 decided: Hostess builds, the Machine checks the build against its own code and
publishes it. Work: `beeatlas-n1o7`; the failure that prompted it: `beeatlas-ey8e`.

## Context

Under 0046 the nightly ran from two git checkouts under `~/beeatlas-nightly` (BeeAtlas, and Stelis
at `fly/stelis-commit`) with whatever Hostess had installed: Racket and its packages, uv, nvm and
node, pnpm, DuckDB's extensions, flyctl. Hostess is also a development machine, and those tools were
shared with development.

From 2026-11-08 to 2026-11-14 every nightly stopped at the Stelis test gate, so nothing was built or
published for six days. Racket's installation-scope link for the collection `stelis` pointed at
`~/dev/stelis/src`, the development checkout. Stelis's `project-module-test.rkt` loads a project
module by path, and that module requires `stelis/project` through the collection, so it got the
development checkout's `project.rkt`. The engine itself ran from the nightly's checkout, so the
process held two copies of the module, and a project value made by one is not a project to the other.
One Racket installation can link the collection to only one checkout. The real build was not affected
(beeatlas's graph is registered in Stelis and loaded by a relative path), only the test that loads a
project by path.

That is one instance of a wider gap: the nightly's toolchain was not the Machine's. The Machine runs
an image built from `fly/Dockerfile` with node, pnpm, uv, CPython, Racket, Stelis and the DuckDB CLI
all pinned. On Hostess each of those was whatever had been installed, so a version move had to be
repeated by hand there, and a second host meant working through the runbook's setup list. The move
to DuckDB 2.0, which changes the Python library and the CLI together, would have been the next such
move.

## Decision

**The nightly runs in an image built from a `nightly` target of `fly/Dockerfile`, at the commit the
Machine runs.** The file now has a `base` stage, which is everything the Machine's image had up to
its `COPY . /app/`, and two targets on it:

- `machine`, the rest of the Machine's image, unchanged. `fly.toml` (`build-target`) and the
  `fly-image` workflow name it, so the order of the stages decides nothing.
- `nightly`, which adds what only the pipeline runs: the default dependency groups (dlt, dbt, the
  ingests, pytest), DuckDB's `spatial` extension for the Python library, `data/`'s node tree
  (mapshaper), flyctl, sqlite3 and tini, then the commit and the links into `/data`.

The nightly's toolchain is therefore the Machine's toolchain plus the pipeline: the same node, pnpm,
uv, CPython, Racket, compiled Stelis and DuckDB CLI, from the same pins. Stelis's image carries its
own source, tests and collection link (Stelis ADR 0017), so inside the container the collection can
only be the engine that runs.

**Hostess builds the image each night, from `git archive` of the Machine's commit.**
[`infra/hostess/nightly.sh`](../../infra/hostess/nightly.sh) reads the Machine's `GITHUB_SHA`, builds
`beeatlas-nightly:<sha>` unless it already exists, and runs it with `~/beeatlas-nightly` mounted at
`/data`. Building from the archive, not the working tree, means nothing git does not track reaches the
image. Layers up to the dependency installs come from the build cache, so an ordinary night rebuilds
only the layers from `COPY . /app/` on.

**`~/beeatlas-nightly` is laid out as the Machine's volume, and is the container's `/data`.** What the
pipeline writes inside the checkout is a symlink into `/data`, made in the image: the folders the host
wrapper used to link, plus the three CSV files Stelis's gates write into `data/` and dbt's logs, which
the old checkout simply kept between nights. flyctl's config folder is kept there too. The image's
`app` user is uid and gid 1000, which is Hostess's user, so the files stay that user's; the wrapper
refuses to run otherwise.

**Secrets pass into the container by name.** systemd reads `nightly.env` into the wrapper's
environment, and the wrapper passes each name it finds in that file, plus a fixed list of switches an
operator may set for one run, as `docker run -e NAME`. Not `--env-file`, which keeps the file's quotes
as part of a value, and `FLY_API_TOKEN` is quoted because it contains a space. Nothing else from the
host's environment reaches the run.

**A run that is still going is waited for, not removed.** The container's name comes from the layout's
path, so a trial against a copy and the 03:00 run never collide. A second run for the same layout waits
for the first to finish, as the host nightly queued on the publish lock.

**Stopping reaches the whole run.** The container is not in the systemd unit's control group; only the
docker CLI is. systemd's stop signal reaches the CLI, which passes it to the container's `tini -g`,
which passes it to every process there, as `data/nightly.sh`'s signal handler expects. The unit waits
up to fifteen minutes for the backups, then `ExecStopPost` stops any container still running with ten
minutes' grace, so a run cannot outlive its unit holding the publish lock.

**CI builds both targets.** The `fly-image` workflow builds the nightly target on every change and runs
[`fly/nightly-smoke.sh`](../../fly/nightly-smoke.sh), which checks that the pipeline's tools load, so a
change that breaks the nightly's image fails on the pull request rather than at 03:00.

## Alternatives considered

- **Give the nightly its own Racket link and leave the rest on the host:** a second Racket prefix,
  a separate user package directory (`PLTADDONDIR`), or relinking the collection at the start of each
  run. Each fixes the failure that prompted this, and none fixes the toolchain gap behind it; the next
  shared tool (DuckDB, node) would fail the same way. Relinking also breaks the development checkout
  every night.
- **A standalone Stelis executable (`raco exe`).** The gate runs Stelis's test suite from source with
  `raco test`, so the nightly would need a Racket installation and the source anyway. And a project
  module loaded by path would still have to resolve `stelis/project` to the executable's embedded
  copy, which is the same two-copies problem in another form.
- **CI publishes a nightly image per commit, and Hostess pulls it.** More moving parts (a registry,
  credentials on Hostess, retention) for a build that Hostess's cache makes cheap, while one host runs
  the nightly. Worth revisiting with a second host.
- **A separate Dockerfile for the nightly.** It would have to repeat the base steps, and the two would
  drift. One file with two targets shares them by construction; the cost is that the Machine's image
  must be shown unchanged by a split, which it was (below).

## Consequences

- Hostess needs git, docker and flyctl (to read the Machine's commit), and nothing else of the
  pipeline's. The Stelis checkout under `~/beeatlas-nightly` and the host's Racket, uv, nvm and DuckDB
  extensions are no longer the nightly's.
- A toolchain move, such as DuckDB 2.0, is one commit: the pins in `fly/Dockerfile` and the lockfiles
  move, and the nightly and the Machine both get them from the next deploy.
- An ordinary night spends a minute or two more building the image's last layers. A night after a
  lockfile change rebuilds the dependency layers too.
- Docker's build cache and the last two nightly images are kept on Hostess (the wrapper prunes the
  rest, and the cache beyond 20 GB).
- The Machine's image is unchanged by the split: built from `main` and from the change with the same
  arguments, the two machine images had identical settings (environment, command, user, working
  directory) and differed only in the files the change edits (2026-11-14).
- Rolling back means reverting the change and deploying it before the next run. The wrapper is
  main's, and an older wrapper runs the nightly from host checkouts again, so the host's tools stay
  installed for two weeks after the cutover.
