// Emit the <script>/<link> tags for a Vite entry, from the build manifest.
//
// This is the Eleventy half of Vite BACKEND INTEGRATION (beeatlas-d3y). Vite builds
// the app only and writes `.vite/manifest.json`; nothing Eleventy renders ever passes
// through Vite, so the tags Vite used to inject into each page are emitted here
// instead — hashed URLs read out of the manifest.
//
// Replaces eleventy-plugin-vite's whole-output pass, which made all 1668 built pages
// Vite entry points: measured 5.58s for that pass vs 1.00s for the app-only build.
//
// Tag shape follows Vite's documented backend-integration guidance and matches what
// the plugin emitted for `/app/index.html`: a module script for the entry chunk,
// `modulepreload` for its transitive static imports, and a stylesheet link per CSS
// file the entry (or any import) pulls in.
//
// Duplicate tags across a layout + page pair (both pull in bee-header's chunks) are
// harmless and deliberately not deduplicated across calls: module scripts are keyed
// by URL in the browser's module map, so a repeated URL is fetched and executed once.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Cached across the build: Eleventy renders 1668 pages and every one of them asks
// for tags. Vite runs before Eleventy in `npm run build`, so the file is stable for
// the whole run.
let cached = null;

// Written by vite.config.ts's stash-manifest plugin, which imports this constant so
// the writer and reader cannot drift. Deliberately OUTSIDE _site so it survives
// between builds — a note-only publish reruns Eleventy alone and must still resolve
// hashed asset URLs from the last app build — and outside node_modules, which
// `npm ci` deletes.
export const MANIFEST_PATH = '.cache/beeatlas-vite/manifest.json';

export function loadManifest(root) {
  if (cached) return cached;
  const path = join(root, MANIFEST_PATH);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `vite-manifest: ${path} not found.\n` +
      '  Eleventy reads the Vite manifest to emit hashed asset URLs, so the app build\n' +
      '  must have run at least once. Use `npm run build`, or `npm run build:app` if\n' +
      '  you only need to refresh the bundle before rendering.',
    );
  }
  cached = JSON.parse(raw);
  return cached;
}

// The transitive static imports of a chunk, deepest first, each visited once.
function collectImports(manifest, key, seen = new Set(), out = []) {
  const chunk = manifest[key];
  if (!chunk) return out;
  for (const dep of chunk.imports ?? []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    collectImports(manifest, dep, seen, out);
    out.push(dep);
  }
  return out;
}

// All stylesheets an entry needs: its own plus every transitive import's, in
// dependency order and deduplicated (bee-header's index.css is pulled in by several
// entries on the same page).
function collectCss(manifest, key, imports) {
  const css = [];
  for (const k of [...imports, key]) {
    for (const href of manifest[k]?.css ?? []) {
      if (!css.includes(href)) css.push(href);
    }
  }
  return css;
}

/**
 * The tags one entry needs — PURE, so the emitted HTML can be asserted directly
 * against a fixture manifest rather than through a build (docs/lessons-learned.md:
 * assert the thing that actually ships). `assetTags` below is the IO seam.
 *
 * @param manifest parsed Vite manifest
 * @param key      manifest key = the entry's source path, e.g. "src/entries/taxon-page.ts"
 * @returns HTML string of the tags that entry needs
 */
export function tagsFromManifest(manifest, key) {
  const chunk = manifest[key];
  if (!chunk) {
    throw new Error(
      `vite-manifest: no entry "${key}" in the Vite manifest.\n` +
      `  Known entries: ${Object.keys(manifest).filter((k) => manifest[k].isEntry).join(', ')}\n` +
      '  Add the module to build.rollupOptions.input in vite.config.ts.',
    );
  }

  const tags = [];

  // A CSS entry (src/index.css, src/styles/places.css) has no JS to load.
  const isCssEntry = chunk.file.endsWith('.css');
  if (isCssEntry) {
    tags.push(`<link rel="stylesheet" crossorigin href="/${chunk.file}">`);
    return tags.join('\n');
  }

  const imports = collectImports(manifest, key);
  tags.push(`<script type="module" crossorigin src="/${chunk.file}"></script>`);
  for (const dep of imports) {
    tags.push(`<link rel="modulepreload" crossorigin href="/${manifest[dep].file}">`);
  }
  for (const href of collectCss(manifest, key, imports)) {
    tags.push(`<link rel="stylesheet" crossorigin href="/${href}">`);
  }
  return tags.join('\n');
}

// The IO seam: same tags, manifest read from disk. What eleventy.config.js's
// `viteAssets` shortcode calls.
export function assetTags(root, key) {
  return tagsFromManifest(loadManifest(root), key);
}

// Dev counterpart: the Vite dev server serves modules from source, so the tags are
// the raw paths plus Vite's HMR client.
//
// `/@vite/client` is emitted on EVERY call rather than tracked and emitted once. The
// browser keys module scripts by URL, so repeats are fetched and executed once — and
// "first call wins" bookkeeping gets the position wrong anyway: Eleventy renders page
// content before its layout, so the body's call would claim the flag while its output
// lands below the layout's tags, putting the HMR client after the modules it serves.
export function devAssetTags(key) {
  return [
    '<script type="module" src="/@vite/client"></script>',
    key.endsWith('.css')
      ? `<link rel="stylesheet" href="/${key}">`
      : `<script type="module" src="/${key}"></script>`,
  ].join('\n');
}
