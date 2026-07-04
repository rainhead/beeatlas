// Vite Rollup entry for Eleventy-rendered pages — see
// _layouts/default.njk. Side-effect import triggers
// @customElement('bee-header') registration via Lit decorator.
import '../index.css';
import '../bee-header.ts';
import { fetchWhoami, signOut, startSignIn, type AuthState } from '../auth-client.ts';

// D-10 (178-07): the standalone-page auth controller. bee-header is a pure
// presenter (state in, events out — architecture invariant); this controller
// owns the whoami fetch and the sign-in/sign-out flow for every non-map page
// that mounts <bee-header> via this entry (species/places/collectors/taxon
// pages, per _layouts/default.njk).

function mountAuthController(): void {
  const header = document.querySelector('bee-header') as (HTMLElement & { authState: AuthState | null }) | null;
  if (!header) return;

  // Fire-and-forget: fetchWhoami() never throws and resolves to
  // {authenticated:false} on any network error, so this never blocks or
  // delays the (already-rendered) static page.
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
