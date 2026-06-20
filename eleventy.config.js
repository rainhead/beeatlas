// Eleventy 3.x outer build config. The Vite SPA is passed through
// to _site/ unchanged; @11ty/eleventy-plugin-vite then bundles
// client JS/CSS via Vite (rename-and-build mechanism — see
// 074-RESEARCH.md §Pattern 1).
//
// dir.input = "_pages" intentionally — disjoint from src/ (SPA
// TypeScript) so Eleventy doesn't try to template .ts files.
// Phase 75 populates _pages/ with an authoring scaffold; this
// phase leaves it empty (only .gitkeep).
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { quantify } from "./src/lib/quantify.js";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import { execSync } from "node:child_process";

// Build identifier shown in the offline cache popover so a stale installed PWA
// is diagnosable at a glance (iOS keeps an old SW + caches across reinstalls).
// Prefer the CI commit SHA; fall back to local git; then to "dev".
function buildVersion() {
  let sha = process.env.GITHUB_SHA || "";
  if (!sha) {
    try { sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); } catch { /* no git */ }
  }
  const short = sha ? sha.slice(0, 7) : "dev";
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `${short} · ${stamp}Z`;
}

export default function (eleventyConfig) {
  // Single pluralization utility for all count-noun copy (e.g. "1 genus" vs
  // "3 genera"). Pass an explicit plural for irregular nouns:
  //   {{ count | quantify("genus", "genera") }}
  eleventyConfig.addFilter("quantify", quantify);

  // The SPA entry lives in _pages/index.html and is rendered as an
  // Eleventy template (plain HTML, no front-matter). DEVIATION from
  // the original plan: `addPassthroughCopy({ "index.html": "index.html" })`
  // is intentionally NOT used here. The `@11ty/eleventy-plugin-vite`
  // plugin skips its Vite build pass when Eleventy writes 0 templated
  // outputs (see `node_modules/@11ty/eleventy-plugin-vite/.eleventy.js`
  // line 81: `results.length === 0`). Passthroughs do not count toward
  // `results`. Therefore the SPA entry must be a template, not a
  // passthrough, for Vite to run and rewrite the `<script type="module">`
  // tag with the hashed `/assets/index-*.js` path.
  //
  // Pass src/ through so Vite (running in the renamed temp folder)
  // can resolve "./src/bee-atlas.ts" and "./src/index.css" from
  // index.html. Vite then bundles + hashes the result into
  // _site/assets/.
  eleventyConfig.addPassthroughCopy({ "src": "src" });
  // NOTE: do NOT add `addPassthroughCopy({ "public": "/" })` explicitly.
  // The eleventy-plugin-vite wrapper auto-registers
  // `addPassthroughCopy(viteOptions.publicDir || "public")`, which
  // copies `public/` → `_site/public/`. Then Vite's build picks up
  // `<.11ty-vite>/public/*` via its default `publicDir` handling and
  // copies the contents into the final outDir (`_site/`) at site root.
  // The two-step (Eleventy passthrough → Vite publicDir copy) is
  // load-bearing because Vite's rename-and-build mechanism destroys
  // anything in `_site/` that Vite did not produce. (Source:
  // node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:163 — the
  // plugin rms `.11ty-vite/` after Vite finishes; only files Vite
  // emitted into `outDir` survive.)

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      // appType: "mpa" is the plugin default; explicit for clarity.
      // Do NOT set viteOptions.root or viteOptions.build.outDir —
      // the plugin overrides them at build time (research §Anti-Patterns).
      appType: "mpa",
      // The plugin runs Vite rooted at `.11ty-vite/` (the renamed temp
      // folder) for the dev server, so Vite's auto-discovery of
      // repo-root `.env` files and `vite.config.ts` settings does NOT
      // carry through to the dev pipeline. Repeat the dev-critical bits
      // here so they reach Vite via the plugin's invocation:
      //   - envDir: process.cwd() — let Vite read /.env at repo root so
      //     `import.meta.env.VITE_MAPBOX_TOKEN` (and VITE_DATA_BASE_URL)
      //     populate during `npm run dev`.
      //   - optimizeDeps.exclude: ['wa-sqlite'] — without this, Vite's
      //     dev pre-bundler tries to esbuild wa-sqlite.wasm into
      //     `node_modules/.vite/deps/`, which 404s (esbuild can't
      //     produce .wasm). Excluding from optimization makes Vite
      //     resolve wa-sqlite to its source path and serve the .wasm
      //     directly via /@fs.
      // Production `vite build` discovers vite.config.ts via cwd and
      // works without this — it's a dev-server-only concern.
      envDir: process.cwd(),
      // Compile-time build identifier surfaced in the offline cache popover.
      define: {
        __APP_VERSION__: JSON.stringify(buildVersion()),
      },
      optimizeDeps: {
        exclude: ["wa-sqlite"],
      },
      // server.* must live HERE, not in vite.config.ts — same reason as
      // above: the dev server runs Vite in middleware mode rooted at
      // `.11ty-vite/` and never loads vite.config.ts, so `allowedHosts`
      // set there has no effect. Vite's host-check middleware still runs
      // in middleware mode, so reaching `eleventy --serve` via an external
      // hostname (e.g. proxied through maderas) requires whitelisting it
      // here. The plugin deep-merges this with its default
      // `server: { middlewareMode: true }`.
      server: {
        allowedHosts: ["maderas.amandrai.net"],
      },
      // vite-plugin-pwa must live HERE, not in vite.config.ts — same reason
      // as server.* above: the dev server and build run Vite rooted at
      // `.11ty-vite/` and never load `vite.config.ts`, so a plugin wired
      // there would be silently ignored. Absolute paths for outDir,
      // globDirectory, and swDest are required because relative paths resolve
      // relative to `.11ty-vite/` (not the project root), and `.11ty-vite/`
      // is deleted after the build. process.cwd() is the established idiom
      // for project-root paths in this file (see envDir above).
      plugins: [
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',         // .11ty-vite/src/sw.ts (src/ is Eleventy passthrough)
          filename: 'sw.ts',     // .ts extension triggers TypeScript SW sub-build
          outDir: resolve(process.cwd(), '_site/app'),  // compiled SW lands at _site/app/sw.js
          base: '/',             // ensures precache URLs have a leading / (RESEARCH Open Q1)
          injectRegister: null,  // D-06: keep Phase 147 registration; no competing <script>
          manifest: false,       // D-07: no webmanifest until Phase 151
          injectManifest: {
            globDirectory: resolve(process.cwd(), '_site'),  // scan full output tree
            swDest: resolve(process.cwd(), '_site/app/sw.js'),  // injection writes here
            // `.wasm` is load-bearing for offline cold-start: the wa-sqlite engine
            // binary (assets/wa-sqlite-<hash>.wasm) must be precached or the SQL
            // worker can't initialize offline → tablesReady never resolves → the
            // "Loading…" curtain hangs forever (Phase 151 real-device UAT, PWA-03).
            globPatterns: ['app/index.html', 'assets/**/*.{js,css,wasm}'],
            globIgnores: [
              'data/**', 'feeds/**', '**/*.db', '**/*.geojson',
              '**/*.parquet', '**/*.png', '**/sw.js',
            ],
            maximumFileSizeToCacheInBytes: 30_000_000,  // D-03: 30 MB cap (Phase 149 readiness)
            // Glob paths are relative to globDirectory (_site/) without a leading /.
            // modifyURLPrefix prepends / so precache URLs are absolute site paths
            // (e.g. /app/index.html, /assets/app/index-<hash>.js) as required by
            // the criterion-4 assertion and the SW precache cache-key contract.
            modifyURLPrefix: { '': '/' },
          },
        }),
      ],
      // publicDir defaults to "public" (Vite default). The plugin
      // auto-registers `addPassthroughCopy("public")` (.eleventy.js
      // line 40) so `public/` → `_site/public/` (then renamed to
      // `.11ty-vite/public/`). Vite's default publicDir handling then
      // copies the contents back to `_site/` at site root, satisfying
      // the runtime URL contract `/data/...`, `/feeds/...`, etc.
    },
  });

  return {
    dir: {
      input: "_pages",
      output: "_site",
      // includes/layouts/data are normalized RELATIVE to dir.input by
      // Eleventy 3.x (see node_modules/@11ty/eleventy/src/Util/ProjectDirectories.js
      // setLayouts: TemplatePath.join(this.input, dir)). We keep the
      // physical directories at repo root (_includes/, _layouts/, _data/)
      // — established by Phase 74 — and use ".." traversal here so the
      // resolved paths land at repo root rather than under _pages/.
      // See 075-01-SUMMARY.md (Plan 075-01 Rule 1 deviation).
      includes: "../_includes",
      layouts: "../_layouts",
      data: "../_data",
    },
  };
}
