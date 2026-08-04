import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// @ts-expect-error -- .js source has no .d.ts; the named export is the contract
import { MANIFEST_PATH } from './lib/vite-manifest.js';

// NOTE: vite-plugin-preload.ts is deliberately NOT registered. It never ran in the
// shipped build (it lived here, and the old eleventy-plugin-vite path never loaded
// this file — the built site contains zero rel=preload tags), and under backend
// integration no HTML reaches Vite at all, so its transformIndexHtml hook could not
// fire either. Reviving the intent means emitting the tags from Eleventy, where the
// manifest already names the hashed .wasm — tracked separately, not folded into
// this behavior-preserving refactor.

// The Vite manifest is a BUILD-TIME artifact — Eleventy reads it to emit hashed asset
// URLs, nothing at runtime wants it — but `build.manifest` writes it under outDir,
// which is the published site. This moves it to a cache path once the bundle is
// closed, which does two things: `_site` never carries build metadata, and the
// manifest OUTLIVES a build.
//
// That second property is the load-bearing one. A note-only publish reruns Eleventy
// WITHOUT rebuilding the app (the bundle cannot have changed), so Eleventy must still
// find a manifest from an earlier run. An earlier version of this deleted the file
// instead, and a bare `npx eleventy` after a full build failed.
//
// The path lives in lib/vite-manifest.js, the reader, and is imported rather than
// repeated — the two must agree or Eleventy renders against a manifest nothing wrote.
// It is under `.cache/` at the repo root (already gitignored) and NOT under
// node_modules, which `npm ci` deletes: the rerun-Eleventy-alone path is exactly what
// would have broken after a dependency install.
function stashManifest() {
  return {
    name: 'beeatlas:stash-manifest',
    // Build-only. Dev runs Vite as middleware inside the Eleventy server
    // (eleventy.config.js), which loads this same config file, so without this the
    // plugin is registered for `npm run dev` too — where there is no
    // _site/.vite/manifest.json for closeBundle to copy. Vite 8 does not in fact
    // call closeBundle when a middleware-mode server closes (verified), so this
    // fixes no live crash; it declares the intent, and stops a future Vite
    // restoring that hook from turning every dev shutdown into an ENOENT.
    apply: 'build' as const,
    closeBundle() {
      const from = resolve(process.cwd(), '_site/.vite/manifest.json');
      const to = resolve(process.cwd(), MANIFEST_PATH);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      rmSync(resolve(process.cwd(), '_site/.vite'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [stashManifest()],
  // Lit uses legacy (experimental) decorators and requires class fields to NOT
  // be defined (tsconfig: `experimentalDecorators: true`,
  // `useDefineForClassFields: false`). As of vite 8.1 / rolldown 1.1 the oxc
  // transform no longer auto-derives EITHER from tsconfig, so set both
  // explicitly (see eleventy.config.js viteOptions.oxc for the full rationale —
  // this mirror covers vitest + `vite preview`):
  //   - decorator.legacy → raw `@customElement` else illegal `@` → SyntaxError.
  //   - setPublicClassFields + removeClassFieldsWithoutInitializer =
  //     useDefineForClassFields:false, else a declare-only `@query('#map')`
  //     field shadows the decorator getter → this.mapElement undefined → map
  //     never constructs.
  oxc: {
    decorator: {
      legacy: true,
    },
    assumptions: {
      setPublicClassFields: true,
    },
    typescript: {
      removeClassFieldsWithoutInitializer: true,
    },
  },
  optimizeDeps: {
    // Without this, Vite's dev pre-bundler tries to esbuild wa-sqlite.wasm into
    // node_modules/.vite/deps/, which 404s (esbuild can't produce .wasm). Excluding
    // it makes Vite resolve wa-sqlite to its source path and serve the .wasm via /@fs.
    exclude: ['wa-sqlite'],
  },
  // `npm run dev` runs Vite in middleware mode inside the Eleventy dev server
  // (eleventy.config.js), which DOES load this file — so unlike under the old plugin,
  // dev-server options belong here now. Vite's host-check middleware still runs in
  // middleware mode, so reaching the dev server by an external hostname needs the
  // host whitelisted.
  server: {
    // Eleventy writes 1668 files into _site on every rebuild, and Vite's watcher
    // would treat each one as a change and fire a page reload per file. Eleventy's
    // own dev server already handles reloading its output; Vite here only serves
    // modules out of src/.
    watch: { ignored: ['**/_site/**'] },
    // The ~227 MB WA tile archive is a server-side artifact: built quarterly by
    // data/build-basemap.sh and served on maderas through an Apache Alias, never
    // checked in and never in _site. Without this, every local run of the app
    // falls back to the blank basemap, so nothing about the real basemap can be
    // QA'd locally. Proxying is the whole fix — the archive is read with HTTP
    // range requests, which pass through untouched.
    //
    // A proxy rather than pointing the style at https://beeatlas.net directly:
    // the origin serves no CORS headers, so a cross-origin fetch is blocked, and
    // teaching the style an alternate origin would put a dev-only branch in the
    // shipped bundle. /basemap/fonts and /basemap/sprites are NOT proxied — they
    // ship with the code and Eleventy already serves them.
    proxy: {
      '/basemap/tiles': { target: 'https://beeatlas.net', changeOrigin: true },
    },
    allowedHosts: [
      'maderas.amandrai.net',
      // Tailscale MagicDNS name — lets `tailscale serve` proxy the dev server over
      // HTTPS for on-device (iOS) testing, which needs a secure context for
      // geolocation + PWA install. (Phase 152 UAT.)
      'peters-macbook-air.tail5d2e45.ts.net',
    ],
  },
  // NO `define` here, deliberately. A defined value lands inside a content-hashed
  // chunk, so anything that varies per build — a clock (beeatlas-96m) or the git sha
  // (beeatlas-4uj) — changes every asset URL on every build and defeats hashed
  // filenames. The build identifier now travels in the slim manifest, which is not
  // content-hashed and is served no-cache (scripts/postbuild-data.mjs).
  // publicDir is OFF (beeatlas-d3y). Under eleventy-plugin-vite, Vite's publicDir
  // copy was how `public/` reached the site root, so disabling it silently dropped
  // /data and /feeds. That is no longer true: Eleventy passthrough now places
  // `public/app` directly, and `_site/data` is owned wholesale by
  // scripts/postbuild-data.mjs, which rm -rf's and rebuilds it from the data dir.
  // Letting Vite copy public/ here would just re-stage 1275 files for that script
  // to delete.
  publicDir: false,
  build: {
    // OFF deliberately. This was `true` while nothing loaded it — the old
    // eleventy-plugin-vite path never read vite.config.ts, so no sourcemaps ever
    // shipped. Backend integration makes this file live again, and turning it on by
    // accident would publish ~4 MB of maps (bee-atlas alone is 4 MB) and the app's
    // sources. Flip it locally when debugging a production chunk.
    sourcemap: false,
    // Vite BACKEND INTEGRATION (beeatlas-d3y, ADR 0016). Vite builds the app only —
    // the seven entry modules the templates reference — and writes the manifest.
    // Eleventy reads it (lib/vite-manifest.js, via the `viteAssets` shortcode) and
    // emits the hashed <script> and <link> tags itself, so no HTML passes through Vite.
    //
    // WHY: the old eleventy-plugin-vite ran Vite in appType:"mpa" over the whole
    // output, making all 1668 built pages Vite entry points. Measured 2026-07-30:
    // 5.58s for that pass vs 1.00s for this app-only build — ~4.6s of pure HTML
    // reprocessing on every publish, including note-only publishes that cannot
    // change a single byte of the bundle.
    //
    // outDir is _site, but this build NO LONGER EMPTIES IT (beeatlas-8df).
    //
    // It used to: `emptyOutDir: true` made the app bundle the site's cleaning
    // boundary. That was load-bearing but misplaced, and it cost a whole second
    // code path. With `emptyOutDir: false` a second build leaves BOTH the old and
    // new `app-entry-<hash>.js` in _site/assets, and vite-plugin-pwa's glob
    // precaches both — 21 asset URLs against 15 on a clean build, so every install
    // downloads dead chunks, unbounded across builds. So SOMETHING must clean; the
    // question is only what.
    //
    // Vite is the wrong owner of it, for two reasons. First, a skip has to
    // impersonate it: build-app.mjs reuses an unchanged bundle, so it had to
    // reproduce the emptying itself and be verified byte-identical against a
    // Vite-ran tree (ADR 0019). Two paths that must not diverge is a standing tax.
    // Second, emptying ALL of _site means this step deletes output belonging to
    // Eleventy and to postbuild-data — which is exactly what one-producer-per-
    // artifact forbids once the render is a graph node (stelis st-hdm).
    //
    // So scripts/build-app.mjs now owns cleaning on EVERY path: it clears _site
    // except assets/, runs Vite only when the bundle's inputs moved, and then
    // prunes anything in assets/ the manifest does not name — which is what
    // actually kills stale chunks, and does it whether or not Vite ran.
    manifest: true,
    outDir: '_site',
    assetsDir: 'assets',
    emptyOutDir: false,   // scripts/build-app.mjs cleans instead — see above
    rollupOptions: {
      // Every module a template references. A template asking for an entry that is
      // not listed here fails the build: assetTags() throws with the known-entry list
      // when Eleventy renders it. There is no separate drift-checking script — the
      // render IS the check, because every entry is reached by some page.
      input: [
        // src/bee-atlas.ts is NOT an entry. It was, while `/` mounted the map
        // directly and `/app/` mounted it plus the service worker — the two-entry
        // split WAS the no-SW-on-/ guarantee. ADR 0029 merged those pages, so the
        // only way into the app is src/app-entry.ts and bee-atlas is just its
        // biggest import. Re-adding it here would hand a template a way to mount
        // the map without registering the worker or priming, which is the one
        // thing this list should make impossible.
        'src/app-entry.ts',
        'src/entries/bee-header.ts',
        'src/entries/species-index.ts',
        'src/entries/taxon-page.ts',
        'src/index.css',
        'src/styles/places.css',
      ],
    },
  },
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
    // Lit's dev-mode banner fires once per file that imports lit — pure noise
    // in test logs. Drop exactly that line; everything else must stay visible
    // (silencing broadly is how real errors hide, beeatlas-556).
    onConsoleLog(log) {
      if (log.includes('Lit is in dev mode.')) return false;
    },
    // Exclude stale agent worktrees and Eleventy build output from test discovery.
    // (.claude/worktrees/ and .claire/worktrees/ hold snapshots from prior agent runs; _site/ is build output.)
    // infra/ holds the CDK assertion test — a plain script that imports aws-cdk-lib
    // from infra/node_modules. It is NOT a root Vitest test; collecting it breaks
    // `npm test` (and the deploy gate) in CI where aws-cdk-lib is not a root dep.
    // Run it via `cd infra && npm test` (compiles to dist/, then runs node).
    exclude: [
      '**/node_modules/**', '**/.claude/**', '**/.claire/**', '**/_site/**', '**/dist/**', '**/infra/**',
      // *.data.test.ts need the pipeline's artifacts (species.json, higher_taxa.json,
      // …) resolved by lib/build-data-dir.js — EXPORT_DIR if set, else public/data,
      // which is gitignored. A clean CI checkout has neither, so they are excluded
      // from the default run and executed by the nightly on maderas, where the data
      // genuinely exists (data/nightly.sh, after `npm run fetch-data`).
      //
      // Do NOT "fix" a red CI run by deleting this exclusion or by pointing the
      // workflow at S3: js-tests.yml is deliberately credential-free
      // (permissions: contents: read). Adding a data fetch there undoes that.
      // Locally, run them with `npm run test:data` once you have public/data.
      ...(process.env.BEEATLAS_DATA_TESTS === '1' ? [] : ['**/*.data.test.ts']),
    ],
  },
  // NOTE: `server.*` (e.g. allowedHosts) does NOT belong here. The dev
  // server is `eleventy --serve`, which runs Vite in middleware mode via
  // @11ty/eleventy-plugin-vite rooted at `.11ty-vite/` — this file is never
  // loaded on that path. Set dev-server options in eleventy.config.js under
  // `viteOptions.server` instead. (This file is read by `vitest` and by
  // production `vite build`/`vite preview` only.)
});
