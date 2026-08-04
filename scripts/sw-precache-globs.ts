/**
 * What the service worker precaches, as data (beeatlas-6rs).
 *
 * Lifted out of vite.sw.config.ts so src/tests/basemap-precache.test.ts can run
 * these EXACT patterns through workbox's own globber rather than re-declaring
 * them. Two copies of this list is the failure this file exists to prevent: every
 * omission here is invisible until someone is standing in a forest with a blank
 * map and a clean console.
 *
 * Paths are relative to _site/ (workbox's globDirectory) with no leading slash;
 * modifyURLPrefix turns them into absolute site paths afterwards.
 */

export const globPatterns = [
  // The app shell. `index.html` matches the ROOT page only — the pattern has no
  // globstar, so the 1600-odd `species/…/index.html` files are not swept in with it.
  // That they are not is the whole of ADR 0029's read-path decision: the app goes
  // offline, the reading surface does not.
  'index.html',
  // The webmanifest and the icons, ~80 KB in total.
  //
  // These are the ones no amount of `fetch` instrumentation can find, because
  // nothing in the app requests them: `index.html` links them, and the
  // BROWSER fetches them when it launches a standalone PWA. Offline and
  // unprecached they fail, and iOS answers a failed request in an installed app
  // with the system "Turn On Wi-Fi to Use the Internet" alert — a modal over a
  // map that is otherwise working perfectly. The webmanifest also names three of
  // the icons itself, so it is not enough to ship it alone.
  'pwa/manifest.webmanifest',
  'pwa/icons/**/*.png',
  // `.wasm` is load-bearing for offline cold-start: the wa-sqlite engine binary
  // (assets/wa-sqlite-<hash>.wasm) must be precached or the SQL worker can't
  // initialize offline → tablesReady never resolves → the "Loading…" curtain
  // hangs forever (Phase 151 real-device UAT).
  'assets/**/*.{js,css,wasm}',

  // --- The basemap RENDERER (beeatlas-6rs). Not the map data; these are the
  // small files without which the map cannot draw at all. Each fails silently
  // when absent, which is why they are enumerated rather than assumed.

  // The MapLibre worker and the chunk it imports as a sibling. Missing, tiles sit
  // in `loading` forever, the map's `load` event never fires, and the map is a
  // blank rectangle with nothing in the console. See src/tests/maplibre-worker.test.ts.
  //
  // IT MUST SIT INSIDE THE REGISTERED SCOPE. A dedicated worker is its own
  // service-worker client, matched against the registration by its OWN URL, so a
  // worker outside the scope never reaches the cache — precaching it there is a
  // no-op that looks correct in every test. It lived at `app/basemap/…` for exactly
  // that reason while the scope was `/app/`; ADR 0029 widened the scope to the
  // origin, which is what lets it sit beside the fonts and sprites again.
  // basemap-precache.test.ts reads the scope out of src/sw-registration.ts and
  // re-checks the containment, so a future narrowing fails there rather than in a
  // forest.
  'basemap/maplibre/*.mjs',
  // MapLibre fetches glyph ranges LAZILY BY CODEPOINT, so a range that was never
  // exercised online renders as blank boxes offline — again with no error. All
  // three vendored stacks x three ranges, ~800 KB total. The stacks and ranges
  // themselves are pinned by src/basemap-style.ts (VENDORED_FONTSTACKS,
  // VENDORED_GLYPH_RANGES) and asserted against disk in basemap-style.test.ts.
  'basemap/fonts/**/*.pbf',
  // The icon sheets, at both densities. Both the .json index and the .png sheet
  // are required; MapLibre treats a missing sprite as a style-load failure.
  'basemap/sprites/*.{json,png}',
];

export const globIgnores = [
  // Runtime data artifacts. These are primed into Cache Storage by
  // src/prime-orchestrator.ts instead, which reports byte progress; precaching
  // them here would make the SW install a silent 33 MB download.
  'data/**',
  'feeds/**',
  '**/*.db',
  '**/*.geojson',
  '**/*.parquet',
  // NOTE: the app icons are NOT ignored. A blanket '**/*.png' used to live here
  // and was doubly wrong — it swallowed basemap/sprites/light{,@2x}.png (and
  // globIgnores beats globPatterns, so listing the sprites was not enough on its
  // own), and excluding the icons meant iOS re-requested them on every offline
  // launch and raised a system network alert each time.
  // The service worker must never precache itself. (`sw.js` since ADR 0029; the
  // globstar form also covers a device still holding the old `app/sw.js`.)
  '**/sw.js',
  'sw.js',
];
