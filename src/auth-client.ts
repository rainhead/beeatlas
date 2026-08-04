// Auth client for the 178 write layer (D-10 sign-in + whoami UI). Talks to the
// small Flask/Waitress API at api.beeatlas.net (178-06). Identity is derived
// server-side via an HttpOnly session cookie — this module never reads,
// stores, or forwards a token; it only carries the public API base URL.
//
// Architecture invariant: no OAuth secret and no iNat token literal ever
// appears in this file (T-178-19 mitigation, grepped by 178-07 Task 3).

const API_BASE = (import.meta.env.VITE_NOTES_API_BASE_URL as string | undefined)
  ?? 'https://api.beeatlas.net';

export interface AuthState {
  authenticated: boolean;
  /**
   * Did the SERVER tell us this, during this page's life?
   *
   * beeatlas-1dc: "signed out" and "could not ask" are different answers, and
   * collapsing them is what made an offline cold start show a Sign in button to
   * someone who was signed in. The pair (`authenticated`, `verified`) names the
   * three states the UI actually has:
   *
   *   · `{false, true}`  — signed out. The server said so.
   *   · `{true,  true}`  — signed in, confirmed this session.
   *   · `{true,  false}` — signed in per the last known identity on this device;
   *                        the server could not be reached to confirm it.
   *   · `{false, false}` — nothing known and nobody to ask. Renders as signed out,
   *                        because there is nothing else to render.
   *
   * An unverified identity is for DISPLAY and LOCAL FILTERING only. Every write
   * goes through the API and is re-authorized server-side regardless — see the
   * note on `isCurator` below, which has always said the same thing about a
   * signal the client must never trust.
   */
  verified: boolean;
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
  isCurator?: boolean;
  /** iNaturalist profile-image URL (avatar), or null if the user has none. */
  iconUrl?: string | null;
}

/**
 * Where the last confirmed identity is kept between page loads (beeatlas-1dc).
 *
 * Holds no credential — the session lives in an HttpOnly cookie this module
 * cannot read, and nothing here grants access to anything. It is a note of who
 * the server last said you were, so the app can keep saying it while the server
 * is unreachable. Deleting the key logs nobody out; keeping it authorizes
 * nothing.
 */
export const IDENTITY_STORAGE_KEY = 'beeatlas.auth.lastKnown';

interface StoredIdentity {
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
  isCurator?: boolean;
  iconUrl?: string | null;
}

/**
 * The last identity the server confirmed on this device, as an UNVERIFIED
 * AuthState — or `{authenticated:false, verified:false}` if there is none.
 *
 * Synchronous and network-free by design: a caller can seed its UI with this at
 * mount and let the deferred `fetchWhoami()` upgrade it to a verified answer,
 * rather than showing a signed-out header for the second (or the whole session,
 * offline) that the round trip takes.
 */
export function loadLastKnownIdentity(): AuthState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, quota) — no last-known identity.
    return { authenticated: false, verified: false };
  }
  if (!raw) return { authenticated: false, verified: false };
  try {
    const stored = JSON.parse(raw) as StoredIdentity;
    // A record with no login is not an identity; treat it as absent rather than
    // rendering an empty account chip.
    if (typeof stored?.login !== 'string' || stored.login === '') {
      return { authenticated: false, verified: false };
    }
    return {
      authenticated: true,
      verified: false,
      login: stored.login,
      role: stored.role ?? null,
      isAuthor: stored.isAuthor ?? false,
      isCurator: stored.isCurator ?? false,
      iconUrl: stored.iconUrl ?? null,
    };
  } catch {
    // Corrupt JSON — drop it rather than carrying it forward.
    forgetIdentity();
    return { authenticated: false, verified: false };
  }
}

function rememberIdentity(state: AuthState): void {
  const stored: StoredIdentity = {
    login: state.login,
    role: state.role ?? null,
    isAuthor: state.isAuthor ?? false,
    isCurator: state.isCurator ?? false,
    iconUrl: state.iconUrl ?? null,
  };
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Write failures (private mode / quota) cost the offline identity, nothing else.
  }
}

/**
 * Forget the last known identity. Called on an authoritative anonymous whoami
 * (the session ended elsewhere) and on every sign-out — including a sign-out
 * that happens offline, where the server never hears about it and this local
 * erasure is the entire effect the user gets to see.
 */
export function forgetIdentity(): void {
  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    // Nothing to do; a storage that cannot be written was never remembered from.
  }
}

// Phase 179-05: note CRUD client. The shape mirrors the nightly harvest's
// baked notes.json records (data/notes_harvest.py) — since st-vjd deleted
// the live read endpoint, the baked handoff is the ONLY note source.
//
// `body_md` is the raw markdown source of `html` (public — html derives
// from it), used to prefill the editor for the author's own notes. Optional
// only for pages baked before the harvest started emitting it.
export interface NoteView {
  id: number;
  html: string;
  byline: {
    login: string;
    display_name: string | null;
    collector_url: string | null;
  };
  created: string;
  updated: string;
  body_md?: string;
}

// Discriminated result for mutating calls so the island can distinguish
// success / 403 (ownership lost mid-session) / other failure (network,
// 400, 401, 503) without ever throwing (mirrors fetchWhoami's never-throw
// stance).
// `publish` (st-nee): "live" = the synchronous burned-in publish completed —
// a reload shows the change; "pending" = saved but not yet baked (publish
// lock busy / timeout — the nightly repairs). There is NO live read endpoint
// any more (st-vjd deleted the GET /api/notes kludge): after a write the
// island reloads the page on "live" and shows a pending banner otherwise.
export type NoteMutationResult =
  | { ok: true; data: { id: number; publish?: 'live' | 'pending' } }
  | { ok: false; status: number };

/**
 * POST /api/notes -- create a note as the signed-in author. Never throws:
 * network errors resolve to `{ok:false, status:0}` so the caller can show
 * the same "couldn't save" copy regardless of failure cause.
 */
export async function createNote(canonicalName: string, bodyMd: string): Promise<NoteMutationResult> {
  return _postJson(`${API_BASE}/api/notes`, 'POST', { canonical_name: canonicalName, body_md: bodyMd });
}

/**
 * PATCH /api/notes/<id> -- edit the caller's own note. A 403 means
 * ownership was lost mid-session (e.g. role revoked) -- surfaced distinctly
 * so the UI can show the "no longer have permission" copy instead of the
 * generic error.
 */
export async function updateNote(id: number, bodyMd: string): Promise<NoteMutationResult> {
  return _postJson(`${API_BASE}/api/notes/${id}`, 'PATCH', { body_md: bodyMd });
}

/**
 * DELETE /api/notes/<id> -- soft-delete the caller's own note (server-side
 * D-07; the client never sees or cares that it's a soft delete).
 */
export async function deleteNote(id: number): Promise<NoteMutationResult> {
  try {
    const res = await fetch(`${API_BASE}/api/notes/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * POST /api/notes/<id>/takedown -- curator-only override (D-01/D-04). Sends
 * no reason (v1 UI excludes the reason field per UI-SPEC; the server
 * normalizes an absent reason to NULL). A 403 means the caller's curator
 * role was revoked mid-session (fresh allowlist re-read, D-05) -- surfaced
 * distinctly so the UI can show the revoked-permission copy.
 *
 * NOTE: there is deliberately no `restoreNote` export -- restore is
 * curl-only, operator-triggered (D-07), never wired to any UI.
 */
export async function takedownNote(id: number): Promise<NoteMutationResult> {
  return _postJson(`${API_BASE}/api/notes/${id}/takedown`, 'POST', {});
}

async function _postJson(url: string, method: 'POST' | 'PATCH', payload: unknown): Promise<NoteMutationResult> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * GET /auth/whoami — anonymous-friendly session introspection. Never throws:
 * every way of not getting an answer resolves to the last known identity as an
 * UNVERIFIED state, so the caller (the bee-header entry controller) never blocks
 * page render on this call and never has to invent a fallback of its own.
 *
 * The only thing that produces `{authenticated:false, verified:true}` is the
 * server saying so — which also erases the last known identity, so a session
 * ended in another tab or expired overnight does not linger here.
 */
export async function fetchWhoami(): Promise<AuthState> {
  // Skipping the request offline avoids iOS's system "Turn On Wi-Fi to Use the
  // Internet" modal over the map for someone who knows they have no signal. It
  // costs nothing, because the answer is the same one the catch below would
  // reach: the last known identity, unverified.
  //
  // `onLine === false` is the trustworthy direction; `true` can still be a
  // captive portal, which the catch below handles.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return loadLastKnownIdentity();
  }
  // A sign-out taken offline has to be delivered before we ask who we are, or
  // the server answers with the session the user already dismissed. Until it
  // lands the answer is "signed out" — unverified, because that is still our
  // intent rather than the server's word.
  if (hasPendingSignOut()) {
    const delivered = await _postLogout();
    if (delivered) clearPendingSignOut();
    return { authenticated: false, verified: delivered };
  }
  try {
    const res = await fetch(`${API_BASE}/auth/whoami`, { credentials: 'include' });
    // A 5xx is the server failing to answer, not answering "anonymous" — this
    // route is anonymous-friendly, so a non-ok status never means signed out.
    if (!res.ok) return loadLastKnownIdentity();
    const body = await res.json() as {
      authenticated: boolean;
      login?: string;
      role?: string | null;
      is_author?: boolean;
      icon_url?: string | null;
    };
    if (!body.authenticated) {
      forgetIdentity();
      return { authenticated: false, verified: true };
    }
    const state: AuthState = {
      authenticated: true,
      verified: true,
      login: body.login,
      role: body.role ?? null,
      isAuthor: body.is_author ?? false,
      iconUrl: body.icon_url ?? null,
      // Curator-only signal (D-03): the server already echoes the fresh
      // `role` (re-read from the allowlist per request); this is a
      // UX-affordance derivation only -- authz is always re-checked
      // server-side on the takedown/restore routes, never client-trusted.
      isCurator: body.role === 'curator',
    };
    rememberIdentity(state);
    return state;
  } catch {
    return loadLastKnownIdentity();
  }
}

/**
 * Start the PKCE authorization-code flow by navigating the browser to
 * GET /auth/login?return_to=<returnTo>. The server mints state+PKCE and
 * redirects to iNat; there is nothing to fetch here.
 */
export function startSignIn(returnTo: string): void {
  // Deliberately signing in retires any sign-out still waiting for the network:
  // without this the flow below would mint a fresh cookie and the deferred
  // logout would immediately spend it.
  clearPendingSignOut();
  window.location.href = `${API_BASE}/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * POST /auth/logout — Origin-checked; clears the session cookie server-side.
 * Resolves once the request completes so the caller can re-fetch whoami.
 *
 * The last known identity is forgotten unconditionally, before the request and
 * regardless of its outcome: signing out offline must not leave the app still
 * showing your name, and now that a failed whoami REPLAYS the stored identity,
 * a surviving record would restore the very session the user just dismissed.
 * The cookie outlives this on the server until the next successful logout — but
 * the cookie was never what this device displayed.
 */
export async function signOut(): Promise<void> {
  forgetIdentity();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setPendingSignOut();
    return;
  }
  if (await _postLogout()) clearPendingSignOut(); else setPendingSignOut();
}

async function _postLogout(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A sign-out the server has not been told about yet (beeatlas-1dc).
 *
 * Signing out in the field kills the cookie nowhere — so without this flag the
 * next successful whoami, hours later on WiFi, would report the dismissed
 * session as live and sign the user back in. The flag makes the intent
 * durable: `fetchWhoami()` retries the logout before it introspects, and until
 * that lands it keeps answering "signed out".
 */
const PENDING_SIGN_OUT_KEY = 'beeatlas.auth.pendingSignOut';

function hasPendingSignOut(): boolean {
  try {
    return localStorage.getItem(PENDING_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setPendingSignOut(): void {
  try {
    localStorage.setItem(PENDING_SIGN_OUT_KEY, '1');
  } catch {
    // Without storage the sign-out is session-scoped, which is what it was before.
  }
}

function clearPendingSignOut(): void {
  try {
    localStorage.removeItem(PENDING_SIGN_OUT_KEY);
  } catch {
    // Nothing to clear in a storage that cannot be written.
  }
}
