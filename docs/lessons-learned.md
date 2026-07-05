# Engineering Lessons

Reusable lessons distilled from BeeAtlas's milestone retrospectives (v1.0–v8.0). Each recurred across several milestones; the full shipping history is preserved at [history/RETROSPECTIVE.md](history/RETROSPECTIVE.md).

## Testing & verification

- **Green ≠ covered.** A passing suite that asserts a *source* substring proves nothing about the *sink*. Assert the thing that actually ships (the emitted artifact, the rendered output), not an intermediate.
- **An adversarial code-review gate catches what a green suite can't.** Integration regressions that every unit test passes through are the ones a skeptical review pass finds. Keep the review gate even when CI is green.
- **Stale derived data lies in local UAT.** If your local artifacts are old, the page you're testing is not the page users see. Refresh derived data before trusting a manual check.
- **Audit before "complete."** A milestone-close audit catches gaps a per-phase check misses — notably S3-upload gaps where the build passed but the artifact never published.

## Data & contracts

- **Atomic positional-contract commits, guarded by a coupling test.** When a change spans positionally-coupled files (the `occ_id` vocabulary across `src/occurrence.ts`, `src/filter.ts`, `occurrence_places.sql`), change all of them in one commit and keep a test that fails if they drift.
- **Validate the CRS of every external shapefile.** External geodata arrives in whatever projection; assume nothing, check on ingest.
- **ToS/licensing questions belong at discuss-time, not build-time.** Resolve rights before writing the pipeline that redistributes the data (this is why external authority is reconciled at build time — see [ADR 0009](adr/0009-build-time-only-external-authority.md)).

## Delivery & platform

- **Internal links must end in `index.html`.** CloudFront + OAC has no directory-index behavior; a link to `/foo/` 404s. Emit `/foo/index.html`.
- **Target the slower browser** in any performance criterion — Firefox's WASM JIT runs ~2× slower than V8, so "fast in Chrome" is not the bar (see [ADR 0004](adr/0004-prebuilt-sqlite-artifact.md)).
