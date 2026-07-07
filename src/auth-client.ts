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
  isCurator?: boolean;
  /** iNaturalist profile-image URL (avatar), or null if the user has none. */
  iconUrl?: string | null;
}

// Phase 179-05: note CRUD client. Shapes mirror the read endpoint's JSON
// (GET /api/notes?species=, 179-02-PLAN.md) and the write endpoints'
// {id} success bodies (POST/PATCH/DELETE /api/notes[...]).
//
// `body_md`/`can_edit` are only present on items belonging to the viewer's
// own session (server-enriched) -- used to prefill the editor for the
// author's own notes (179-UI-SPEC.md Interaction Contract, Edit section).
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
  can_edit?: boolean;
}

// Discriminated result for mutating calls so the island can distinguish
// success / 403 (ownership lost mid-session) / other failure (network,
// 400, 401, 503) without ever throwing (mirrors fetchWhoami's never-throw
// stance).
export type NoteMutationResult =
  | { ok: true; data: { id: number } }
  | { ok: false; status: number };

/**
 * GET /api/notes?species=<canonicalName> -- public read; a network error or
 * non-ok response resolves to [] rather than throwing, so the island's
 * initial load / re-fetch-after-write never needs a try/catch of its own.
 */
export async function fetchSpeciesNotes(canonicalName: string): Promise<NoteView[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/notes?species=${encodeURIComponent(canonicalName)}`,
      { credentials: 'include' },
    );
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? (body as NoteView[]) : [];
  } catch {
    return [];
  }
}

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
      icon_url?: string | null;
    };
    if (!body.authenticated) return { authenticated: false };
    return {
      authenticated: true,
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
