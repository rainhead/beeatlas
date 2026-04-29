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

export default function (eleventyConfig) {
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
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
  };
}
