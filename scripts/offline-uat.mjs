#!/usr/bin/env node
/**
 * offline-uat.mjs — automated offline cold-start UAT for the /app PWA (beeatlas-6rs).
 *
 * WHY THIS EXISTS. Every offline failure this project has had was iOS-only and
 * SILENT: a missing worker, an unshipped glyph range, a manifest that was never
 * cached. None of them threw, none of them failed a unit test, and each was found
 * by a person standing somewhere with no signal. This closes that loop on a
 * laptop.
 *
 * THE FOUR THINGS THAT MAKE IT A REAL TEST, none of which a normal Playwright
 * script does by default:
 *
 *  1. `launchPersistentContext`, not `launch`. Service workers and Cache Storage
 *     live in a browser profile. An incognito-ish context throws them away, so a
 *     "cold start" would test nothing — the whole question is what survives.
 *  2. `webkit`, not `chromium`. It is the only automatable engine that shares
 *     Safari's Cache Storage, Response.clone() and quota behaviour. Chromium
 *     passing proves nothing about the platform this app is actually used on.
 *     (--browser=chromium is available for comparison; a difference between the
 *     two IS the finding.)
 *  3. `addInitScript` sets navigator.standalone before any app code runs, so the
 *     app believes it is an installed PWA. The download is gated on that, and it
 *     is not something a page can be talked into after the fact.
 *  4. `context.setOffline(true)` + a full reload. Not `page.route(abort)`, which
 *     leaves the service worker's own fetches alone and would quietly pass.
 *
 * Usage:
 *   node scripts/offline-uat.mjs                      # default: manifest-only, fast
 *   node scripts/offline-uat.mjs --prime              # + download the ~285 MB archives
 *   node scripts/offline-uat.mjs --browser=chromium   # compare engines
 *   node scripts/offline-uat.mjs --url=http://localhost:8080/app/
 *   node scripts/offline-uat.mjs --fresh              # discard the profile first
 *
 * The profile persists under .cache/beeatlas-offline-uat/<browser>, so a primed
 * run is paid for once and every later run starts from a warm 285 MB cache.
 */

import { chromium, webkit } from 'playwright';
import { rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const BROWSER = arg('browser', 'webkit');
const URL_ = arg('url', 'https://beeatlas.net/app/');
const PRIME = flag('prime');
const PROFILE = resolve(process.cwd(), '.cache/beeatlas-offline-uat', BROWSER);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (flag('fresh')) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const engine = BROWSER === 'chromium' ? chromium : webkit;
console.log(`\noffline-uat — ${BROWSER} · ${URL_}\nprofile: ${PROFILE}\n`);

const context = await engine.launchPersistentContext(PROFILE, {
  headless: !flag('headed'),
  viewport: { width: 430, height: 932 }, // iPhone-ish, so the mobile layout is what is tested
});

// Make the app believe it is installed. primeBasemap refuses otherwise — an
// installed PWA has its own storage bucket, so a download in a browser tab lands
// where the installed app can never read it (spike beeatlas-93t).
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
});

const page = context.pages()[0] ?? await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
// Console capture is not a nicety here: this whole area fails without throwing,
// so the warnings ARE the diagnosis. Everything the app says about the basemap
// is echoed, prefixed, so an offline run explains itself.
let echoConsole = false;
page.on('console', (m) => {
  const t = m.text();
  if (echoConsole && /basemap|pmtiles|maplibre|glyph|sprite/i.test(t)) {
    console.log(`    [page] ${t.slice(0, 300)}`);
  }
});

// ---------------------------------------------------------------------------
// ONLINE: boot, let the SW install, optionally prime
// ---------------------------------------------------------------------------
console.log('— online —');
await page.goto(URL_, { waitUntil: 'load' });

// A first load is UNCONTROLLED (no clientsClaim, by design), so reload until a
// controlled client exists — which is what every subsequent cold start will be.
// It takes more than one reload on a brand-new profile: the SW has to finish
// installing and activating first, and a single reload races that.
const activated = async () => {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated')) return true;
    await page.waitForTimeout(1000);
  }
  return false;
};
let controlled = false;
for (let i = 0; i < 4 && !controlled; i++) {
  await activated();
  await page.reload({ waitUntil: 'load' });
  // Control is decided at navigation time, but the registration object the page
  // sees settles a beat later. Poll rather than sampling once.
  for (let j = 0; j < 10 && !controlled; j++) {
    controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (!controlled) await page.waitForTimeout(500);
  }
}
check('service worker controls the page', controlled);
if (!controlled) { await context.close(); process.exit(1); }

// The basemap manifest self-primes on any successful online load. This is the
// pre-condition for everything else: the archives are named by date, so without
// it there is no source URL and a primed 285 MB is unreachable.
const online = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const names = await caches.keys();
  const counts = {};
  for (const n of names) counts[n] = (await (await caches.open(n)).keys()).length;
  const manifestKeys = names.includes('basemap-manifest')
    ? (await (await caches.open('basemap-manifest')).keys()).map((r) => r.url)
    : [];
  return { names, counts, manifestKeys };
});
check(
  'basemap manifest was self-primed into Cache Storage',
  online.manifestKeys.length > 0,
  online.manifestKeys.join(', ') || `caches: ${JSON.stringify(online.counts)}`,
);

if (PRIME) {
  console.log('— priming archives (~285 MB, once per profile) —');
  await page.evaluate(async () => {
    const atlas = document.querySelector('bee-atlas');
    atlas.dispatchEvent(new CustomEvent('basemap-download-requested', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(async () => {
    const c = await caches.open('basemap-archives');
    return (await c.keys()).length >= 2;
  }, null, { timeout: 900_000 });
  const primed = await page.evaluate(async () => {
    const c = await caches.open('basemap-archives');
    const out = [];
    for (const req of await c.keys()) out.push({ url: req.url, bytes: (await (await c.match(req)).blob()).size });
    return out;
  });
  for (const a of primed) check(`primed ${a.url.split('/').pop()}`, a.bytes > 0, `${a.bytes.toLocaleString()} bytes`);
}

// ---------------------------------------------------------------------------
// OFFLINE COLD START — chromium only
// ---------------------------------------------------------------------------
// The header explains WHY the default engine is webkit (it is the only
// automatable one sharing Safari's storage semantics) and that the offline half
// needs chromium because setOffline is unreliable in WebKit. Nothing acted on
// that: the offline half ran regardless, and under webkit the reload dies with
// "WebKit encountered an internal error" — an uncaught exception and a stack
// trace, AFTER the online checks have quietly passed. So the invocation the
// runbook documents always looked broken (beeatlas-69s). Stop before it, and
// report on what did run.
if (BROWSER !== 'chromium') {
  console.log(
    `\n— offline cold start: SKIPPED —\n` +
    `  Playwright's setOffline is not reliable in ${BROWSER}; the reload throws.\n` +
    `  Re-run with --browser=chromium --prime for the offline half.\n`,
  );
  await context.close();
  const onlineFailed = results.filter((r) => !r.pass);
  console.log(`${results.length - onlineFailed.length}/${results.length} online checks passed\n`);
  process.exit(onlineFailed.length ? 1 : 0);
}

console.log('— offline cold start —');
echoConsole = true;
await context.setOffline(true);
await page.goto('about:blank');
const netAttempts = [];
page.on('requestfailed', (r) => netAttempts.push(r.url()));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });

const state = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Do NOT wait on isStyleLoaded(): it is true IMMEDIATELY, because the map is
  // constructed with the local blank style and the real basemap is swapped in
  // afterwards by setStyle. Sampling on that flag reads the blank fallback and
  // reports a failure that is not there — which is exactly what this harness did
  // on its first run, and a false negative here is worse than no harness at all.
  // Wait for the thing actually being tested: a pmtiles source in the style.
  for (let i = 0; i < 60; i++) {
    const m = document.querySelector('bee-atlas')?.shadowRoot?.querySelector('bee-map')?._map;
    const s = m?.getStyle?.();
    const hasArchive = s && Object.values(s.sources ?? {})
      .some((v) => typeof v.url === 'string' && v.url.startsWith('pmtiles://'));
    if (hasArchive) { await wait(2000); break; } // settle, then let sources load
    await wait(500);
  }
  const beeMap = document.querySelector('bee-atlas')?.shadowRoot?.querySelector('bee-map');
  const m = beeMap?._map;
  const style = m?.getStyle();
  const sources = style ? Object.fromEntries(
    Object.entries(style.sources)
      .filter(([, v]) => typeof v.url === 'string' && v.url.startsWith('pmtiles://'))
      .map(([k, v]) => [k, v.url]),
  ) : {};
  const archiveKeys = (await (await caches.open('basemap-archives')).keys()).map((r) => r.url);
  return {
    appBooted: !!beeMap,
    // The tell for a manifest that did not survive: the style falls back to the
    // single-layer blank background, so occurrence dots render over blank paper.
    styleIsBlank: (style?.layers?.length ?? 0) <= 2,
    layerCount: style?.layers?.length ?? 0,
    sources,
    sourcesLoaded: Object.fromEntries(Object.keys(sources).map((k) => [k, m.isSourceLoaded(k)])),
    archiveKeys,
    offlineLabel: beeMap?.shadowRoot?.querySelector('.offline-basemap-label')?.textContent?.trim() ?? null,
  };
});

check('app shell booted offline', state.appBooted);
check(
  'the real basemap style loaded (not the blank fallback)',
  !state.styleIsBlank,
  `${state.layerCount} layers; sources: ${JSON.stringify(state.sources)}`,
);
if (PRIME) {
  for (const [id, loaded] of Object.entries(state.sourcesLoaded)) {
    check(`source "${id}" loaded from the local archive`, loaded);
  }
  check('no offline-basemap overlay', state.offlineLabel === null, state.offlineLabel ?? '');

  // The tile READ path must be entirely local. This deliberately does NOT assert
  // "zero .pmtiles requests ever": beeatlas-c8v established that 2-3 fire during
  // startup, from pmtiles' own FetchSource creating a network-backed archive
  // before registerPrimedArchives replaces the entry, and that was ACCEPTED and
  // closed. Asserting on it left this whole harness permanently red, which is
  // worse than not checking — nobody reads a run that always fails (beeatlas-69s).
  //
  // So: report the startup burst as information, then measure the property that
  // actually matters and that c8v itself verified by hand — once the style is up,
  // panning must produce nothing.
  const startupNet = netAttempts.filter((u) => u.includes('.pmtiles'));
  console.log(
    `  note  ${startupNet.length} .pmtiles request(s) during startup — expected, beeatlas-c8v`,
  );

  netAttempts.length = 0;
  for (const [lon, lat, zoom] of [
    [-122.33, 47.61, 11],  // Seattle
    [-117.43, 47.66, 11],  // Spokane — the far side of the archive
    [-121.76, 46.85, 13],  // Rainier, where the field detail layers switch on
    [-123.39, 48.11, 12],  // Olympic coast
  ]) {
    await page.evaluate(([lon_, lat_, z]) => {
      const m = document.querySelector('bee-atlas')?.shadowRoot?.querySelector('bee-map')?._map;
      m?.jumpTo({ center: [lon_, lat_], zoom: z });
    }, [lon, lat, zoom]);
    await page.waitForTimeout(2500);
  }
  const pannedNet = netAttempts.filter((u) => u.includes('.pmtiles'));
  check(
    'no .pmtiles network attempts while panning (the read path is local)',
    pannedNet.length === 0,
    pannedNet.slice(0, 3).join(', '),
  );
}
check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await context.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
