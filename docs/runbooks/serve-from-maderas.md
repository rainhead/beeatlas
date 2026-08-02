# Serve beeatlas.net from maderas

Cutover runbook for stelis ADR 0007 (st-bgy): beeatlas.net moves from
S3 + CloudFront to an Apache vhost on maderas serving a root that the
nightly (and later the note-write path, st-nee) publishes into. The vhost
config is tracked at [`infra/maderas/beeatlas.net.conf`](../../infra/maderas/beeatlas.net.conf);
the publish logic lives in [`data/nightly.sh`](../../data/nightly.sh)
(`SITE_ROOT`).

> **Model Y (ADR 0007 Amendment) layout** — `/var/www/beeatlas.net` follows the
> htdocs+var convention: `htdocs/` is the DocumentRoot the nightly merge-swaps
> into; the sibling `var/` holds pipeline state (`beeatlas.duckdb`, `export/`,
> `baseline/`, `publish.lock`) and is never web-reachable. §6 has the one-time
> migration from the flat pre-Model-Y root.
>
> A third sibling, `basemap/`, holds the self-hosted map tile archive. It is
> web-reachable (via an `Alias`, not the DocumentRoot) but **outside** htdocs on
> purpose: every publish path writes only inside htdocs, so nothing in the
> nightly can delete or age-prune a ~227 MB artifact that only changes
> quarterly. See §9.

Maderas IP: `45.79.96.48`. DNS: Route 53 (the `beeatlas.net` hosted zone).

## 1. One-time install (sudo, on maderas)

```sh
sudo mkdir -p /var/www/beeatlas.net/htdocs /var/www/beeatlas.net/var \
              /var/www/beeatlas.net/var/basemap-staging /var/www/beeatlas.net/basemap
sudo chown -R "$USER": /var/www/beeatlas.net
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas.net.conf /etc/apache2/sites-available/
sudo a2ensite beeatlas.net
sudo apachectl configtest && sudo systemctl reload apache2
```

(mod_headers / rewrite / deflate / ssl are already enabled on maderas.)

## 2. Prime the served root

Either wait for the 03:00 nightly (its publish step now merges into
`SITE_ROOT=/var/www/beeatlas.net/htdocs` whenever that directory exists), or run
`data/nightly.sh` manually. Then spot-check **before** touching DNS:

```sh
curl -sI -H 'Host: beeatlas.net' http://45.79.96.48/ | grep -Ei 'HTTP|cache-control'          # 200, max-age=0
curl -sI -H 'Host: beeatlas.net' http://45.79.96.48/data/manifest.json | grep -i cache-control # no-cache
# any hashed asset from the manifest: expect max-age=31536000, immutable
```

## 3. DNS flip — through CDK, never a manual Route 53 edit

The apex + `www` records are **CDK-managed** (`infra/lib/beeatlas-stack.ts`,
the `NetA*` / `NetAAAA*` records). A hand-run `aws route53` UPSERT would drift
and be reverted on the next `cdk deploy` — the "never hand-edit Route 53"
invariant lives in that file's comments and in `beeatlas/CLAUDE.md` (line 41,
"AWS via CDK in `infra/`"). The flip itself is already committed: the records
now target maderas dual-stack (A `45.79.96.48`, AAAA the Linode IPv6). Applying
it is a CDK deploy from a **local** checkout, which uses your default AWS
identity — `rainhead` — **not** `--profile beeatlas` (that is nightly.sh's
maderas data-plane profile, wrong for CDK):

```sh
cd infra
npx cdk diff BeeAtlasStack        # expect ONLY the four NetA*/NetAAAA* targets
                                  # moving off the CloudFront alias to maderas —
                                  # nothing on the bucket / distribution / IAM
npm run deploy                    # = cdk deploy --all  (or: npx cdk deploy BeeAtlasStack)
```

The `NetA*` records use CDK's default TTL (30 min); plan rollback timing for
that, not a 5-minute TTL.

**Rollback** is reverting the flip commit (restores the CloudFront alias
target) and redeploying — the distribution + siteBucket stay defined and warm
throughout, so nothing needs to be rebuilt.

## 4. TLS (after DNS resolves to maderas)

```sh
sudo certbot --apache -d beeatlas.net -d www.beeatlas.net
```

certbot clones the port-80 vhost into `beeatlas.net-le-ssl.conf` and adds
the HTTPS redirect — the same shape as `api.beeatlas.net`.

## 5. Verify

- `https://beeatlas.net/` loads; a species page's notes render; headers as in §2.
- Service worker: hard-reload twice, check `/data/manifest.json` fetches live.

(Model Y already deleted the nightly's S3 site legs, the GH-Actions dispatch,
and `deploy.yml` itself — there is no `PUBLISH_S3` switch anymore. The
**st-vjd** teardown (2026-07-19) then retired the site bucket, the site
CloudFront distribution, and the GitHub OIDC deployer. What remains on AWS:
DNS, the beeatlas.com→.net redirect distribution, and the two backup buckets
(AuthoritativeBackupBucket for the notes store, PipelineBackupBucket for the
nightly's DuckDB/taxa trap).)

## 6. Model-Y migration (one-time, on maderas)

The pre-Model-Y nightly served the flat root `/var/www/beeatlas.net` and kept
the DuckDB at `/tmp/beeatlas.duckdb` (S3 round-trip each night). Landing
A+B+C moves both. With the 03:00 cron **disabled for the window** (comment the
crontab line):

```sh
cd /var/www/beeatlas.net
mkdir -p htdocs var
# move the served tree into htdocs/ (everything except the new dirs)
find . -maxdepth 1 ! -name . ! -name htdocs ! -name var -exec mv {} htdocs/ \;
# the working DuckDB becomes persistent state (survives reboots, no S3 pull)
mv /tmp/beeatlas.duckdb var/beeatlas.duckdb   # or restore: aws s3 cp s3://<bucket>/db/beeatlas.duckdb var/
# vhost now points at htdocs/
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas.net.conf /etc/apache2/sites-available/
# certbot's -le-ssl clone carries the OLD DocumentRoot — update it to match:
sudo sed -i 's|/var/www/beeatlas.net$|/var/www/beeatlas.net/htdocs|' \
    /etc/apache2/sites-available/beeatlas.net-le-ssl.conf || true
sudo apachectl configtest && sudo systemctl reload apache2
```

Then re-enable cron and run `bash ~/dev/beeatlas/data/nightly.sh` once by hand.
First-run expectations: the integration diff tests **skip** (no
`var/baseline/` snapshot yet — it is written after the first successful
publish); `var/export/` starts empty so Stelis rebuilds everything once. The
taxa cache stays in the checkout (`data/raw/`) as before.

## 7. Enable the synchronous note publish (st-nee — after §6 + one green nightly)

A committed note write (create/edit/delete/takedown/restore) republishes the
site before responding (`data/publish-notes.sh`: shared flock → scoped stelis
notes build → full 11ty render → merge-swap). The gate defaults **off**;
writes still succeed while it's off and respond `"publish": "pending"` — the
nightly bakes them. Flip it on only once the §6 layout exists and a nightly
has published green (the publish script assumes `var/export/` is populated —
a scoped notes build on an empty export dir has nothing to render against).

```sh
# in ~/.config/systemd/user/beeatlas-api.service, alongside NOTES_DB_PATH:
Environment=NOTE_PUBLISH_ENABLED=true
systemctl --user daemon-reload && systemctl --user restart beeatlas-api
```

Two operational notes:

- **Proxy timeout.** The publish legitimately takes ~30–90 s (render + rsync,
  plus up to `PUBLISH_LOCK_WAIT` (60 s) waiting out a concurrent publish).
  Apache's default `Timeout`/`ProxyTimeout` (60 s) can drop the proxied
  response mid-publish — set `ProxyTimeout 300` in the `api.beeatlas.net`
  vhost. The API's own subprocess bound is `NOTE_PUBLISH_TIMEOUT` (default
  300 s).
- **Nightly collision.** If the nightly holds the publish lock, the write
  returns `"pending"` after the lock wait (exit 75 from the script — logged
  as deferred, not an error): the run holding the lock reads the same
  committed store, so that nightly (or the next) bakes the note.

## 8. Species-name redirects (one-time, sudo — beeatlas-ds4)

When a name is folded into another (`data/dbt/seeds/occurrence_synonyms.csv`),
its species page stops being generated and every link to it 404s. Apache 301s
those URLs to the accepted name instead.

**The table is data, not config.** `/species-redirects.map` is emitted by the
site build from the synonym seeds and lands in the docroot through an ordinary
publish, so adding a synonym needs neither root nor a reload — mod_rewrite
re-reads a `txt:` map when the file changes (verified on maderas 2026-07-31: a
line appended to the live map took effect on the next request, no reload). Only the rules below are config, and
they are installed once.

Deploy a build containing `/species-redirects.map` **before** running this:
mod_rewrite validates the map file at startup, so a missing file will fail
`configtest`.

```sh
# rules shared by both vhosts (:80 serves the site directly — it does not
# redirect to HTTPS — so both need them)
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas-species-redirects.conf /etc/apache2/
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas.net.conf /etc/apache2/sites-available/

# certbot's -le-ssl clone is generated on the host and carries no Include line;
# add it before </VirtualHost> if it is not already there (idempotent)
grep -q beeatlas-species-redirects /etc/apache2/sites-available/beeatlas.net-le-ssl.conf \
  || sudo sed -i 's|^</VirtualHost>|    Include /etc/apache2/beeatlas-species-redirects.conf\n</VirtualHost>|' \
       /etc/apache2/sites-available/beeatlas.net-le-ssl.conf

sudo apachectl configtest && sudo systemctl reload apache2
```

Verify — the first must be a 301 to the accepted name, the second a 200 (a
species that was never folded must fall straight through):

```sh
curl -sI https://beeatlas.net/species/Bombus/lapponicus/index.html | head -2
curl -so /dev/null -w '%{http_code}\n' https://beeatlas.net/species/Bombus/sylvicola/index.html
```

The HTML page at each folded URL stays as the fallback (same source list, meta
refresh). If the map is missing, stale, or the vhost is rebuilt without these
rules, readers are still forwarded — the failure mode is the slower redirect,
not a 404.

## 9. Basemap tile archive (beeatlas-hvp)

The self-hosted map tiles for `/app/`. One ~227 MB PMTiles archive covering
Washington, extracted from the [Protomaps](https://build.protomaps.com/) daily
OSM build. Refresh is manual and occasional — OSM currency is not a product
requirement — so this is deliberately **not** wired into the nightly.

One-time: install the CLI on maderas with
`go install github.com/protomaps/go-pmtiles@latest` (note: the module root, not
`.../cmd/pmtiles`, which does not exist). It lands in `~/go/bin` as
**`go-pmtiles`**; Homebrew calls the same binary `pmtiles`, and both scripts
accept either. Add `~/go/bin` to `PATH`, and ensure both
`/var/www/beeatlas.net/basemap` and `/var/www/beeatlas.net/var/basemap-staging`
exist (§1). Staging sits under `var/` deliberately: `basemap/` is web-reachable
through the Alias, so building into it would publish every half-extracted
archive mid-build (`Options -Indexes` hides a listing, not a file).

Build and publish (on maderas, from the repo):

```sh
data/build-basemap.sh              # extract today's Protomaps build -> staging/
data/publish-basemap.sh wa-$(date -u +%Y%m%d).pmtiles
```

`build-basemap.sh` pulls only the tiles inside `data/basemap/wa.geojson` via
range requests, so it takes minutes, not hours. `publish-basemap.sh` verifies
the archive, moves it into place atomically, writes `manifest.json` **last**,
and prunes superseded archives 30 days after they were SUPERSEDED — it touches
the outgoing archive on publish, because `find -mtime` otherwise reads the build
date and would delete a quarterly archive instantly.

Verify:

```sh
# 206 + a Content-Range, and NO Content-Encoding (gzip would break ranges)
curl -sI -r 0-16383 https://beeatlas.net/basemap/tiles/wa-20260801.pmtiles \
  | grep -Ei 'HTTP|content-range|content-encoding|cache-control'
curl -s https://beeatlas.net/basemap/tiles/manifest.json
# glyphs ship with the CODE, through htdocs — not through the Alias above
curl -so /dev/null -w '%{http_code}\n' \
  'https://beeatlas.net/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf'
```

**Why `basemap/` sits outside `htdocs/`.** Everything in the publish contract
writes inside `htdocs`: `data/merge-swap.sh` rsyncs the page tree with
`--delete` (excluding only `/assets` and `/data`) and age-prunes hashed files
older than 30 days. An archive under `htdocs` would be deleted by one or the
other, and the symptom is a blank basemap in the field rather than a failed
build. Keeping it a sibling makes that impossible by construction instead of by
an `--exclude` a later edit could drop.

**Not backed up, deliberately.** The archive is fully reproducible from the
Protomaps daily build plus `data/basemap/wa.geojson` and
`data/build-basemap.sh` — both in git. Those two files *are* the backup; adding
227 MB per refresh to the backup buckets would buy nothing.

## 10. Compression (one-time, sudo — beeatlas-tb8)

What gets compressed on the way out lives in one file,
[`infra/maderas/beeatlas-compression.conf`](../../infra/maderas/beeatlas-compression.conf),
Included from **both** vhosts — the same shape as §8, and for the same reason:
the `-le-ssl` clone is generated on this host, carries no Include lines of its
own, and serves essentially all real traffic. When these rules were inline, the
`:443` copy had already drifted from the tracked `:80` one.

Install it and the vhost that Includes it:

```sh
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas-compression.conf /etc/apache2/
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas.net.conf /etc/apache2/sites-available/

# same idempotent add for certbot's clone as §8's redirects line
grep -q beeatlas-compression /etc/apache2/sites-available/beeatlas.net-le-ssl.conf \
  || sudo sed -i 's|^</VirtualHost>|    Include /etc/apache2/beeatlas-compression.conf\n</VirtualHost>|' \
       /etc/apache2/sites-available/beeatlas.net-le-ssl.conf

sudo apachectl configtest && sudo systemctl reload apache2
```

Order does not matter: the pre-compressed `.br`/`.gz` siblings are produced by
the site build (`scripts/postbuild-data.mjs`), and the rules test for the file
before using it, so this can be installed before or after the first build that
writes them — the interim behaviour is exactly today's.

Verify. The first two are the point of the exercise; the third is the one that
would be silently wrong if `.gz` were served as its own content type:

```sh
DB=$(curl -s https://beeatlas.net/data/manifest.json | sed -n 's/.*"occurrences_db": "\([^"]*\)".*/\1/p')

# ~4 MB with `content-encoding: br`, not ~34 MB — this is the whole 27 MB
curl -so /dev/null -H 'Accept-Encoding: br' -w '%{size_download} %{content_type}\n' \
  "https://beeatlas.net/data/$DB"
# a client that accepts neither still gets a working database, uncompressed
curl -so /dev/null -w '%{size_download}\n' "https://beeatlas.net/data/$DB"

# every .js on the page must say `content-encoding: gzip` (this is what broke)
curl -sI --compressed https://beeatlas.net/assets/$(
  curl -s https://beeatlas.net/app/index.html | sed -n 's|.*/assets/\([^"]*\.js\)".*|\1|p' | head -1
) | grep -Ei 'HTTP|content-type|content-encoding|vary'
```

**Measure at the server, not in the browser.** The database is fetched inside
the SQLite Web Worker, so it never appears in the page's Resource Timing — a
cold load measured from `performance.getEntriesByType('resource')` omits the
largest item by an order of magnitude and reads as ~5 MB. Byte-count the access
log (`%b` is the response body size) or use `curl` as above.
