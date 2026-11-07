# Operating the Fly Machine

The beeatlas Fly app is one Machine with one volume ([ADR 0042](../adr/0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)).
Its one process is [`fly/start.sh`](../../fly/start.sh), which runs Caddy, the write API
and the schedule side by side. This page is what an operator needs that the scripts
don't say on their own.

## What runs, and when

- **Caddy** serves the site, the basemap tiles and the API's host
  ([`fly/Caddyfile`](../../fly/Caddyfile)). If it exits or stops answering `/healthz`,
  the Machine stops and Fly restarts it.
- **The write API** runs when `API_ENABLED` is set (`fly.toml`), under Litestream,
  which replicates the notes store continuously
  ([notes-store-dr.md §6](notes-store-dr.md#6-litestream-continuous-replication-on-fly)).
  If it exits it is restarted after ten seconds, and the site keeps serving meanwhile.
- **The schedule** ([`fly/crontab`](../../fly/crontab)) runs the notes snapshot hourly.
  The nightly has run on Hostess since 2026-11-03 (below).
- **Hostess's nightly** ([ADR 0046](../adr/0046-the-nightly-runs-on-hostess-and-the-machine-keeps-the-interactive-parts.md),
  [hostess-nightly.md](hostess-nightly.md)) reaches the Machine over Fly SSH. It sends
  its build to `/data/staging` under `/data/var/staging.lock`, and, once the cutover has
  switched it on, runs [`data/finish-publish.sh`](../../data/finish-publish.sh) here,
  which takes the publish lock like every other publish. Its log is in Hostess's
  nightly log, not under `/data/log`.
- **On the first boot of a new image,** the site is re-rendered against the last
  published export (`data/publish-code.sh`), so a code deploy shows up without waiting
  for the nightly. It skips the render, logging "code publish skipped", when the build
  receipt shows that nothing a page is built from has changed since the served site was
  rendered ([ADR 0045](../adr/0045-a-deploy-renders-only-when-a-page-input-changed.md));
  the account menu's build id then still names the commit that rendered it. A fresh
  volume has no export yet, so it skips the render and logs why.

## Logs

Fly's log keeps only a start line and an end line for each scheduled job. The full
output is on the volume, one file a day per job, kept 30 days:

```sh
fly ssh console -C 'ls /data/log'
fly ssh console -C 'tail -n 50 /data/log/notes-backup-2026-11-03.log'
```

The nightly's log is on Hostess, `~/beeatlas-nightly/log/nightly-<date>.log`, and holds
the finishing step's output too. `/data/log/nightly-*.log` stops at 2026-11-03.

## Running a job by hand

Jobs run as `app`, never root, so files on the volume stay `app`'s:

```sh
fly ssh console -C 'setpriv --reuid=app --regid=app --init-groups /app/fly/logged.sh notes-backup /app/data/.venv/bin/python /app/data/backup_notes.py'
```

Over Fly SSH, `HOME` stays `/root` after `setpriv`, and `app` cannot read it. Anything
that looks under `~`, such as DuckDB's extensions or nvm, needs `env HOME=/home/app`
before the command; `data/finish-publish.sh` sets it itself. And `-C` runs no shell: send
anything longer than one command as a script, `-C '… sh -s' < script.sh`.

The nightly cannot run here. The image holds only what serving, the API, a note save
and a deploy's render need: no dbt, no ingests, no DuckDB of the pipeline's and none of
its caches (`beeatlas-uibw.7`), and `data/nightly.sh` refuses to start in it. To run the
nightly now, start it on Hostess ([hostess-nightly.md](hostess-nightly.md#running-it)).
[`fly/offline-gate.sh`](../../fly/offline-gate.sh) runs the Machine's own work in the
image, with no network, against a copy of an export: a deploy's render, then a note
save. Run it before changing what the image installs.

## Stopping

`fly machine stop`, a deploy, and Fly's own restarts all send SIGTERM and allow
`kill_timeout`, 300 seconds, before SIGKILL. The schedule is stopped first, then the
API, and Caddy last. A publish cut off part way leaves a site that serves
(`data/merge-swap.sh`); a finishing step cut off after it began installing has withdrawn
the build receipt, so the next note save renders in full.

## Deploying

Deploys run [`fly/deploy.sh`](../../fly/deploy.sh), from the **Fly deploy** workflow
(by hand until cutover) or locally. It builds the image on Fly's builder, then takes
the publish lock on the Machine before replacing it. A running publish (a note save, or
the finishing step of Hostess's nightly) therefore finishes first, and none can start
during the switch. A deploy that lands while Hostess is building makes that night's
build fail its check on the Machine, and Hostess builds again at the new commit. The new Machine's first boot re-renders the site under the
same lock.

## The basemap

The basemap archives live beside the site root in `/data/basemap`, which no publish
touches. They are backed up under `basemap/` in the pipeline backup bucket, so a
fresh volume gets them back by publishing the current two. Each one is fetched from
the backup, since nothing is staged on the Machine:

```sh
fly ssh console -C 'setpriv --reuid=app --regid=app --init-groups bash -c "cd /app && data/publish-basemap.sh wa-20260801.pmtiles && data/publish-basemap.sh wa-terrain-20260802.pmtiles"'
```

Substitute the names in the backup's `basemap/manifest.json`.

A new archive is published the same way. Build it on a workstation
(`data/build-terrain-basemap.sh` says why the Machine is the wrong place), upload it
to `basemap/<archive>` in the pipeline backup bucket, then run `publish-basemap.sh`
with its name as above.
