// Vite Rollup entry for Eleventy-rendered pages — see
// _layouts/default.njk. Side-effect import triggers
// @customElement('bee-header') registration via Lit decorator.
import '../index.css';
import '../bee-header.ts';
import { fetchWhoami, loadLastKnownIdentity, signOut, startSignIn, type AuthState } from '../auth-client.ts';

// D-10 (178-07): the standalone-page auth controller. bee-header is a pure
// presenter (state in, events out — architecture invariant); this controller
// owns the whoami fetch and the sign-in/sign-out flow for every non-map page
// that mounts <bee-header> via this entry (species/places/collectors/taxon
// pages, per _layouts/default.njk).

function mountAuthController(): void {
  const header = document.querySelector('bee-header') as (HTMLElement & { authState: AuthState | null }) | null;
  if (!header) return;

  // Seed from the last identity the server confirmed on this device
  // (beeatlas-1dc). Synchronous and network-free, so a cached species page
  // opened with no signal shows who you are immediately instead of a Sign in
  // button. Skipped when there is nothing known, to leave `authState` null —
  // "nobody has said yet" rather than "signed out".
  const known = loadLastKnownIdentity();
  if (known.authenticated) header.authState = known;

  // Fire-and-forget: fetchWhoami() never throws — it resolves to the same
  // last-known identity on any network error — so this never blocks or delays
  // the (already-rendered) static page. It only ever upgrades the seed above to
  // a verified answer, or replaces it when the server says the session is gone.
  void fetchWhoami().then((state) => { header.authState = state; });

  header.addEventListener('sign-in', () => {
    startSignIn(window.location.href);
  });

  header.addEventListener('sign-out', () => {
    void signOut().then(() => fetchWhoami()).then((state) => { header.authState = state; });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAuthController);
} else {
  mountAuthController();
}
