# A trial nightly on Fly, beside production

Before cutover, the Fly Machine runs the nightly while maderas still serves
production (beeatlas-f21l). The trial has two jobs. It shows the nightly runs on the
Machine: its time, its memory, and a build from empty Stelis state. And it shows the
image builds what maderas builds. It must not touch production on the way, and an
unconfigured trial would, in four places:

| Hazard | What prevents it |
|---|---|
| The nightly's backup uploads its DuckDB over production's backup, under the same key in the same bucket, and the EXIT trap runs even on failure. | Give the trial no AWS key. The backup then refuses ("no AWS credentials") and the run exits 74 after publishing, as the offline gate expects. |
| The nightly pings production's healthcheck, so a trial's success would mask production's failure. | `HEALTHCHECK_URL=` set and empty. Since this bead, an empty value disables the ping instead of falling back to production's. |
| A note written to the trial is stranded when the trial ends. | `API_ENABLED=0`: no API, so nothing can be written. The trial's notes store is a snapshot copy, for the harvest to read. |
| A copied `var/stelis/` makes unchanged tasks skip, so the run proves the Machine can store the export, not build it. | Start the volume with no Stelis state, so every task runs. Seed the DuckDB and the notes store, nothing else. |

## Running it

1. Create a scratch volume. Copy in a consistent DuckDB copy and a notes-store snapshot
   (`sqlite3.Connection.backup()`, never the file beside its WAL):
   `/data/var/beeatlas.duckdb` and `/data/notes/notes.db`.
2. Run the Machine with the trial's environment and the loaders' secrets
   (`SOURCE_DATE_EPOCH` is left to the nightly):

   ```sh
   fly machine run <image> --volume <scratch>:/data \
       -e API_ENABLED=0 -e HEALTHCHECK_URL= -e PIPELINE_BACKUP_BUCKET=trial-no-backup \
       -e SOURCES__ECDYSIS__USERNAME=… -e SOURCES__ECDYSIS__PASSWORD=…
   ```

   Then start the nightly by hand (docs/runbooks/fly-machine.md, "Running a job by
   hand"), and keep its log (`/data/log/nightly-<date>.log`) and the Machine's memory
   and time for the run. The memory figure decides `fly.toml`'s `[[vm]]`.
3. It passes when the log ends with the publish and the backup's refusal:
   `=== pipeline complete`, then `s3_backup: no AWS credentials`, exit 74.

## Comparing the bytes

The two nightlies cannot match byte for byte. They run at different instants, so the
loaders read sources that have moved in between, and each stamps its own clock. So
the comparison holds the inputs still instead. On a copy of one maderas build's own
state, [`fly/parity.sh`](../../fly/parity.sh) rebuilds everything from dbt onward in
the image, with no network and that build's clock and commit, and compares every
file:

```sh
# the state dir: beeatlas.duckdb, export/, raw/taxa.csv.gz, raw/taxa_cache.json,
# notes.db, all copied from maderas after one nightly; the epoch is that build's
# build-epoch in var/stelis/publish.log, the commit its beeatlas checkout's HEAD
fly/parity.sh <image> <state dir> <epoch> <commit>
```

On 2026-10-22, against maderas's build 146, 1,285 of 1,290 files were byte-identical.
The other five were `occurrences.db` and its compressed siblings. Their rows are
identical, but SQLite writes its own library version into the file header, and the
image's Python bundles a newer SQLite than maderas's. The script checks each such
difference rather than assuming it, and exits non-zero on any it cannot explain. A
single byte appended to a reference file was reported as unexplained.
