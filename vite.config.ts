import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  plugins: [preloadAssets()],
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
    // Exclude stale agent worktrees and Eleventy build output from test discovery.
    // (.claude/worktrees/ and .claire/worktrees/ hold snapshots from prior agent runs; _site/ is build output.)
    // infra/ holds the CDK assertion test — a ts-node script that imports aws-cdk-lib
    // from infra/node_modules. It is NOT a root Vitest test; collecting it breaks
    // `npm test` (and the deploy gate) in CI where aws-cdk-lib is not a root dep.
    // Run it via `cd infra && npx ts-node test/beeatlas-stack.test.ts`.
    exclude: ['**/node_modules/**', '**/.claude/**', '**/.claire/**', '**/_site/**', '**/dist/**', '**/infra/**'],
  },
  // NOTE: `server.*` (e.g. allowedHosts) does NOT belong here. The dev
  // server is `eleventy --serve`, which runs Vite in middleware mode via
  // @11ty/eleventy-plugin-vite rooted at `.11ty-vite/` — this file is never
  // loaded on that path. Set dev-server options in eleventy.config.js under
  // `viteOptions.server` instead. (This file is read by `vitest` and by
  // production `vite build`/`vite preview` only.)
});
