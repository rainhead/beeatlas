// Eleventy 3.x outer build config.
//
// Eleventy owns HTML; Vite owns the app bundle. They meet at the stashed manifest
// (`.cache/beeatlas-vite/manifest.json`, lib/vite-manifest.js MANIFEST_PATH — Vite
// writes it to `_site/.vite/` and the stash plugin moves it there, outside _site so
// it is never published and outside node_modules so `npm ci` cannot destroy it).
// (Vite BACKEND INTEGRATION, beeatlas-d3y): `vite build` runs FIRST and writes the
// manifest, then Eleventy renders pages and emits the hashed <script>/<link> tags
// itself via the `viteAssets` shortcode below (lib/vite-manifest.js).
//
// This replaced @11ty/eleventy-plugin-vite, which ran Vite in appType:"mpa" over the
// whole output — every one of the 1668 built pages was a Vite entry point, and its
// rename-and-build destroyed anything in _site that Vite had not produced. Measured
// 2026-07-30: that pass cost 5.58s against 1.00s for the app-only build, i.e. ~4.6s
// of HTML reprocessing on every publish, including note-only publishes that cannot
// change a byte of the bundle.
//
// Removing the plugin also let the Vite configuration collapse back into
// vite.config.ts. The plugin ran Vite rooted at `.11ty-vite/` and never loaded that
// file, which is why `envDir`, `optimizeDeps`, `server.allowedHosts`, `define` and
// the whole `oxc`/decorator block had to be repeated here — including the duplicated
// decorator config behind the 2026-07-10 site-wide outage. There is now one place.
//
// dir.input = "_pages" intentionally — disjoint from src/ (SPA TypeScript) so
// Eleventy doesn't try to template .ts files.
import { quantify } from "./src/lib/quantify.js";
import { formatDate } from "./src/lib/formatDate.js";
import { assetTags, devAssetTags } from "./lib/vite-manifest.js";

const ROOT = import.meta.dirname;
const IS_SERVE = process.env.ELEVENTY_RUN_MODE === "serve";

export default async function (eleventyConfig) {
  // Single pluralization utility for all count-noun copy (e.g. "1 genus" vs
  // "3 genera"). Pass an explicit plural for irregular nouns:
  //   {{ count | quantify("genus", "genera") }}
  eleventyConfig.addFilter("quantify", quantify);

  // Renders an ISO timestamp as "Jul 4, 2026" — shared verbatim with the
  // bee-notes island (src/lib/formatDate.js) so baked and live note
  // timestamps never diverge (Phase 179).
  eleventyConfig.addFilter("formatDate", formatDate);

  // {% viteAssets "src/entries/taxon-page.ts" %} — the tags for one Vite entry.
  // The argument is the manifest key, i.e. the module's path from the project root,
  // and must appear in build.rollupOptions.input (vite.config.ts).
  //
  // In `--serve` the Vite dev server serves modules from source, so the raw path is
  // emitted instead, alongside Vite's HMR client.
  eleventyConfig.addShortcode("viteAssets", (key) =>
    IS_SERVE ? devAssetTags(key) : assetTags(ROOT, key));

  // `public/app` holds the PWA shell's static files (webmanifest + icons) at their
  // runtime URLs under /app. It is copied directly now; under the old plugin it
  // reached the site root by a two-step dance (Eleventy passthrough into the renamed
  // temp folder, then Vite's publicDir copy back out).
  //
  // `public/data` is deliberately NOT passed through. scripts/postbuild-data.mjs owns
  // _site/data wholesale — it rm -rf's the directory and rebuilds it from the build
  // data dir — so the old passthrough staged 1275 files for that script to delete,
  // and under EXPORT_DIR it staged them from the wrong place (the repo's public/data
  // rather than the export).
  eleventyConfig.addPassthroughCopy({ "public/app": "app" });

  // In serve mode Vite runs as middleware inside the Eleventy dev server, so
  // /@vite/client, /src/*.ts and pre-bundled deps resolve while Eleventy serves the
  // HTML around them. This is the one piece of the old plugin worth keeping, minus
  // the rename-and-build: dev needs a module server, the production build does not.
  if (IS_SERVE) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: `${ROOT}/vite.config.ts`,
      appType: "custom",
      server: { middlewareMode: true },
    });
    eleventyConfig.setServerOptions({ middleware: [vite.middlewares] });
  }

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
