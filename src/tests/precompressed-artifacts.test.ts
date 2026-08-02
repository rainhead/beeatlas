// beeatlas-tb8. A cold load shipped 37 MB because two things were served
// uncompressed, and both failures were silent in the same way: a response is not
// visibly broken for being four times bigger than it needs to be. Nothing failed,
// nothing logged, and the one artifact that mattered — the 32 MB database — is
// fetched inside a Web Worker, so it does not even appear in the page's Resource
// Timing. It took byte-counting at the server to see it at all.
//
// So what is pinned here is the pair of agreements that keep it fixed, since
// neither half is observable from the other:
//
//   - the build writes `.br` / `.gz` siblings of every hashed artifact, and the
//     vhost's rewrite is written to find files with exactly those names;
//   - the DEFLATE type list names the type Apache actually serves JavaScript as.
//
// The Apache config is tested as text because there is no Apache here. That is
// weaker than a request against the real server (the runbook's §10 curl is that
// check) but it catches the specific way this broke: a list of MIME types that
// someone reads as correct because the type they picture is the type they wrote.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
// @ts-expect-error -- lib/*.js is plain ESM shared with the build scripts; no .d.ts
import { compressedVariants, MIN_SAVING } from '../../lib/precompress.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const CONF = 'infra/maderas/beeatlas-compression.conf';

/** Roughly the shape of the thing this exists for: repetitive, highly compressible. */
const compressible = Buffer.from('SQLite format 3\0' + 'a,b,c,1,2,3;'.repeat(20_000));

describe('the build writes the compressed siblings the server looks for', () => {
  test('a compressible artifact gets both encodings, and they round-trip', () => {
    const variants = compressedVariants(compressible);
    expect(variants.map((v: { suffix: string }) => v.suffix)).toEqual(['.br', '.gz']);

    const [br, gz] = variants;
    expect(brotliDecompressSync(br.body).equals(compressible)).toBe(true);
    expect(gunzipSync(gz.body).equals(compressible)).toBe(true);
    for (const v of variants) expect(v.body.length).toBeLessThan(compressible.length);
  });

  test('an incompressible artifact gets none — and that is a normal outcome', () => {
    // Parquet and the like are already compressed internally. The server tests for
    // the file's existence, so "no sibling" costs nothing; writing a .gz that is
    // 100.2% of the original would cost disk on every publish forever.
    expect(compressedVariants(randomBytes(64_000))).toEqual([]);
    expect(MIN_SAVING).toBeGreaterThan(0);
  });

  test('gzip output is byte-identical run to run', () => {
    // Node writes MTIME 0 into the gzip header. If that ever changed, every publish
    // would rewrite bytes that did not change, which SOURCE_DATE_EPOCH exists to stop.
    const [, first] = compressedVariants(compressible);
    const [, second] = compressedVariants(compressible);
    expect(first.body.equals(second.body)).toBe(true);
  });

  test('postbuild-data writes them next to the artifact it just hashed', () => {
    const src = read('scripts/postbuild-data.mjs');
    expect(src).toContain('lib/precompress.js');
    // Both the copied artifacts and the derived taxon_pages map — the derived one is
    // easy to forget precisely because it is written by a different code path.
    expect(src.match(/writeVariants\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the vhost serves those siblings, under the original URL', () => {
  const conf = read(CONF);

  test('the rewrite matches a hashed artifact and nothing else', () => {
    // The literal pattern out of the config, run here as a JS regex — the syntax is
    // common to both engines, and the point is which URLs it selects.
    const patterns = [...conf.matchAll(/^RewriteRule\s+"([^"]+)"/gm)].map(m => new RegExp(m[1]!));
    expect(patterns).toHaveLength(2);

    for (const re of patterns) {
      expect(re.test('/data/occurrences-0123456789ab.db')).toBe(true);
      expect(re.test('/data/counties-0123456789ab.geojson')).toBe(true);
      // Never the manifest: it is rewritten every publish under a fixed name and
      // served no-cache, so a stale sibling beside it would be servable.
      expect(re.test('/data/manifest.json')).toBe(false);
      // Never an unhashed or nested path — the stable dirs belong to mod_deflate.
      expect(re.test('/data/feeds/all.xml')).toBe(false);
      expect(re.test('/data/occurrences.db')).toBe(false);
      // Never a variant itself, or a rewritten request would rewrite again.
      expect(re.test('/data/occurrences-0123456789ab.db.gz')).toBe(false);
    }
  });

  test('brotli is offered before gzip', () => {
    // Both rules end in [L], so the first one whose conditions hold wins, and br is
    // ~20% smaller than gzip on the database.
    expect(conf.indexOf('.br" [E=')).toBeLessThan(conf.indexOf('.gz" [E='));
  });

  test('the encodings named in the config are the suffixes the build writes', () => {
    for (const { suffix, encoding } of compressedVariants(compressible)) {
      expect(conf).toContain(`AddEncoding ${encoding} ${suffix}`);
    }
  });

  test('.gz stops being a content type, so the response describes the artifact', () => {
    // /etc/mime.types has `application/gzip gz`, and for the trailing extension the
    // type beats the encoding — so without this the gzip variant of the database is
    // served as application/gzip: a response describing its own encoding. Measured
    // against Apache 2.4.58 on maderas, before and after. Nothing on the client
    // reads the type today, which is precisely why it would have gone unnoticed.
    expect(conf).toMatch(/<FilesMatch\s+"\\\.gz\$">\s*\n\s*RemoveType \.gz\s*\n\s*<\/FilesMatch>/);
  });

  test('the DEFLATE list names the type Apache serves JavaScript as', () => {
    // THE regression: the list said application/javascript, /etc/mime.types says
    // text/javascript, and so the whole bundle shipped raw while the css beside it
    // did not. Anything read out of /etc/mime.types belongs on this list by that
    // name, not by the name the spec used to use.
    const list = conf.match(/AddOutputFilterByType DEFLATE([\s\S]*?)\n\n/)?.[1] ?? '';
    expect(list).toContain('text/javascript');
    expect(list).toContain('text/css');
    expect(list).toContain('application/json');
    expect(list).toContain('application/wasm');
  });

  test('both vhosts get it from one file, rather than each keeping a copy', () => {
    // The :443 vhost is generated on the host by certbot and had already drifted
    // from the tracked :80 one. An Include is the only version of this that stays
    // true; the runbook adds the same line to the clone.
    const vhost = read('infra/maderas/beeatlas.net.conf');
    expect(vhost).toContain('Include /etc/apache2/beeatlas-compression.conf');
    expect(vhost).not.toContain('AddOutputFilterByType');
    expect(read('docs/runbooks/serve-from-maderas.md')).toContain('beeatlas-compression.conf');
  });
});
