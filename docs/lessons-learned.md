# Engineering Lessons

Reusable lessons distilled from BeeAtlas's milestone retrospectives (v1.0–v8.0). Each recurred across several milestones; the full shipping history is preserved at [history/RETROSPECTIVE.md](history/RETROSPECTIVE.md).

## Testing & verification

- **Green ≠ covered.** A passing suite that asserts a *source* substring proves nothing about the *sink*. Assert the thing that actually ships (the emitted artifact, the rendered output), not an intermediate.
- **An adversarial code-review gate catches what a green suite can't.** Integration regressions that every unit test passes through are the ones a skeptical review pass finds. Keep the review gate even when CI is green.
- **Stale derived data lies in local UAT.** If your local artifacts are old, the page you're testing is not the page users see. Refresh derived data before trusting a manual check.
- **Audit before "complete."** A milestone-close audit catches gaps a per-phase check misses — notably S3-upload gaps where the build passed but the artifact never published.
- **Measure page weight at the server, not in the page.** Anything fetched from a Web Worker never enters the page's Resource Timing: a cold load measured with `performance.getEntriesByType('resource')` read as ~5 MB while the server was sending 37 MB, because the 32 MB database is fetched inside the SQLite worker ([ADR 0024](adr/0024-compression-is-a-build-artifact.md)). Byte-count the access log.

## Data & contracts

- **Atomic positional-contract commits, guarded by a coupling test.** When a change spans positionally-coupled files (the `occ_id` vocabulary across `src/occurrence.ts`, `src/filter.ts`, `occurrence_places.sql`), change all of them in one commit and keep a test that fails if they drift.
- **When two programs compute one answer positionally, only their outputs can be compared.** The map swatch and the map dot were each computed as `hue = index in a sorted member list`, in JS and in Python. Both re-implementations were internally correct and tested; they disagreed about the member list, so one extra member silently repainted everything after it ([ADR 0022](adr/0022-a-swatch-is-a-legend-for-dots.md)). Unit tests on either side can't see that — a test that reads the two shipped artifacts and compares them can.
- **A count column's name is not its definition.** `occurrence_count` counts the Ecdysis specimen arm, not occurrences; the map plots all five arms. Check what a column aggregates before treating it as "does this thing exist".
- **Validate the CRS of every external shapefile.** External geodata arrives in whatever projection; assume nothing, check on ingest.
- **ToS/licensing questions belong at discuss-time, not build-time.** Resolve rights before writing the pipeline that redistributes the data (this is why external authority is reconciled at build time — see [ADR 0009](adr/0009-build-time-only-external-authority.md)).

## Delivery & platform

- **Internal links must end in `index.html`.** CloudFront + OAC has no directory-index behavior; a link to `/foo/` 404s. Emit `/foo/index.html`.
- **A config list of MIME types is only as right as the names in it.** `AddOutputFilterByType DEFLATE … application/javascript` looks correct and does nothing, because Apache serves `.js` as `text/javascript` — while the `text/css` beside it works, which is what makes the file read as fine. Check the name the server actually assigns (`/etc/mime.types`), and note that a per-vhost list *replaces* the global one rather than adding to it.
- **When you delete a serving layer, inventory what it was doing for you.** Both halves of the 37 MB cold load were solved before and were deleted as incidental parts of larger removals — CloudFront's auto-compression with the distribution, `_upload_hashed_gz` with the S3 upload legs ([ADR 0024](adr/0024-compression-is-a-build-artifact.md)). Neither removal was wrong; neither noticed it was carrying a second responsibility, and nothing failed when it stopped.
- **"Once per publish" is only cheap if publishes are rare.** Pre-compressing the data artifacts in `postbuild-data.mjs` was costed as ~2.9 s per publish and read as free — but that script also runs on `build:content`, which is the note-publish path, so every note write recompressed a 34 MB database that changes once a night ([ADR 0024's amendment](adr/0024-compression-is-a-build-artifact.md)). Before pricing work per-run, check every path that triggers the run.
- **A pinned interpreter is an input to the bytes, not just to the behaviour.** gzip -9 of the same database is 5,208,681 bytes under node 24.18 and 5,203,283 under node 26 — both valid, both decoding identically. Anything content-addressing a build output has to hash the pin (`.nvmrc`) or it will not see the change.
- **Target the slower browser** in any performance criterion — Firefox's WASM JIT runs ~2× slower than V8, so "fast in Chrome" is not the bar (see [ADR 0004](adr/0004-prebuilt-sqlite-artifact.md)).
