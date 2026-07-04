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
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
}

/**
 * GET /auth/whoami — anonymous-friendly session introspection. Never throws:
 * network errors resolve to `{authenticated:false}` so the caller (the
 * bee-header entry controller) never blocks page render on this call.
 */
export async function fetchWhoami(): Promise<AuthState> {
  try {
    const res = await fetch(`${API_BASE}/auth/whoami`, { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    const body = await res.json() as {
      authenticated: boolean;
      login?: string;
      role?: string | null;
      is_author?: boolean;
    };
    if (!body.authenticated) return { authenticated: false };
    return {
      authenticated: true,
      login: body.login,
      role: body.role ?? null,
      isAuthor: body.is_author ?? false,
    };
  } catch {
    return { authenticated: false };
  }
}

/**
 * Start the PKCE authorization-code flow by navigating the browser to
 * GET /auth/login?return_to=<returnTo>. The server mints state+PKCE and
 * redirects to iNat; there is nothing to fetch here.
 */
export function startSignIn(returnTo: string): void {
  window.location.href = `${API_BASE}/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * POST /auth/logout — Origin-checked; clears the session cookie server-side.
 * Resolves once the request completes so the caller can re-fetch whoami.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Best-effort: even if the network call fails, the caller re-fetches
    // whoami afterward, which will simply keep reporting the prior state.
  }
}
