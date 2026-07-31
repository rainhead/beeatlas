import { describe, test, expect } from 'vitest';
// @ts-expect-error -- .js source has no .d.ts; named exports are the contract
import { manifestAssetPaths, unnamedAssetPaths } from '../../lib/bundle-assets.js';

// beeatlas-bon / ADR 0019. The bundle-reuse gate's riskiest act is a DELETE: on a skip
// it removes files from _site/assets that the manifest does not name, so the reused
// directory is exactly what Vite would have emitted rather than a superset that
// accumulates dead chunks (the ADR 0016 regression). These assert that decision
// directly, which the previous grep-for-an-identifier test could not.

describe('manifestAssetPaths', () => {
  test('collects entry chunks, shared chunks, CSS and static assets', () => {
    const manifest = {
      'src/app-entry.ts': {
        file: 'assets/app-entry-A.js',
        isEntry: true,
        imports: ['_shared-B.js'],
        css: ['assets/app-C.css'],
      },
      '_shared-B.js': { file: 'assets/shared-B.js' },
      'src/sqlite.ts': { file: 'assets/sqlite-D.js', assets: ['assets/wa-sqlite-E.wasm'] },
    };
    expect(manifestAssetPaths(manifest)).toEqual([
      'assets/app-C.css',
      'assets/app-entry-A.js',
      'assets/shared-B.js',
      'assets/sqlite-D.js',
      'assets/wa-sqlite-E.wasm',
    ]);
  });

  test('the wasm binary is named — it is precached and load-bearing offline', () => {
    const paths = manifestAssetPaths({
      x: { file: 'assets/x.js', assets: ['assets/wa-sqlite-E.wasm'] },
    });
    expect(paths).toContain('assets/wa-sqlite-E.wasm');
  });

  test('tolerates a manifest entry with no file (CSS-only) without inventing one', () => {
    expect(manifestAssetPaths({ 'style.css': { css: ['assets/only-A.css'] } })).toEqual([
      'assets/only-A.css',
    ]);
  });
});

describe('unnamedAssetPaths', () => {
  test('a stray chunk is unnamed, and the named ones are left alone', () => {
    const named = ['assets/app-entry-A.js', 'assets/app-C.css'];
    const disk = ['app-entry-A.js', 'app-C.css', 'dead-chunk-OLD.js'];
    expect(unnamedAssetPaths(named, disk)).toEqual(['dead-chunk-OLD.js']);
  });

  test('a NESTED chunk the manifest names is kept', () => {
    // The regression this file exists for. Comparing manifest basenames against
    // top-level directory entries yields 'species' — which matches no manifest name —
    // so the whole directory would be deleted, immediately after the gate's presence
    // check confirmed those files were there. validate-bundle-size.mjs carries an
    // explicit branch for this shape because Vite has emitted it in this project.
    const named = ['assets/species/index-A.js', 'assets/app-entry-B.js'];
    const disk = ['species/index-A.js', 'app-entry-B.js'];
    expect(unnamedAssetPaths(named, disk)).toEqual([]);
  });

  test('a stray file INSIDE a nested dir is still pruned, without taking its siblings', () => {
    const named = ['assets/species/index-A.js'];
    const disk = ['species/index-A.js', 'species/leftover-OLD.js'];
    expect(unnamedAssetPaths(named, disk)).toEqual(['species/leftover-OLD.js']);
  });

  test('manifest paths outside assets/ never make something on disk look named', () => {
    // A defensive case: if a manifest ever names an outDir-root file, its basename must
    // not accidentally whitelist a same-named file inside assets/.
    expect(unnamedAssetPaths(['root-thing.js'], ['root-thing.js'])).toEqual(['root-thing.js']);
  });

  test('an empty manifest marks everything unnamed rather than nothing', () => {
    // Fails safe in the sense that matters: the gate must not conclude "all present"
    // from a manifest that names nothing. (The gate additionally refuses to skip when
    // the manifest is unreadable.)
    expect(unnamedAssetPaths([], ['a.js', 'b.js'])).toEqual(['a.js', 'b.js']);
  });
});
