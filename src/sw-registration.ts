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
