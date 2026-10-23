# Cutover: maderas to Fly

The order for moving beeatlas.net, www and api.beeatlas.net from maderas to the Fly
Machine (beeatlas-j65i, [ADR 0042](../adr/0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)).
Each step says what it protects against. The trial
([fly-trial.md](fly-trial.md)) passes before any of this starts.

## A day ahead

1. **Lower the TTLs.** In [`infra/lib/beeatlas-stack.ts`](../../infra/lib/beeatlas-stack.ts),
   give the apex and `www` A/AAAA records and `api`'s A record
   `ttl: cdk.Duration.seconds(60)`, and `pnpm run deploy` from `infra/`. CDK's
   default is 30 minutes; a day later, every cached answer has expired, so the flip
   reaches resolvers within a minute and so does a rollback.
2. **Create the app, unrouted.** `fly apps create beeatlas`; `fly volumes create
   beeatlas_data --region sea --size 20`; the secrets named in
   [`fly/Dockerfile`](../../fly/Dockerfile) with `fly secrets set`, **except the
   pipeline's AWS key**, and `HEALTHCHECK_URL` set empty; then the **Fly deploy**
   workflow. From now on the Machine runs its own nightly at 03:00, beside maderas's.
   Without the key its backup refuses rather than overwrite production's DuckDB
   backup with its own, and with the empty URL it never reports to production's
   monitor. On an empty volume the Machine serves `/healthz` and nothing else, and
   the API waits for a notes store.
3. **Issue the certificates before the flip.** `fly certs add` for `beeatlas.net`,
   `www.beeatlas.net` and `api.beeatlas.net`; `fly certs show <host>` gives each one's
   `_acme-challenge` CNAME target. Add the three as `route53.CnameRecord`s in the
   stack, deploy it, and wait for `fly certs check <host>` to say Issued. Without
   this, the certificate is requested only after DNS points at Fly, which is a window
   of TLS errors at the moment of cutover. `http://www.beeatlas.net` is covered by
   the same certificate: Fly redirects plain HTTP (`force_https`).
4. **Allocate addresses.** `fly ips allocate-v6`, and `fly ips allocate-v4 --shared`
   (or dedicated). Note them for step 8.
5. **Bring the volume's state across, from S3 rather than through anyone's home
   connection.** Every piece except the notes store already has a verified offsite
   copy: the DuckDB and the taxonomy cache (the nightly's backup), and the basemap
   archives (`publish-basemap.sh`'s). On the Machine, as `app`, restore the DuckDB
   (`data/s3_backup.py restore … db/beeatlas.duckdb /data/var/beeatlas.duckdb`) and
   the taxonomy files, and publish the two current basemap archives, which fetches
   them ([fly-machine.md](fly-machine.md), "The basemap"). These need the pipeline's
   AWS key: pass it on those commands alone (`AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…`
   in the ssh session), not as a secret, so the Machine's own nightly still cannot
   write production's backup. Then run the nightly by
   hand on the Machine. It builds the export and the site from empty Stelis state,
   and its notes harvest finds no store yet, so its notes pages are empty until step 7.

## The cutover

6. **Freeze writes on maderas.** Set `WRITES_ENABLED=false` in the
   `beeatlas-api` systemd unit and restart it. From here a note posted to maderas is
   refused, not stranded; laggy resolvers that keep hitting maderas for a minute get a
   clear 503.
7. **Move the notes store.** On maderas, `data/backup_notes.py`: its
   `sqlite3.Connection.backup()` snapshot, never the file beside its live WAL, goes to
   `s3://<AuthoritativeBackupBucket>/backups/`. On the Machine, download and gunzip that
   snapshot to `/data/notes/notes.db` as `app`, then `fly machine restart`. The API
   starts under Litestream and the replica begins from this store. Run
   `fly/restore-drill.sh` to confirm the replica matches it.
8. **Flip DNS.** Point the apex, `www` and `api` records at the step-4 addresses in
   the stack and deploy it. Before that, `curl --resolve beeatlas.net:443:<v4>` against
   the Machine, and `fly/serving-matrix.sh https://beeatlas.net` once it resolves to
   Fly, which must pass 18 of 18. Then the gate from beeatlas-cjyz: sign in, a write
   check, a note write, and its synchronous publish.
9. **Hand the nightly over.** Remove maderas's crontab line, then give the Fly app the
   pipeline's AWS key (`fly secrets set AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…`)
   and unset the empty `HEALTHCHECK_URL` (`fly secrets unset HEALTHCHECK_URL`), in that
   order: two nightlies holding the key would upload their DuckDBs to the same backup
   key. From here the Machine's nightly backs up and pings as maderas's did. Remove
   maderas's hourly notes snapshot too, and give the Machine `NOTES_BACKUP_BUCKET` so
   its own snapshot job runs. Both jobs write to the same bucket at the top of the
   hour, and the restore procedure takes the newest file, so maderas's copy of the
   frozen store could win over the Machine's and lose every note written since the
   freeze. Run the Machine's snapshot once by hand (`data/backup_notes.py`, as the
   `app` user) and check the new file in the bucket.
10. **Deploy on push.** Give the Fly deploy workflow `push: branches: [main]`.

## Rollback

DNS back to maderas (the stack's records, deployed; a minute with the lowered TTLs)
covers reads. **Notes written on Fly must be copied back**, or they are lost in the
scramble: set `WRITES_ENABLED=false` on the Machine (`fly secrets set`, which
restarts it), take a snapshot there (`data/backup_notes.py`), restore it over
maderas's store with maderas's API stopped, then re-enable writes on maderas and
restore its nightly's crontab line.

`beeline.beeatlas.net` also points at maderas, but it is beeline's app (already on
Fly) and moves on its own schedule; this cutover leaves its records alone.
