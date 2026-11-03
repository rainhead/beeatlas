# Operating the nightly on Hostess

The nightly data build runs on Hostess, Peter's workstation, not on the Fly Machine
([ADR 0046](../adr/0046-the-nightly-runs-on-hostess-and-the-machine-keeps-the-interactive-parts.md)).
A systemd user timer starts [`infra/hostess/nightly.sh`](../../infra/hostess/nightly.sh)
at 03:00 Pacific. It checks out the commit the Machine is running and runs
[`data/nightly.sh`](../../data/nightly.sh) from it, with the layout below. This page is
what an operator needs that the scripts don't say on their own.

A run that passes every gate sends its build to `/data/staging` on the Machine's volume
and checks it there against the Machine's checkout with the build receipt
([`data/send-build.sh`](../../data/send-build.sh)). With `FINISH_PUBLISH=1` in
`nightly.env`, the Machine then publishes it, with the notes from its live store
([`data/finish-publish.sh`](../../data/finish-publish.sh)). Without that line the run
sends and checks only, which is how the parallel trial ran (`beeatlas-uibw.6`) while the
Machine's own nightly still published. Hostess has published the nightly since the
cutover on 2026-11-03, and the Machine's schedule no longer runs one.

The operator page, `/build-log.html`, is the nightly's, sent from Hostess when
`data/nightly.sh` exits, failed runs included. A run that fails before that script
starts, in the wrapper (reading the Machine's commit, or the first `git fetch`), sends no
page, so the one served is still the last run's; its failure is only in
`log/nightly-<date>.log`. The Machine's own builds (note saves and the finishing step)
have theirs at `/build-log-notes.html`.

## What a run's last lines mean

- `published on the Machine` — the site serves tonight's build. Only this advances the
  integration baseline, marks the build published in Stelis and pings the healthcheck.
- `not published: FINISH_PUBLISH is not set` — sent and checked, no more, as in the
  trial. Since the cutover this means `nightly.env` has lost its `FINISH_PUBLISH=1`.
- `the Machine moved from <sha> to <sha> during the build; building again` — a deploy
  landed mid-run, so the staged build failed its check. The run builds once more at the
  new commit; a second mismatch fails the run.
- `a lock on the Machine was held too long` — something held the publish lock for ten
  minutes. Nothing changed on the Machine; the next night publishes.
- `the Machine did not publish (outcome 'failed')` — the finishing step's own output is
  in the log above, and in `var/finish-publish.log`. If it failed after it began
  installing, it withdrew the build receipt, so the next note save renders in full.
- `the call to the Machine failed (rc=…); trying again in 30s` — Fly's API or the
  tunnel failed; the call is retried three times over about four minutes.

## Cutover

Done on 2026-11-03, in this order:

1. Remove the nightly from the Machine's schedule (`fly/crontab`) and deploy
   (`beeatlas-uibw.7`). This comes first: the Machine's nightly holds the publish lock
   for its whole run, and a Hostess run started at the same hour would wait on it.
2. Add `FINISH_PUBLISH=1` to `nightly.env`, and replace the trial's `HEALTHCHECK_URL=`
   and `SKIP_PIPELINE_BACKUP=1` with the backup settings described below.
3. Remove the timer's trial drop-in, `~/.config/systemd/user/beeatlas-nightly.timer.d/trial.conf`,
   so the run starts at 03:00.

## Layout

Everything lives under `~/beeatlas-nightly`, laid out like the Machine's volume
(`fly/Dockerfile` names the same paths under `/data`):

- `beeatlas/`, `stelis/` — checkouts that belong to the nightly. Each run checks them
  out detached, with `--force`; never work in them.
- `var/` — the DuckDB, the export, the integration baseline and the Stelis state dir.
- `raw/`, `ecdysis-zip/`, `dlt/`, `dbt-target/`, `cache/`, `site/` and the other caches,
  reached from the checkout through symlinks the wrapper makes.
- `notes/empty.db` — an empty notes store, remade every run. Hostess never holds the
  real one: the run takes the Machine's published `notes/` instead.
- `log/nightly-<date>.log` — the whole run's output.

Secrets and per-host switches are in `~/.config/beeatlas/nightly.env` (mode 600): the
Ecdysis sign-in, the Fly token below, `FINISH_PUBLISH=1`, and `PIPELINE_BACKUP_BUCKET`
with the `beeatlas-hostess-pipeline` key (`infra/lib/beeatlas-stack.ts`; the key is made
outside CDK). A second host on trial instead has `HEALTHCHECK_URL=` and
`SKIP_PIPELINE_BACKUP=1`, and no `FINISH_PUBLISH`.

## Reaching the Machine

Every call the run makes to the Machine goes through `flyctl ssh console`: reading its
`GITHUB_SHA`, copying its `notes/`, and sending the build, which runs rsync with
[`data/fly-rsh.sh`](../../data/fly-rsh.sh) as its remote shell. They are authorised by
`FLY_API_TOKEN` in `nightly.env`, a token that can open SSH to the beeatlas app and
nothing else (`flyctl tokens create ssh -a beeatlas`; listing apps with it is refused).
The value contains a space, so it is written in double quotes. SSH arrives as root, which
is why each command drops to the `app` user with `setpriv`, and why a compromise of
Hostess is one of production (ADR 0046's consequences). To replace the token, create a
new one, put it in `nightly.env`, and revoke the old one by its name, `hostess nightly
(beeatlas-uibw.4)` (`flyctl tokens list`, `flyctl tokens revoke`).

`flyctl ssh console -C` runs its command without a shell. Send anything longer than one
command as a script on standard input, `-C 'sh -s' < script.sh`; see
[lessons-learned](../lessons-learned.md) for what a quoted script did instead.

## AWS on Hostess

Two identities, kept apart on purpose:

- **`beeatlas-hostess-pipeline`**, in `nightly.env`: the nightly's backups. It reaches
  the pipeline bucket and nothing else, not the bucket that holds the notes store's
  backups.
- **`rainhead`**, as the AWS profile `beeatlas-operator`: an operator running
  `cdk diff`/`cdk deploy` and rotating the `beeatlas-*` users' keys. Its policy,
  `beeatlas-operator` (`infra/lib/beeatlas-stack.ts`), allows assuming CDK's bootstrap
  roles and managing those keys, so a deploy works and most other calls are refused.
  It is not small: CloudFormation's execution role has `AdministratorAccess`, and the
  user's hand-made inline policy `access-rainhead-files` grants `s3:*` on every
  object in the account. Never name this profile `beeatlas`, which `data/nightly.sh`
  would use for backups in preference to the pipeline key.

## Setting up a host

1. Clone `beeatlas` and `stelis` into `~/beeatlas-nightly`; the steps below use these
   checkouts.
2. Tools: Racket with Stelis's packages (`~/beeatlas-nightly/stelis/scripts/preflight.sh`
   names any missing), uv, nvm with the `.nvmrc` Node and
   `npm install -g pnpm@<packageManager>` under it (Node 26 has no corepack), flyctl
   signed in, and DuckDB's `spatial` and `sqlite_scanner` extensions installed for the
   pipeline's Python DuckDB (the pipeline never downloads them; `fly/Dockerfile` shows
   the command).
3. Seed `~/beeatlas-nightly` from the Machine's volume while the publish lock is free:
   `raw ecdysis-zip geography-cache burke-cache dlt dbt-target var/beeatlas.duckdb
   var/baseline var/stelis var/export`, as one `tar` through `flyctl ssh console`, under
   `flock /data/var/publish.lock` as the `app` user. Or restore the DuckDB and the Stelis
   state from the pipeline bucket (`db/`, `stelis/`) with `data/s3_backup.py restore`.
   Then write `nightly.env`, including the Fly token (above).
4. Install the units and turn on lingering, so the timer runs with nobody logged in.
   Copy them, from main, rather than linking them into the checkout: each run moves the
   checkout to the Machine's commit, which can be older than the units. For the same
   reason the service runs a copy of main's `nightly.sh` from outside the checkout.
   Copy them again when they change on main.

   ```bash
   mkdir -p ~/.config/systemd/user
   for u in service timer; do
     git -C ~/beeatlas-nightly/beeatlas show origin/main:infra/hostess/beeatlas-nightly.$u \
       > ~/.config/systemd/user/beeatlas-nightly.$u
   done
   systemctl --user daemon-reload && systemctl --user enable --now beeatlas-nightly.timer
   loginctl enable-linger
   ```

A host on trial beside one that publishes should start later than 03:00, with a timer
drop-in setting another `OnCalendar=` (the trial used 04:30): the publishing run holds
the Machine's publish lock while it finishes, and the trial copies the Machine's `notes/`
under that lock, waiting at most ten minutes.

## Running it

- Now: `systemctl --user start beeatlas-nightly.service`; the log is in `log/`.
- A change that is not deployed yet: commit it, fetch the commit into
  `~/beeatlas-nightly/beeatlas`, and run the wrapper from the development checkout with
  `NIGHTLY_COMMIT=<sha>`, as a transient unit so it outlives the shell:
  `systemd-run --user --collect -p EnvironmentFile=$HOME/.config/beeatlas/nightly.env
  --setenv=NIGHTLY_COMMIT=<sha> /bin/bash $HOME/dev/beeatlas/infra/hostess/nightly.sh`
  (absolute: a transient unit does not start in the current directory). Such a run
  backs up nothing and sends no healthcheck ping, whatever `nightly.env` says. Never
  send its build to the Machine.
- A run missed while Hostess was asleep or off happens once when it wakes or next boots
  (the timer is `Persistent`), at `Nice=10`. A run made up on wake starts before the
  network is back, so the service retries its first `git fetch` for up to five minutes
  before failing. Until the run succeeds the data is older, and once the healthcheck is
  switched on, its late ping raises the alarm.
