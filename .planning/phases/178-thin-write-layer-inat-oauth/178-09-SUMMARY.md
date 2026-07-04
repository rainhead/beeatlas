---
phase: 178-thin-write-layer-inat-oauth
plan: 09
status: complete
completed: 2026-07-04
requirements: [WRITE-02, WRITE-03, WRITE-04]
---

# 178-09 SUMMARY — Security UAT (live, real-browser)

## Outcome

**PASS on all 7 items — operator approved 2026-07-04.** Run live against the deployed
api.beeatlas.net in a real Chrome session: Claude drove the browser (fetches, navigations,
storage/cookie inspection) via the Chrome extension with the operator watching; the operator
performed the iNat login himself and independently confirmed the session-cookie flags in
DevTools before approving. Full dated results table appended to
`docs/runbooks/notes-write-launch-gate.md` (§ Security UAT results — 2026-07-04).

## Highlights (per must-have)

- **No-leak (WRITE-02):** `document.cookie` empty and 0 JS-visible cookies while the session
  works (HttpOnly live-proven); no token/secret in storage, bundle, network bodies, or URLs;
  operator confirmed `beeatlas_session` HttpOnly ✓ Secure ✓ SameSite=Strict in DevTools; the
  `beeatlas.net` site origin carries zero cookies.
- **Forged-author rejected (WRITE-03):** `{"author_id": 999999}` POST → 200 with the
  server-derived identity (rainhead); 999999 nowhere in the response. Anonymous → 401.
- **Cross-origin rejected (WRITE-03):** the same POST from example.com died at the CORS
  preflight (never sent); server-side Origin 403 is the tested second layer.
- **Redirect pin (D-12/D-13):** live authorize URL carries exactly the pinned callback;
  a tampered redirect drew Doorkeeper's "The redirect uri included is not valid."
- **PKCE (D-01/D-02):** `code_challenge_method=S256` in the live flow; no plain fallback needed.
- **Traceback guard (Waitress):** forced errors render generic pages; no traceback markers.
- **Bonus:** the sign-in was exercised from the MAP page header — live verification of the
  178-07 gap fix (`e137418c`) on the most-visited page.

## UAT session notes

- The MCP browser profile started signed-out, which conveniently re-exercised the entire
  first-login path (fresh flow cookie → iNat login → callback → session mint → upsert).
- The flow cookie was observed live as `Secure; HttpOnly; SameSite=Lax` — Lax being the
  2026-07-04 fix (`b4ba0005`) without which every real login 400s.
- No FAILs; no gap-closure plans needed from this UAT.

## Key files
- modified: `docs/runbooks/notes-write-launch-gate.md` (appended dated results block)

## Self-Check: PASSED
