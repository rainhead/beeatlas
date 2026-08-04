#!/usr/bin/env node
/**
 * offline-uat.mjs — automated offline cold-start UAT for the PWA (beeatlas-6rs).
 *
 * It points at `/` since ADR 0029 moved the app there. That is the check itself as
 * much as the target: the app shell has to answer the ROOT navigation now, and
 * nothing else, so a run against `/` is what proves the scope and the navigation
 * allowlist moved together.
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
 *   node scripts/offline-uat.mjs --url=http://localhost:8080/
 *   node scripts/offline-uat.mjs --read-url=…/species/Bombus/mixtus/   # the boundary
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
const URL_ = arg('url', 'https://beeatlas.net/');
// A page on the READING surface, for the boundary check below. Same origin as URL_
// by construction — the whole question ADR 0029 raises is what an origin-scoped
// service worker does to the pages it did not come for.
const READ_URL = arg('read-url', new URL('/species/Bombus/mixtus/', URL_).href);
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
if (!controlled) {
  // WHY THIS DIAGNOSIS IS BUILT IN. "No controlling worker" points nowhere. The way
  // it actually happens is that ONE precached URL does not 200 from the server: the
  // install fails, and because there is no older worker the registration is
  // DISCARDED — so `getRegistrations()` comes back empty, no error is logged, and
  // nothing distinguishes it from a worker that was never registered.
  //
  // It has happened once already (beeatlas-3xx): `/icons/…` publishes correctly into
  // the document root and 404s anyway, because Ubuntu's Apache aliases `/icons/` to
  // mod_autoindex's own directory. The precache list is generated by globbing the
  // BUILT TREE, so nothing upstream of the server can see it — which is why the check
  // has to be made against the server, here.
  console.log('\n— why: checking every precached URL against the server —');
  try {
    const sw = await (await fetch(new URL('/sw.js', URL_))).text();
    const urls = [...sw.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);
    const bad = [];
    for (const u of urls) {
      const res = await fetch(new URL(encodeURI(u), URL_), { method: 'HEAD' });
      if (!res.ok) bad.push(`${res.status}  ${u}`);
    }
    console.log(bad.length
      ? `  ${bad.length} of ${urls.length} precached URLs do not resolve — SW install cannot succeed:\n    ${bad.join('\n    ')}`
      : `  all ${urls.length} precached URLs resolve; the cause is elsewhere (check the SW's own console)`);
  } catch (err) {
    console.log(`  could not fetch /sw.js to check: ${err}`);
  }
  await context.close();
  process.exit(1);
}

// THE BOUNDARY (ADR 0029). The scope is the whole origin now — it has to be, for
// the app to work at `/` — so a controlled client's navigation to a species page
// DOES pass through the worker's fetch handler. What must not happen is the worker
// answering it: with no matching route Workbox hands it to the network, and the
// reader gets the page they asked for. The failure this guards is a navigation
// allowlist widened by one character, which replaces every page on the site with the
// map and looks, from the map's side, like everything working.
//
// Checked online first because it is the ordinary case, and because the offline half
// below can only observe the absence of a shell, not the presence of the right page.
const readResponse = await page.goto(READ_URL, { waitUntil: 'domcontentloaded' });
const readSurface = await page.evaluate(() => ({
  isAppShell: !!document.querySelector('bee-atlas'),
  controlled: !!navigator.serviceWorker.controller,
  title: document.title,
}));
check(
  'a species page is served as itself, not as the app shell',
  !readSurface.isAppShell,
  `${readSurface.title}${readSurface.controlled ? ' (page is controlled, as expected)' : ''}`,
);
// Stronger than the content check above, and the one that protects note WRITING.
// `bee-notes.ts` calls window.location.reload() after a live publish, and that reload
// IS how an author sees their own note — the server has re-rendered the page. Any
// route matching this navigation returns the pre-write copy instead: CacheFirst
// obviously, StaleWhileRevalidate identically, and the author cannot tell either from
// a failed save. fromServiceWorker() is false exactly when no route matched and
// Workbox never called respondWith, which is the property that has to hold.
check(
  'the species page came from the network, not from the worker',
  readResponse?.fromServiceWorker() === false,
  'a cached read path would return the pre-write copy after a note publish',
);
await page.goto(URL_, { waitUntil: 'load' });

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

// The offline half of the boundary. Reading requires a network, permanently and by
// design (ADR 0029) — so this navigation is SUPPOSED to fail, and the only wrong
// answer is the app shell appearing in its place. Playwright rejects the goto when
// the browser shows its own offline page, which is the pass.
{
  let shell = false;
  try {
    await page.goto(READ_URL, { waitUntil: 'domcontentloaded' });
    shell = await page.evaluate(() => !!document.querySelector('bee-atlas'));
  } catch {
    // net::ERR_INTERNET_DISCONNECTED — the browser's offline page. Correct.
  }
  check('an offline species page is not answered with the map', !shell);
}

await context.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
