# 0042 — BeeAtlas moves to Fly as one stateful machine

Date: 2026-09-02
Status: Accepted
Supersedes the hosting half of [0007](0007-pipeline-runs-as-maderas-cron.md) (the pipeline still
runs as a cron; the host stops being maderas). Retires [0036](0036-http2-needs-a-threaded-mpm.md)
and the mechanism — not the principle — of [0037](0037-no-waf-in-front-of-a-static-site.md) at
cutover, because Apache goes away with the box.

## Context

maderas is going away, and the way it is operated has to go away with it. Today the serving host
is configured by hand — Apache vhosts, certbot, a systemd **user** unit, and a crontab — and code
ships by `ssh maderas 'bash data/publish-code.sh'`, which is a `git pull` **on the production
host**. The machine updates itself. Nothing about what is running is derivable from the repo.

What has to move is not just a static site. maderas runs four things that are one system:

- the rendered site (2.2 GB of htdocs, of which 2.1 GB is content-hashed data artifacts on a
  30-day prune) plus a 286 MB PMTiles basemap archive served by range requests
  ([0026](0026-self-hosted-basemap.md), [0025](0025-offline-basemap-is-a-byte-store.md))
- `api.beeatlas.net` — Flask on Waitress, owner of identity and the authoritative notes store
- the nightly pipeline — ~500 s of Stelis/dbt over a 1.2 GB DuckDB, from a **second** repo
  (`stelis`) that `nightly.sh` git-pulls alongside this one
- the note-write publish, which is the reason the first three cannot be separated

**The constraint that shapes everything is [0007](0007-pipeline-runs-as-maderas-cron.md)'s
synchronous burned-in publish.** A note write commits to the store and then, before responding,
runs a scoped Stelis build, an Eleventy render, and `merge-swap` into the DocumentRoot
([0017](0017-scoped-note-render.md), [0018](0018-coalescing-publish-queue.md)). So the API process
needs the Stelis state dir, the DuckDB, the export dir, the repo checkout and the site root on one
filesystem, coordinated by one `flock`.

A Fly volume attaches to exactly one Machine, and a Machine mounts exactly one volume. That is not
a detail to work around — it is the whole shape of the decision.

## Decision

**One Fly app, one Machine, one volume.** Caddy, Waitress and a cron supervisor run side by side on
it under an in-image supervisor, sharing the volume that holds `notes.db`, `beeatlas.duckdb`,
`stelis/`, `export/`, `baseline/`, `htdocs/`, and the caches that today live inside the checkout
(`data/raw/taxa.csv.gz`, `data/raw/ecdysis_cache/`). Fly `[processes]` groups are explicitly **not**
used: each group gets its own Machine, which a single-attach volume cannot serve.

Four things follow, and each was a choice.

**Serving splits from building; the API does not split from the pipeline.** This is the seam that
exists. Splitting the API onto its own Machine would mean giving up the synchronous publish —
a product decision, not an infrastructure one (see the rejected alternatives).

**The header policy moves into the repo, as a Caddyfile.** It is already partly there
(`infra/maderas/beeatlas.net.conf`, `beeatlas-compression.conf`,
`beeatlas-species-redirects.conf`) and it is program logic: `no-cache` on `/data/manifest.json` is
what makes the service worker's NetworkFirst route correct, and `no-gzip` plus `Accept-Ranges` on
`/basemap/tiles/*` is what makes PMTiles work at all. [0024](0024-compression-is-a-build-artifact.md)
is the standing evidence that this class of regression is invisible — a response is not broken for
being seven times larger — and it has already happened once, at the CloudFront→Apache move.

**Stelis is pinned into the image by commit SHA.** `nightly.sh` today git-pulls both repos because
a change spanning them ships only if both move. Building them into one image makes that atomic
instead of coincidental. The corollary is that the three publish scripts need a container mode:
run unmodified in the image, the nightly would update itself past the pin at 3am.

**Deploys go through GitHub Actions and take the publish lock.** `fly deploy` replaces the Machine
in place, so an uncoordinated deploy is a SIGKILL of whatever the pipeline was doing — including a
1.2 GB backup upload mid-flight. CI acquires `publish.lock` before deploying. Because
`[deploy] release_command` runs on a temporary Machine with **no volume**, the post-deploy render
cannot live there; it runs on the Machine itself.

## Consequences

- **A single Machine plus a single volume is Fly's own stated anti-pattern for availability**, and
  we are adopting it knowingly: it is what maderas already is, so it is not a regression. The part
  that is not acceptable at a 24-hour snapshot RPO is `notes.db` — the one dataset here that is
  user-authored and cannot be rebuilt from upstream. Continuous replication of the store is part of
  the target architecture, not an afterthought. (Writing this ADR surfaced that the hourly backup
  §3 of [notes-store-dr.md](../runbooks/notes-store-dr.md) specifies was never installed; it was
  installed on 2026-09-02, before any of this work starts.)
- The basemap archives are today the only unbacked artifact on the box, and
  `publish-basemap.sh` assumes it runs *on* the serving host. Both change.
- Apache goes, and 0036 and 0037 go with the mechanism. 0037's principle — a static site does not
  want a WAF in front of it — survives and applies to whatever fronts Caddy.
- `api/config.py` pins the OAuth redirect URI and exempts only loopback, so a staging deployment on
  `*.fly.dev` needs a code change, not merely a second iNat app registration.
- Cost goes from roughly zero marginal to roughly $25–45/month. That is the price of the ops
  properties, and it should be named rather than discovered.

## Rejected alternatives

**Make the note publish asynchronous and split the API off.** The codebase already ships this:
`NOTE_PUBLISH_ENABLED=false` is a supported mode that answers "saved; publish pending" and lets the
nightly bake the note. Taking it would shrink the API to a small app with a replicated SQLite store
and free serving to go anywhere — genuinely the cleaner infrastructure. Rejected on product
grounds: [0007](0007-pipeline-runs-as-maderas-cron.md) chose the synchronous publish with its eyes
open, and [0018](0018-coalescing-publish-queue.md) removed the failure mode that would have forced
revisiting it. An author writing a note and reloading to see it live is the behaviour; the
architecture serves it, not the other way around. **This is the decision to revisit first if the
single-machine shape ever becomes the binding constraint** — it is not Fly that forces colocation.

**Object storage for the static tier (Tigris, or Bunny Storage as origin).** Tempting because it
would take 2.4 GB off the volume and make serving stateless. Rejected because `merge-swap.sh`'s
contract is *filesystem* semantics — hashed-assets-first with no `--delete`, `--delete` only on
stable-URL dirs, and a 30-day age prune that depends on rsync refreshing mtimes so live-but-
unchanged files look fresh. An object sync does not re-put unchanged objects, so a lifecycle-by-age
rule would delete the **live** bundle; the script already carries a comment about this having bitten
once. Porting it means reimplementing it and re-deriving that trap, to buy redundancy that is
partial anyway: the site would serve while nothing could publish.

Bunny Storage as origin is separately disqualified by where the policy would live. It is classified
at the edge by Smart Cache and overridden by dashboard Edge Rules — and the sibling pnwmoths repo's
ADR 0009 records that this was not reproducible, with a second site shipping broken at the CDN until
zone settings were rediscovered by trial and error. BeeAtlas's policy is stricter than that one's
and the offline PWA depends on it.

**Bunny as a pull zone in front of the Fly origin** is *not* rejected — it is deferred. With Caddy
authoritative for headers and the zone set to respect origin `Cache-Control`, the ADR 0009 objection
does not apply, and it would keep the read path alive across a Machine restart. Revisit if egress
shows up on the bill or the single-Machine read path proves too fragile. Cold PMTiles range requests
would need "Optimize for Video Delivery" enabled, and the SW's cache-first manifest behaviour
re-verified behind the cache.

**Run the pipeline in GitHub Actions.** Stelis is content-addressed, so its value is a warm state
dir and a 1.2 GB DuckDB that persist between runs. Restoring and saving those as CI cache each
night discards most of what makes the nightly 500 s instead of hours, and it would split the note
publish across two execution environments.

**A Fly scheduled Machine for the nightly.** A scheduled Machine is a *different* Machine, so it
cannot mount the volume the pipeline needs. The cron runs inside the always-on Machine, which also
puts the schedule in version control — with its timezone set deliberately, since the supervisor
defaults to UTC and today's 03:00 is Pacific.
