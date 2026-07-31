// Pure set arithmetic over the Vite manifest's asset list, used by the bundle-reuse
// gate (scripts/build-app.mjs, beeatlas-bon / ADR 0019).
//
// It lives here, separated from the gate, because the gate's riskiest operation is a
// DELETE — it removes files from `_site/assets` that the manifest does not name — and
// the decision about which those are needs to be testable without running a build.

/**
 * Every file the manifest claims the bundle emitted, as outDir-relative paths
 * ('assets/app-entry-hash.js'). Covers entry chunks, shared chunks, CSS and static
 * assets; `imports`/`dynamicImports` name other manifest KEYS, whose own entries are
 * visited by this same loop, so nothing reachable is missed.
 * @param {Record<string, {file?: string, css?: string[], assets?: string[]}>} manifest
 * @returns {string[]} sorted
 */
export function manifestAssetPaths(manifest) {
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.file) files.add(entry.file);
    for (const css of entry?.css ?? []) files.add(css);
    for (const asset of entry?.assets ?? []) files.add(asset);
  }
  return [...files].sort();
}

/**
 * Which files on disk under `assets/` the manifest does not name — the ones a reusing
 * build must delete so the directory is exactly what Vite would have emitted, rather
 * than a superset that accumulates dead chunks forever (ADR 0016's regression).
 *
 * COMPARES FULL RELATIVE PATHS, deliberately. The obvious implementation compares
 * manifest basenames against top-level directory entries, and that is wrong the moment
 * Vite nests anything: for a manifest naming `assets/species/index-abc.js`, a top-level
 * listing yields `species`, which matches no manifest name, so the whole directory gets
 * deleted — right after the gate's presence check confirmed those files were there.
 * Not hypothetical: scripts/validate-bundle-size.mjs carries an explicit branch for
 * `assets/species/index-*.js` because Vite has emitted that shape here.
 *
 * @param {string[]} manifestPaths outDir-relative, e.g. 'assets/app-entry-x.js'
 * @param {string[]} diskPaths assets/-relative, e.g. 'app-entry-x.js', 'species/index-x.js'
 * @returns {string[]} sorted subset of diskPaths that is unnamed
 */
export function unnamedAssetPaths(manifestPaths, diskPaths) {
  const named = new Set(
    manifestPaths
      .filter(p => p.startsWith('assets/'))
      .map(p => p.slice('assets/'.length)),
  );
  return diskPaths.filter(p => !named.has(p)).sort();
}
