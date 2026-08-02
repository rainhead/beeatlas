// Build-time compressed siblings for the immutable data artifacts (beeatlas-tb8).
//
// scripts/postbuild-data.mjs writes `<name>-<hash>.<ext>.br` and `.gz` next to each
// hashed artifact; Apache serves one of them, with the matching Content-Encoding, to a
// client whose Accept-Encoding says it can decode it (infra/maderas/beeatlas-compression.conf).
// The URL never mentions the encoding, so nothing on the client side changes.
//
// WHY HERE AND NOT IN mod_deflate: occurrences.db is ~34 MB and gzips 6.5x, which makes
// it both the biggest thing a cold load fetches and the biggest thing to gain — but
// compressing it per request would spend that CPU again for every visitor, on a prefork
// server that also runs the pipeline. Paying it once per publish is free at request time
// AND affords a level the on-the-fly path never could.
//
// This is a restoration, not an invention: data/nightly.sh had `_upload_hashed_gz`
// (gzip -9 + `--content-encoding gzip`) for exactly this reason until the S3 upload legs
// were deleted with the CloudFront serving path, after which Content-Encoding stopped
// being expressible at the publish step — merge-swap copies files, it does not attach
// metadata. Apache expresses it in config instead. See docs/adr/0024.
//
// Hashing is unaffected: the hash is of the UNCOMPRESSED source, as it was in
// `_upload_hashed_gz`, so a URL keeps meaning one specific set of original bytes no
// matter which representation the server chose.
//
// WHERE THE BYTES COME FROM (stelis st-ljy): compressing 34 MB is a pure function of a
// content-addressed input, so it belongs to the data build, not to the publish. Stelis
// runs `scripts/precompress-artifacts.mjs` as a graph node whose early cutoff produces
// the siblings only when an artifact actually moves, and drops them in
// `<data dir>/compressed/`. postbuild-data.mjs prefers those and compresses in-process
// only when they are absent (a dev build, `npm run pull-published`, an artifact the
// graph does not name) — so the note-publish path, which reruns the site build
// synchronously while an HTTP writer waits, copies instead of recompressing.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * Levels are chosen against the note-publish path (ADR 0017), which reruns the site
 * build synchronously while an HTTP writer waits out a 300 s timeout — not against a
 * nightly with all night. Measured on the 33.8 MB occurrences.db:
 *
 *     gzip   -6     5.35 MB    0.3 s
 *     gzip   -9     5.21 MB    0.8 s
 *     brotli  5     4.34 MB    0.3 s
 *     brotli  9     4.19 MB    1.1 s
 *     brotli 11     3.59 MB   46 s     <- the reason quality is not "maximum"
 *
 * Both encodings are written because both are needed: browsers only offer `br` over
 * HTTPS, and curl, older clients and anything speaking plain HTTP ask for gzip.
 */
export const VARIANTS = [
  {
    suffix: '.br',
    encoding: 'br',
    compress: (content) => brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 9,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    }),
  },
  {
    suffix: '.gz',
    encoding: 'gzip',
    // Node writes MTIME 0 into the gzip header, so the same input gives the same bytes
    // — a build stays reproducible (SOURCE_DATE_EPOCH's remit).
    compress: (content) => gzipSync(content, { level: 9 }),
  },
];

/** A variant has to earn its place in the docroot: at least this much smaller. */
export const MIN_SAVING = 0.1;

/**
 * The variants worth writing for `content` — those that clear MIN_SAVING.
 *
 * Already-compressed artifacts (parquet, and anything image-shaped a later phase adds)
 * fall out here on their own, so there is no extension allowlist to keep in step with
 * lib/runtime-artifacts.js. A skipped variant is not a failure anywhere downstream: the
 * server's rewrite tests for the file's existence, so "no sibling" simply means the
 * original is served, which is what already happens for a client that accepts neither.
 *
 * @param {Buffer} content — the artifact's uncompressed bytes
 * @returns {{ suffix: string, encoding: string, body: Buffer }[]}
 */
export function compressedVariants(content) {
  const ceiling = content.length * (1 - MIN_SAVING);
  return VARIANTS
    .map(({ suffix, encoding, compress }) => ({ suffix, encoding, body: compress(content) }))
    .filter(({ body }) => body.length <= ceiling);
}

/**
 * Where the pre-compressed siblings live inside a data dir — the ONE fact the writer
 * (scripts/precompress-artifacts.mjs, run as a stelis node) and the reader
 * (scripts/postbuild-data.mjs) have to agree about, since neither can observe the
 * other. A subdirectory rather than `<source>.br` beside the source, because it is a
 * derived SET with one producer: stelis content-addresses it as a directory tree, and
 * the writer prunes anything it did not just write.
 */
export const PRECOMPRESSED_DIR = 'compressed';

/** @param {string} dataDir — lib/build-data-dir.js's answer */
export function precompressedDir(dataDir) {
  return join(dataDir, PRECOMPRESSED_DIR);
}

/**
 * The content address of an artifact — the SAME 12 hex of sha256 that names it in the
 * docroot. One definition, used by the writer to name a sibling and by the publish to
 * name the artifact, because the two agreeing is the whole safety property below.
 */
export function artifactHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/**
 * A sibling's path. Named for the source AND its content hash, which is what binds the
 * compressed bytes to the bytes they were compressed FROM.
 *
 * Naming it `<source>.br` alone was a real defect (found in review, before this ever
 * ran in production): the publish hashes the artifact's CURRENT bytes to name it in the
 * docroot, then copied a sibling matched only by name. Nothing checked that the two were
 * the same bytes — and they need not be. `data/publish-notes.sh` triggers a publish
 * WITHOUT running the stelis node (its build is scoped to the notes suffix), and
 * `scripts/pull-published.sh` replaces the artifacts in a dev `public/data` while leaving
 * `compressed/` untouched. Either way the docroot would get `occurrences-<newhash>.db`
 * with LAST run's `.br` beside it — and since every browser accepts one of the two
 * encodings, essentially every client would receive the old database under a URL whose
 * hash asserts the new one, then cache it under `immutable`.
 *
 * With the hash in the name a stale sibling is simply not found, which lands on the
 * in-process fallback: slow and correct. Silence is what made it dangerous, so the
 * property is now structural rather than a check someone has to remember to run.
 */
export function precompressedPath(dataDir, source, hash, suffix) {
  return join(precompressedDir(dataDir), `${source}-${hash}${suffix}`);
}

/**
 * The pre-compressed variants of `source`@`hash` on disk, in VARIANTS order.
 *
 * Empty means "nothing was compressed ahead of time FOR THESE BYTES" — nobody ran the
 * node, or it ran against different content, or the variant failed MIN_SAVING. All of
 * those want the same fallback, which re-applies the filter to the bytes in hand. So an
 * empty result falls back and a non-empty one is trusted whole, rather than topping up
 * a per-variant gap.
 *
 * @returns {{ suffix: string, encoding: string, path: string }[]}
 */
export function precompressedVariants(dataDir, source, hash) {
  return VARIANTS
    .map(({ suffix, encoding }) => ({ suffix, encoding, path: precompressedPath(dataDir, source, hash, suffix) }))
    .filter(({ path }) => existsSync(path));
}
