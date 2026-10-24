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
- **The schedule** ([`fly/crontab`](../../fly/crontab)) runs the nightly at 03:00
  Pacific and the notes snapshot hourly, as maderas did.
- **On the first boot of a new image,** the site is re-rendered against the last
  published export (`data/publish-code.sh`), so a code deploy shows up without waiting
  for the nightly. A fresh volume has no export yet, so it skips that and logs why.

## Logs

Fly's log keeps only a start line and an end line for each scheduled job. The full
output is on the volume, one file a day per job, kept 30 days:

```sh
fly ssh console -C 'ls /data/log'
fly ssh console -C 'tail -n 50 /data/log/nightly-2026-10-23.log'
```

## Running a job by hand

Jobs run as `app`, never root, so files on the volume stay `app`'s:

```sh
fly ssh console -C 'setpriv --reuid=app --regid=app --init-groups /app/fly/logged.sh nightly bash /app/data/nightly.sh'
```

The nightly takes the publish lock, so it waits for a running note publish and never
interleaves with one.

## Stopping

`fly machine stop`, a deploy, and Fly's own restarts all send SIGTERM and allow
`kill_timeout`, 300 seconds, before SIGKILL. The schedule is stopped first, and a
running nightly gets the signal itself, so its EXIT trap still uploads the offsite
backup. The API stops next, and Caddy last.

## Deploying

Deploys run [`fly/deploy.sh`](../../fly/deploy.sh), from the **Fly deploy** workflow
(by hand until cutover) or locally. It builds the image on Fly's builder, then takes
the publish lock on the Machine before replacing it. A running nightly therefore
finishes first, which the workflow waits up to two hours for, and no note publish can
start during the switch. The new Machine's first boot re-renders the site under the
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
