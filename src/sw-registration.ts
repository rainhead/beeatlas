// Registers the /app service worker.
// Imported ONLY by src/app-entry.ts.
// _pages/index.html -> src/bee-atlas.ts never imports this file,
// guaranteeing / has no service worker (structural, not runtime).

// Not exported: registration fires as a module side effect (see call below).
// Keeping it private preserves the structural no-SW-on-/ guarantee — no other
// module can import this symbol by name and register the SW from /'s entry.
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    // Scope MUST be '/app/' (trailing slash): a script at /app/sw.js has a
    // default max scope of '/app/', and the browser rejects any requested
    // scope not prefixed by it — '/app' (no slash) fails with a SecurityError.
    // No Service-Worker-Allowed header is needed; '/app/' is the default scope.
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

registerServiceWorker();

// requestPersistentStorage — CACHE-05 / D-12.
//
// Called once at first /app page launch, gated by a localStorage key to avoid
// spamming the call on every visit. The localStorage write happens BEFORE the
// await so a rejected/throwing persist() cannot cause a retry on the next visit
// (one-shot semantics per D-12).
//
// iOS behavior: navigator.storage.persist() returns false almost always in
// normal browser sessions; only returns true for home-screen-installed PWAs
// with notification permission granted. The result is logged for diagnostics
// only — no behavior is gated on the boolean (D-12).
const PERSIST_ASKED_KEY = 'beeatlas-persist-asked';

async function requestPersistentStorage(): Promise<void> {
  // Feature guard: navigator.storage?.persist uses optional chaining because
  // navigator.storage exists everywhere but .persist is gated (older Safari).
  if (!navigator.storage?.persist) return;
  if (localStorage.getItem(PERSIST_ASKED_KEY)) return;
  // Set the flag BEFORE the await: if persist() throws, we don't retry next visit.
  localStorage.setItem(PERSIST_ASKED_KEY, '1');
  const granted = await navigator.storage.persist();
  // D-12: log result only — iOS returns false almost always.
  console.log('[storage] navigator.storage.persist() =>', granted);
}

void requestPersistentStorage();
