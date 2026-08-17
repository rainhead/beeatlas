# 0037 — mod_evasive comes out; a static site does not want a WAF in front of it

Date: 2026-08-17
Status: Accepted
Supersedes: the threshold decision recorded in beeatlas-cit
Issues: beeatlas-cit, beeatlas-hjdq

## Context

mod_evasive has been enabled on maderas since 2025-08. It went unnoticed until
ADR 0026 moved the basemap onto this host, at which point it took the site down.

beeatlas-cit has the full account. The short version: a PMTiles archive is a
**single URI** that every basemap tile is read from with an HTTP range request, and
mod_evasive's stock `DOSPageCount 2 / DOSPageInterval 1` means "more than two
requests to one URI per second". Ordinary panning exceeds that by a factor of ~37.
The blast radius is not the archive — mod_evasive blocks by **client IP across the
whole vhost**, so a user who pans the map starts getting 403s on the page itself, on
the occurrence database, and on the boundary GeoJSON.

The thresholds were raised to `DOSPageCount 300 / DOSSiteCount 500`, against
measured peaks (one client, real bundle, real archive, counted in sliding 1s
windows — the same quantity the module counts):

```
13/s  cold page load @ z7, 1400x900
21/s  zoom sweep 14->11->14
31/s  cold zoom sweep, 1920x1200
75/s  ten pans 120ms apart, 1920x1200   <- worst legitimate case measured
35/s  site-wide, cold page load @ z14, 1920x1200
```

That stopped the outage and left the real question open, which
`evasive.conf` stated plainly: at values chosen to clear a legitimate peak by 4x,
the module stops little short of a runaway script.

Two things since have sharpened it:

- **The ceiling is not a constant.** Requests scale with viewport area times gesture
  rate, and counting is per client IP — so a 4K display, a faster fling, or a field
  team behind one hotspot all move the peak upward, toward thresholds picked to sit
  just above today's measurement.
- **ADR 0036 removed the accidental safety margin.** mod_evasive's hash table is per
  child process. Under `mpm_prefork` a client's requests spread across many children
  and no counter saw the true rate. Under `mpm_event` there are few children, and
  HTTP/2 multiplexes a client's requests onto ONE connection served by ONE child. The
  counters now see close to the real rate for the first time, which means the
  headroom is exactly as wide as it measures and no wider (beeatlas-hjdq).

And the module has never caught anything. Across the full retained log window there
are **zero** `Blacklisting address` lines; every 403 on the site is ordinary config
answering a crawler — `/.htpasswd`, `/server-status`, and `Options -Indexes` on
directory URLs.

## Decision

**mod_evasive is removed from maderas — disabled and purged.**
[`infra/maderas/remove-evasive.sh`](../../infra/maderas/remove-evasive.sh) does it;
`evasive.conf` and `apply-evasive.sh` are deleted with this ADR.

The reasoning is that it was never matched to this site. mod_evasive counts requests
per URI and per IP, which models a site of many small pages fetched a few at a time.
BeeAtlas's read path is the opposite shape: a handful of very large immutable
artifacts — a 238 MB tile archive, a 34 MB database — each fetched as hundreds of
ranges against one URL, by one client, as fast as the network allows. The metric and
the traffic disagree at the level of what a "request" means, so any threshold is
either below normal use or so far above it that it stops nothing. The 300/500 values
are the second kind.

**Disabled AND purged, not just disabled.** A disabled-but-installed module is the
ambiguity ADR 0036 was written about, in reverse: it appears in the package list and
nothing on the box says whether it is doing anything.

## Consequences

**There is now no rate limiting on maderas.** That is the deliberate content of this
decision, and it should be said rather than implied. What remains is `mod_reqtimeout`
(still enabled, and the one generic protection that does fit — it bounds slow request
bodies rather than counting fast ones), the fact that every read-path URL is a static
file Apache serves without touching application code, and the write path's own
authentication (ADR 0027). A volumetric attack would be absorbed or not on bandwidth
and disk, with nothing in between.

**What would change this.** Not a repeat of beeatlas-cit — that was self-inflicted. A
real one: sustained traffic that costs money or availability, from a source that a
per-IP counter could actually distinguish from a volunteer with a big monitor. If
that arrives, the right answer is almost certainly upstream of Apache and shaped like
bandwidth (a CDN in front of the archive, or per-connection bandwidth caps), not
another per-URI request counter — the traffic shape argued against that once already.

**`evasive.conf`'s measurements are not lost.** They are reproduced above and in
beeatlas-cit's notes, which also records the method: measured against a local
range-capable server with a byte-identical copy of the archive, deliberately not
against production, because 403s return fast and distort the client's own pacing.

## Rejected alternatives

**Keep it at 300/500.** This is the status quo. It costs a real outage's worth of
risk — a threshold tuned to just above a measured peak fires on the case nobody
measured — in exchange for protection that fifteen days of logs show to be nil. The
losing side of that trade is the one where a volunteer in the field, on a shared
hotspot, silently gets a broken map.

**Tune per-location: exempt `/basemap/tiles` and keep the module elsewhere.**
Attractive, and it does not work — mod_evasive counts per client IP with no notion of
location, which is the same reason beeatlas-cit's "give the archive its own hostname"
option failed. The tile traffic would still spend the site-wide budget.

**Replace it with mod_qos or mod_ratelimit.** A better-matched tool exists
(`mod_ratelimit` shapes bandwidth rather than counting requests, which is the right
axis for this traffic). But adopting one now would be answering a threat we have no
evidence of, and the last module installed on that reasoning is the subject of this
ADR. If the need appears, it comes with data.
