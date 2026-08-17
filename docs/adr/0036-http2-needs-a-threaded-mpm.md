# 0036 — HTTP/2 needs a threaded MPM, so maderas runs mpm_event

Date: 2026-08-17
Status: Accepted
Issues: beeatlas-hjdq

## Context

Every response from maderas negotiated HTTP/1.1, on both vhosts — despite
`mod_http2` being loaded and `Protocols h2 h2c http/1.1` already set in
`mods-available/http2.conf`. By every check you would think to run, HTTP/2 was on.

The obvious suspect was the reverse proxy, and it was wrong. `api.beeatlas.net`
does run through `mod_proxy_http` to Waitress, but `beeatlas.net` has no proxy in
its path at all and behaved identically:

```
beeatlas.net: 1.1
api:          1.1
```

Two vhosts, one with a proxy and one without, same result — so the proxy is not the
variable. It could not have been anyway: the backend hop to Waitress is HTTP/1.1 by
construction, and the client-facing protocol is negotiated by ALPN at TLS
termination, before Apache decides anything about proxying.

The cause was the MPM. **`mod_http2` requires a threaded MPM** (`event` or
`worker`); maderas ran `mpm_prefork`. Under prefork the module still loads, still
answers `apache2ctl -M`, still accepts its `Protocols` directive — and then declines
to speak h2 to anybody, logging one warning at startup and serving 1.1 forever.

That failure mode is the reason this ADR exists. Nothing in the configuration is
wrong; the module list and the directive both read as correct, so `a2enmod http2`
looks like the whole job and the result looks like a proxy problem, a TLS problem,
or a browser problem. It is none of those.

## Decision

**maderas runs `mpm_event`, and HTTP/2 is served on every vhost.** The switch is
[`infra/maderas/apply-http2.sh`](../../infra/maderas/apply-http2.sh), tracked here
for the same reason `evasive.conf` is — serving config the site depends on should
not live only on the host.

What made it safe to leave prefork:

- **No `mod_php`** — the usual reason a host is pinned to prefork. Nothing in the
  module list needs process isolation.
- **CGI is vestigial.** The default mass-vhost has a `VirtualScriptAlias`, but the
  only content under any `cgi-bin` is a 2020-vintage `analog.cgi`. `mod_cgi` is
  prefork-only, so the switch also moves `cgi` → `cgid`; Ubuntu's `a2enmod cgi`
  resolves to the right one from the active MPM, which is why the script disables
  and re-enables it rather than naming `cgid` directly.
- **The resource shape improves.** On 2 cores / 3.9 GB, `MaxRequestWorkers 150`
  stops meaning 150 processes and starts meaning 2 children × 25 threads.

## Consequences

**The self-hosted basemap is the real beneficiary.** A PMTiles archive is one URL
read by hundreds of HTTP range requests (ADR 0026), which is the exact shape that
the per-origin connection limit punishes — panning the map queued tiles behind six
connections. h2 multiplexes them onto one. Range semantics are untouched: the
archive still answers `206` with a correct `Content-Range`, which is the thing that
had to be verified rather than assumed.

**`mod_evasive` now measures something different.** Its hash table is per child
process. Under prefork, one client's requests spread across many children and no
counter ever saw the client's true rate — `evasive.conf` says so explicitly, and it
is why the beeatlas-cit failures were intermittent. Under event there are few
children, and h2 puts all of a client's multiplexed requests on ONE connection
served by ONE child. The thresholds still have headroom (worst measured legitimate
case 75 req/s against `DOSPageCount 300`), but that headroom is now real rather than
accidental dilution. Tracked in beeatlas-hjdq.

**Cached immutable assets will lie about this.** `/assets/*` is served
`max-age=31536000, immutable`, so a browser answers those requests out of its own
cache and devtools reports the protocol recorded when the entry was stored — which,
for anything fetched before the switch, is HTTP/1.1. Verify at the server with
`curl --http2`, or with the cache disabled. This is the same "measure at the server,
not in the browser" trap ADR 0024 hit from the other direction.

## Rejected alternatives

**`mpm_worker`.** It satisfies `mod_http2`'s threading requirement just as well. But
h2 is a long-lived-connection protocol, and event's whole point is handling idle
keep-alive connections on a listener thread instead of pinning a worker to each one.
Choosing worker would take the migration cost and decline the benefit that motivated
it.

**Leaving `Protocols` set under prefork.** This is the status quo the ADR replaces,
and it is worse than not enabling the module: it advertises a capability that is
silently inert, so the next person to look concludes HTTP/2 is already on and goes
hunting somewhere else. Whatever this ends up being, it should not be a lie.
