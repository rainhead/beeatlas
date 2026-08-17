# ADR 0024: The database is compressed by the build, not by the server

**Status:** Accepted (implemented 2026-08-02; issue beeatlas-tb8)
**Amended:** 2026-08-02 — *which build* writes them (stelis st-ljy); see the amendment
at the end.

---

## Context

A cold load of the atlas was 37 MB over 35 requests, measured at the default WA view
on 2026-08-02. 32 MB of that was `occurrences.db`, served with no compression at all —
against ~5 MB gzipped or ~4 MB brotlied. A second 1.3 MB was every JavaScript file on
the page, for an unrelated reason with the same shape.

Both were regressions from the CloudFront → Apache move, and — this is the part worth
recording — **both had been solved before, correctly, and the solutions were deleted as
part of something else.**

- JavaScript was compressed by CloudFront's automatic compression, enabled in
  `06253107` along with the `Accept-Encoding` cache-key opt-in that makes it actually
  do anything. It went away with the distribution. Apache's vhost picked up css and
  json but not js, because the `AddOutputFilterByType` list named the legacy
  `application/javascript` while Apache serves `.js` as `text/javascript`.
- The database was pre-compressed **explicitly**, by `_upload_hashed_gz` in
  `data/nightly.sh` (`f676900e`) — gzip -9 into S3 with `--content-encoding gzip`, and
  a comment saying why: CloudFront would not auto-compress it. (It could not have: its
  auto-compression is capped at 10 MB.) That function died with the S3 upload legs in
  `b1d2ab4d`. Nothing replaced it, because merge-swap copies files into a filesystem
  rather than uploading them with metadata, and `Content-Encoding` stopped being
  expressible at the publish step.

Neither failure could announce itself. A response is not broken for being seven times
larger than it needs to be; nothing errors, nothing logs, no test can see a header it
was never told to expect. And the biggest item was the *least* visible: the database is
fetched inside the SQLite Web Worker, so it never appears in the page's Resource
Timing — a cold load measured from `performance.getEntriesByType('resource')` reads as
about 5 MB, and omits the 32 MB.

## Decision

**Compression of the immutable data artifacts is a build output, and the config that
serves them is one file shared by both vhosts.**

`scripts/postbuild-data.mjs` writes `<name>-<hash>.<ext>.br` and `.gz` beside each
hashed artifact (`lib/precompress.js`); `infra/maderas/beeatlas-compression.conf`
serves one of them under the artifact's own URL when `Accept-Encoding` allows, and
hands everything small and text-shaped to `mod_deflate` on the fly.

**Why not just add the types to `mod_deflate` and be done.** Compressing 32 MB per
request costs real CPU, on a two-core server that also runs the nightly pipeline, and it
is paid again for every cold load — while the artifact is content-hashed and immutable,
so the answer is identical every time. Doing it once per publish is free at request
time and buys a level the live path could never afford: brotli q9 gets the database to
4.19 MB, 20% under gzip -9. It also removes the size ceiling that made this a manual
job under CloudFront in the first place.

**The hash is of the uncompressed source** — as it was in `_upload_hashed_gz`. The
manifest keeps its shape, the URL keeps naming one specific set of original bytes, and
which representation a client receives is a transport detail it never has to know. It
is what lets the serving rule fall back safely: the rewrite tests for the sibling, so a
missing variant, an artifact too incompressible to bother with, or a client accepting
neither encoding all land on the original file.

**Compression levels are chosen against the note-publish path** (ADR 0017), which
reruns this build synchronously while an HTTP writer waits — not against a nightly with
all night. On the 33.8 MB database: brotli q9 is 4.19 MB in 1.1 s, and q11 is 3.59 MB
in **46 s**. The extra 0.6 MB is not worth 45 seconds in a request path.

**Serving config for both vhosts lives in one Included file.** Port 80 serves the site
directly and certbot's `-le-ssl` clone is generated on the host, so anything inline is
written twice — and the `:443` copy, which serves nearly all real traffic, had already
drifted from the tracked one. Same shape as the species redirects, for the same reason.

## Consequences

- A cold load goes from ~37 MB to ~9.5 MB; the database alone accounts for 28 MB of
  that. Publishes cost ~2.9 s more CPU and ~4.7 MB more disk per data artifact set.
- `mod_brotli` is **not** required and is not enabled: serving pre-compressed brotli is
  a static file plus a header. Only on-the-fly brotli would need the module.
- The build-time and serve-time halves must agree on the suffixes, and neither can
  observe the other. `src/tests/precompressed-artifacts.test.ts` pins the agreement;
  §10 of the maderas runbook is the check against a real server.
- Progress reporting had to stop trusting `Content-Length`: it counts wire bytes, while
  `fetch` hands JS the decoded body, so the prime bar would have read 800%
  (`src/prime-orchestrator.ts`). Any future consumer that sizes a download from headers
  inherits this.
- The remaining cold-load weight is now ordinary: ~4.2 MB database, ~0.5 MB geojson,
  ~0.3 MB bundle, ~0.8 MB basemap tiles. Nothing is an order of magnitude out of place,
  which is the state in which the next regression of this kind will be noticeable.

## Rejected

**Add `.db` to `mod_deflate`.** One line, and it would have worked — 6.3x at gzip -6 —
but it re-pays 0.3 s of CPU per cold load forever for a byte-identical answer, and
forecloses brotli.

**Put the compressed size in the manifest** so the progress bar could keep a real
denominator. It adds a second thing the manifest must be right about in order to
position a progress bar; the per-asset estimate already there is enough.

**brotli q11.** 0.6 MB better, 46 s slower — see above.

**Serve `.gz` under its own URL** and have the client choose. That makes the encoding
part of the artifact's identity, so the SW cache, the manifest and every consumer would
have to agree about which one they mean. `Accept-Encoding` is the mechanism that exists
for this, and it degrades on its own.

---

## Amendment, 2026-08-02: the data build compresses; the publish copies

*(stelis st-ljy, the other half of beeatlas-tb8)*

The decision above is unchanged — compression is a build output, and the hash is of the
uncompressed source. What was wrong was *which* build.

`scripts/postbuild-data.mjs` is the right place for the **decision** and the wrong place
for the **work**. It runs on `postbuild` and on `build:content`, and `build:content` is
the note-publish path: ADR 0017 reruns the site build synchronously while an HTTP writer
waits out a 300 s timeout. It also rebuilds `_site/data` wholesale with no cache. So the
~2.9 s this ADR booked as a per-publish cost was being paid on **every note write**, to
recompress a database that changes once a night.

Compressing an immutable, content-hashed artifact is a pure function of that artifact,
which is precisely what stelis's graph edges are for. So:

- **`scripts/precompress-artifacts.mjs`** writes `<data dir>/compressed/<source>-<hash>.br|.gz`
  for the artifacts named on argv. It is a stelis node (`precompress`) whose inputs are
  the artifacts themselves, so early cutoff runs it when the *data* moves. It always
  compresses what it is told — the caching is the graph's job, and a
  "is the sibling newer" check here would be the fourth hand-rolled cache in this repo.
- **`postbuild-data.mjs`** prefers those bytes and copies them to the hashed names.
  Compressing in-process stays the fallback for a dev build, a `pull-published` docroot,
  and `taxon_pages`, which this script derives from this build and no graph node can know.

Measured on the real 33.8 MB database: the publish step goes from **2.75 s to 0.15 s**,
and the compressed bytes are byte-identical either way.

**Which artifacts is stelis's to say, not this script's.** The writer could import
`RUNTIME_ARTIFACTS` itself, and the two would agree until they didn't — at which point
the node's output directory would change without any *declared input* changing, which is
the shape of a wrong cache skip. Taking the list from the caller makes the graph edge
authoritative, and turns drift into "postbuild compresses that one in-process": slow and
correct, rather than fast and stale.

**A sibling is named for its source's CONTENT, and that is load-bearing.** The first cut
named it `<source>.br` and the publish copied it by name — while naming the artifact in
the docroot after a fresh hash of that artifact's *current* bytes. Nothing checked that
the two were the same bytes, and two ordinary paths reach the case where they are not:
`data/publish-notes.sh` triggers a publish without running this node at all (its stelis
build is scoped to the notes suffix), and `scripts/pull-published.sh` replaces a dev
checkout's artifacts while leaving `compressed/` untouched. Either one would put
`occurrences-<newhash>.db` in the docroot with the *previous* database's `.br` beside it —
and since every browser accepts one of the two encodings, essentially every client would
receive the old database under a URL whose hash asserts the new one, then cache it under
`immutable`. Nothing would error. With the hash in the sibling's name, a stale one is
simply not found and the publish falls back to compressing: slow and correct. Caught in
review before it ever ran a nightly; the regression test is the "STALE `compressed/`"
case in `src/tests/precompressed-artifacts.test.ts`, which runs the real publish.

**`compressed/` is a set with one producer.** The writer prunes anything it did not just
write — a retired artifact's siblings, a previous hash's, a `.tmp` from a killed run —
so the directory holds exactly the current answer. Stelis content-addresses it as a tree,
so a stray file would keep the digest moving besides. Siblings are written to a temp name
and renamed, like `manifest.json`: a SIGKILL mid-write (the note path runs under a 300 s
timeout) would otherwise leave a truncated file under a name the publish accepts, and a
truncated `.gz` has the right name and the right hash.

**The node version is part of the answer.** gzip -9 of the same 33.8 MB database is
5,208,681 bytes under node 24.18 and 5,203,283 under node 26. Both are valid gzip and
decode identically, so nothing breaks — but the bytes change for a reason a build cache
cannot see unless it is told, which is why the stelis recipe hashes `.nvmrc` as task code.
