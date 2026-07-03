# Phase 178: Thin Write Layer + iNat OAuth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 178-thin-write-layer-inat-oauth
**Areas discussed:** OAuth client model, App session mechanism, Identity key / allowlist keying, 178 frontend scope

---

## OAuth client model

| Option | Description | Selected |
|--------|-------------|----------|
| Confidential server-side | Flask holds client_secret; browser carries only the one-time code; server exchanges, calls /v1/users/me, discards iNat token, mints app session. | |
| Server-side + PKCE | Same server-side exchange plus PKCE code_verifier/challenge as defense-in-depth (if iNat supports PKCE). | ✓ |
| Public PKCE (browser) | Browser exchanges the code directly with iNat; no server secret. Contradicts having a real server. | |

**User's choice:** Server-side + PKCE.
**Notes:** "Very against code in ~/dev/inaturalist/" — verify iNat OAuth/PKCE behavior against the live provider/docs, never the local iNaturalist source clone. Live-doc check confirmed iNat (Doorkeeper) supports Authorization Code + PKCE, and the `/users/api_token` JWT expires in 24h (only used once at login, since we mint our own session).

---

## App session mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| One long-lived session | Single stateless signed HttpOnly+Secure+SameSite cookie {identity, role, long expiry}; write authz via per-request allowlist recheck. | ✓ |
| Long identity + step-up now | Long-lived identity cookie + separate short-lived elevated write token requiring fresh re-auth for sensitive actions (half-logged-in). | |
| Long session, step-up ready | One long cookie now, token shaped so a step-up tier can be added later without breaking sessions. | |

**User's choice:** One long-lived session.
**Notes:** User raised the half-logged-in idea and asked about iNat session lifetimes. Resolution: iNat token lifetimes don't gate our re-login because we mint our own session; "no great threat here, don't want people to log in often." Chose the simplest long-lived model with per-write allowlist recheck for instant revocation. Half-logged-in deferred.

---

## Identity key / allowlist keying

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric id, login for display | Store iNat numeric id as author_id; resolve login/display at render. | |
| Login as the key | Use iNat login as author_id and allowlist key. | |
| Numeric id + login snapshot | Key on iNat numeric id; snapshot login onto the note. | |
| **(User refinement)** Own internal id as key | BeeAtlas mints its own integer user id as author_id; iNat login + numeric id stored as properties of the user (needs a `users` table). | ✓ |

**User's choice:** "Our own integer id as key, iNat login as property of user." Follow-up: the committed allowlist keys on **iNat login** (gates at first login before the internal id exists); numeric id also captured on the users row.
**Notes:** Introduces a `users` table added via forward-only Alembic migration owned by the write layer. Allowlist login-key matches the existing collector_inat_login/host_inat_login convention.

---

## 178 frontend scope

| Option | Description | Selected |
|--------|-------------|----------|
| Sign-in + whoami only | "Sign in with iNaturalist" OAuth round-trip, session cookie, minimal whoami + sign-out. No note UI. | ✓ |
| Sign-in + write smoke test | Above plus a throwaway authenticated write control to exercise the full path in UAT. | |
| You decide | Let the planner choose the minimal proving UI. | |

**User's choice:** Sign-in + whoami only.
**Notes:** Note CRUD UI is Phase 179; 178 UI is the auth seam the security UAT drives against.

---

## Claude's Discretion

- **CSRF/origin protection (WRITE-03)** — mechanism left to planner (SameSite + Origin/Referer check, double-submit token, or both); guardrail = cross-origin POST + forged-author request both rejected in UAT.
- **WRITE-04 launch-gate encoding** — left to planner; restore already demonstrated (177-07), and writes are never truly "public" (allowlist-gated), so likely satisfied by allowlist + documented restore vs. a separate flag.
- Signing library (itsdangerous vs JWT), cookie name, session TTL value.
- `.fcgi` wrapper + `api.beeatlas.net` vhost details.

## Deferred Ideas

- ROADMAP.md + REQUIREMENTS.md re-scope for the D-01 pivot (stale "API Gateway + Lambda / event-driven / short-lived session" wording) — pre-planning bookkeeping edit.
- Half-logged-in / step-up auth tier — until a second sensitive surface / preferences feature exists.
- Server-side session store / explicit logout revocation — per-write allowlist recheck covers the need for now.
