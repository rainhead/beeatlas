import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  plugins: [preloadAssets()],
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
    exclude: ['wa-sqlite'],
  },
  // NOTE: do NOT set `publicDir: false`. The eleventy-plugin-vite
  // build pipeline relies on Vite's default publicDir behavior to
  // copy passthrough assets (placed under `<.11ty-vite>/public/` by
  // Eleventy) into the final `_site/` root. Disabling publicDir here
  // would silently drop /data, /feeds, /db at runtime.
  build: {
    sourcemap: true,
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
    // infra/ holds the CDK assertion test — a ts-node script that imports aws-cdk-lib
    // from infra/node_modules. It is NOT a root Vitest test; collecting it breaks
    // `npm test` (and the deploy gate) in CI where aws-cdk-lib is not a root dep.
    // Run it via `cd infra && npx ts-node test/beeatlas-stack.test.ts`.
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
