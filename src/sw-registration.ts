// Registers the service worker.
// Imported ONLY by src/app-entry.ts, which only `_pages/index.html` references.
// The static pages mount through src/entries/{bee-header,species-index,taxon-page}.ts,
// none of which import this file — so a reader who never opens the map is never
// handed the 3.3 MB precache. That separation is LOAD-BEARING as of ADR 0029, where
// the numbers are: a species page loads 18 KB of JavaScript.
//
// SCOPE IS THE ORIGIN, not the app's own path (ADR 0029). It has to be — the app is
// at `/` — but the navigation fallback in src/sw.ts is narrowed to match, so the app
// shell still answers `/` and nothing else.
//
// migrated from manual SW registration to
// workbox-window.Workbox so the 'waiting' event drives the SW update prompt.

import { Workbox } from 'workbox-window';

// The scope, named once. src/tests/basemap-precache.test.ts reads this literal out of
// the source to check that the MapLibre worker's URL falls inside it — a dedicated
// worker outside the scope is unreachable offline however thoroughly it is precached,
// and that failure is completely silent.
const SW_SCOPE = '/';

// Not exported: registration fires as a module side effect (see call below).
// Keeping it private preserves the structural only-the-app-registers guarantee — no
// other module can import this symbol by name and register the SW from a static page.
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  void unregisterLegacyAppScope();
  // A script at /sw.js has a default max scope of '/', so no Service-Worker-Allowed
  // header is needed. (The rule that bit us at the old path: the browser rejects any
  // requested scope the script's own path does not prefix.)
  const wb = new Workbox('/sw.js', { scope: SW_SCOPE });

  // Fired when a new SW is installed but waiting (this tab still controlled by
  // old SW). event.isExternal === true means another tab triggered the update;
  // we still want to surface the banner either way — pure signal, no payload.
  // Attach BEFORE wb.register() so a fast install→waiting transition is not missed.
  wb.addEventListener('waiting', () => {
    window.dispatchEvent(new CustomEvent('sw-update-available', {
      bubbles: true,
      composed: true,
    }));
  });

  // Cross-module handoff to the Plan 04 update-banner tap-handler, which calls
  // wb.messageSkipWaiting() to post {type:'SKIP_WAITING'} to the waiting SW.
  (window as Window & { __wb?: Workbox }).__wb = wb;

  // register() triggers an UPDATE CHECK: the browser re-fetches /sw.js to
  // byte-compare it. The service worker is deliberately never precached (a worker
  // caching itself is how you strand a device on a broken version), so offline
  // that fetch cannot be served — and on iOS a failed request inside an installed
  // app raises the system "Turn On Wi-Fi to Use the Internet" modal, over a map
  // that is working perfectly from cache.
  //
  // Offline there is nothing to gain: the active worker is already controlling
  // this page, and an update cannot be downloaded anyway. So defer registration
  // to the 'online' event, where it does something.
  //
  // This does not disable updates — it moves them to the moment they can succeed.
  // Note the browser may still run its own soft update check on navigation; this
  // removes the one WE ask for.
  const register = async () => {
    try {
      await wb.register();
      _lastUpdateCheck = Date.now();
      watchForUpdates(wb);
    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  };

  if (navigator.onLine === false) {
    window.addEventListener('online', () => { void register(); }, { once: true });
    return;
  }
  await register();
}

/**
 * Notice a new version without being force-quit.
 *
 * The check above happens at `register()`, i.e. once per page load — and an
 * INSTALLED PWA is not reloaded the way a tab is. Left at that, the only reliable
 * way to pick up a new version is to force-quit the app and relaunch it, which is
 * not something to ask of someone in a field. (Navigating to a species page and
 * back does it too, since that is a real document navigation, but nobody should
 * have to know that.)
 *
 * So: check again when the app comes back to the foreground, and when the network
 * comes back. Those are the two moments when an update both might exist and can
 * actually be fetched.
 *
 * NEVER OFFLINE, for the reason the registration itself defers: /sw.js is
 * deliberately not precached (a worker that caches itself is how you strand a
 * device on a broken version), so offline the request cannot be served — and on
 * iOS a failed request inside an installed app raises the system "Turn On Wi-Fi
 * to Use the Internet" modal over a map that is working perfectly. This app is
 * used in places with no signal; a background poll that raises a modal there
 * would be worse than never updating.
 *
 * The cooldown is because `visibilitychange` fires on every app switch, and this
 * is a real conditional GET each time. Fifteen minutes is far more often than a
 * site that deploys a few times a week needs, and rare enough to be free.
 *
 * When a new worker IS found it installs and then WAITS — there is no
 * `clientsClaim` and no unsolicited `skipWaiting` (src/sw.ts) — so this never
 * swaps code underneath someone. It surfaces the update banner, and the reload
 * stays the user's.
 */
const UPDATE_CHECK_COOLDOWN_MS = 15 * 60 * 1000;
let _lastUpdateCheck = 0;
let _watching = false;

function watchForUpdates(wb: Workbox): void {
  if (_watching) return;
  _watching = true;

  const check = (reason: string) => {
    if (navigator.onLine === false) return;
    const now = Date.now();
    if (now - _lastUpdateCheck < UPDATE_CHECK_COOLDOWN_MS) return;
    _lastUpdateCheck = now;
    // Rejections are swallowed: a failed update check is the ordinary offline
    // case wearing a different hat (onLine is a hint, not a guarantee), and it
    // costs nothing — the active worker keeps serving.
    void wb.update().catch(() => { console.debug('[SW] update check failed', reason); });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check('foreground');
  });
  window.addEventListener('online', () => { check('online'); });
}

/**
 * Drop the pre-ADR-0029 registration at scope `/app/`.
 *
 * Two registrations can coexist, and the more specific scope wins: left alone, the
 * old worker keeps answering every `/app/` navigation from its own precache, which
 * includes the OLD app shell and the OLD bundle. It cannot be talked out of that from
 * inside: while it lives it answers that navigation itself, so nothing served over
 * the network can reach the device. It has to be unregistered from here.
 *
 * The build no longer emits `/app/sw.js`, so the browser's own update check for it
 * 404s and drops the registration anyway. This is the deterministic half of that: it
 * runs the moment someone loads the root page, rather than whenever the browser next
 * decides to look.
 *
 * Scoped by prefix rather than equality because a registration reports its scope as an
 * absolute URL. Anything at or under `/app/` is by definition the old one — this file
 * is the only thing that registers, and it registers at the origin.
 *
 * Best-effort throughout: `getRegistrations()` rejects in some private-browsing modes,
 * and a failed cleanup costs the user nothing that the 404 path will not also fix.
 */
async function unregisterLegacyAppScope(): Promise<void> {
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (new URL(reg.scope).pathname.startsWith('/app/')) {
        await reg.unregister();
        console.log('[SW] unregistered the legacy /app/ worker (ADR 0029)');
      }
    }
  } catch { /* not worth surfacing; the 404-on-update path is the backstop */ }
}

registerServiceWorker();

// requestPersistentStorage — CACHE-05 / D-12.
//
// Called once at first app launch, gated by a localStorage key to avoid
// spamming the call on every visit. The localStorage write happens BEFORE the
// await so a rejected/throwing persist() cannot cause a retry on the next visit
// (one-shot semantics per D-12).
//
// iOS behavior: navigator.storage.persist() returns false almost always in
// normal browser sessions; only returns true for home-screen-installed PWAs
// with notification permission granted. The result is logged for diagnostics
// only — no behavior is gated on the boolean.
const PERSIST_ASKED_KEY = 'beeatlas-persist-asked';

async function requestPersistentStorage(): Promise<void> {
  // Feature guard: navigator.storage?.persist uses optional chaining because
  // navigator.storage exists everywhere but .persist is gated (older Safari).
  if (!navigator.storage?.persist) return;
  if (localStorage.getItem(PERSIST_ASKED_KEY)) return;
  // Set the flag BEFORE the await: if persist() throws, we don't retry next visit.
  localStorage.setItem(PERSIST_ASKED_KEY, '1');
  const granted = await navigator.storage.persist();
  // log result only — iOS returns false almost always.
  console.log('[storage] navigator.storage.persist() =>', granted);
}

void requestPersistentStorage();
