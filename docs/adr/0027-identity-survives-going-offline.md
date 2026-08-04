# ADR 0027: Identity survives going offline, and an unverified identity is still an identity

**Status:** Accepted (implemented 2026-08-03; issue beeatlas-1dc)

---

## Context

`fetchWhoami()` asks `api.beeatlas.net/auth/whoami` who you are and, until now,
answered `{authenticated:false}` whenever it could not find out. A rejected fetch,
a 503, a captive portal, and a server that genuinely says "you are anonymous" all
produced the same value. [beeatlas-6rs](0025-offline-basemap-is-a-byte-store.md)
added an explicit `navigator.onLine === false` short-circuit that reached the same
answer without sending the request — worth doing, because on iOS a failed request
inside an installed PWA raises the system "Turn On Wi-Fi to Use the Internet"
modal over the map of someone who knows perfectly well they have no signal.

None of that changed the behaviour anyone saw. It did make the model's one flaw
explicit: **"signed out" and "could not ask" were the same value**, so an offline
cold start showed a Sign in button to a signed-in user.

That was tolerable while it was temporary — `<bee-atlas>` re-runs the check on the
`online` event, so the identity reappears on reconnect. It is not tolerable as a
foundation. The occurrence database is already local and complete; the only
missing ingredient for a "my specimens" filter is knowing who you are, and a
client that discards identity the moment signal drops cannot host one. **If you
were signed in when the data loaded, features that depend on who you are should
work the same way in a forest as they do on WiFi.**

## Decision

**Remember the last identity the server confirmed, and replay it — marked as
unverified — whenever the server cannot be reached. An unverified identity is a
signed-IN state.**

### 1. The pair (`authenticated`, `verified`) names three states

`AuthState` gains a required `verified: boolean`. Required, not optional, so the
compiler makes every construction site say which state it means:

| state | meaning |
|---|---|
| `{false, true}` | Signed out. The server said so. |
| `{true, true}` | Signed in, confirmed this session. |
| `{true, false}` | Signed in per the last known identity on this device; unconfirmable. |
| `{false, false}` | Nothing known and nobody to ask. Renders as signed out — there is nothing else to render. |

Only the server saying `authenticated:false` produces a verified signed-out. A
5xx is the server failing to answer, not answering "anonymous" — `/auth/whoami`
is anonymous-friendly, so a non-ok status can never mean signed out.

### 2. Cached identity is for display and local filtering. Nothing else.

It lives in `localStorage['beeatlas.auth.lastKnown']` and holds **no credential**:
the session is an HttpOnly cookie this code cannot read. Deleting the key logs
nobody out; keeping it authorizes nothing. This is the same stance the `isCurator`
signal has carried since 178 — a UX affordance, re-authorized server-side on every
request — applied to identity as a whole. Writes go through the API regardless, so
none of this grants offline write capability.

The rule that falls out: **write affordances require `verified`.** `<bee-notes>`
gates its author and curator getters on it, because every affordance it offers
needs the API that is by definition unreachable whenever the identity went
unverified. Offering an editor that cannot save — after hiding the baked `#notes`
section it renders over — is worse than staying inert, which is what an offline
reader got before and still gets.

### 3. The seed is synchronous, and it is what makes an offline start work

`loadLastKnownIdentity()` is network-free and synchronous, and both auth
controllers (`<bee-atlas>`, `src/entries/bee-header.ts`) call it at mount before
anything is fetched. This is not an optimization. `<bee-atlas>` defers its whoami
past `WHOAMI_DELAY_MS` because `navigator.onLine` is not trustworthy at page init
(on a real iPhone in airplane mode it still read `true` at 110 ms), and the
`offline` event cancels that timer outright — so on an offline cold start the seed
is the *only* thing that puts an identity on the header.

The avatar was the exception. It is an `<img>` against `static.inaturalist.org` —
the one part of the identity that is not local — so it rendered only for a
**verified** state. An unverified identity is precisely the case where the network
just failed; requesting it would be a second doomed request, and on iOS that is
the system modal this whole path exists to avoid. The person glyph stood in.

> **Amended 2026-08-04 (beeatlas-1dc follow-up): the avatar is local now.**
>
> The rule above was right about the request and wrong to accept the missing
> picture as the price. `api/avatar.py` fetches the image SERVER-side and whoami
> returns it inline as a `data:` URL, so it is persisted with the login and the
> role and replayed by the same seed. A `data:` URL makes no request at all, so
> the reason for the gate is removed rather than the gate being relaxed.
>
> It had to be the server: `static.inaturalist.org` sends no
> `Access-Control-Allow-Origin` (its OPTIONS preflight 403s), so a page-side
> `fetch` can only ever obtain an OPAQUE response whose bytes it cannot read.
> Caching that opaque response in the service worker was the alternative and is
> the thing [ADR 0029](0029-one-origin-two-surfaces.md) had just rejected for the
> read path — unreadable status, a 404 caching as a success, and megabytes of
> quota padding on a device already carrying a 288 MB basemap.
>
> The remote URL is still returned and still gated on `verified`: it is still a
> network fetch, and it is only reachable in the state the gate already allowed.
> `icon_data` is null on every failure path, so an online client falls back to it
> and renders exactly as before. The write rule is untouched — **write
> affordances still require `verified`**; a picture is not an authorization.

### 4. A sign-out taken offline is durable

Signing out erases the local identity unconditionally, before the request and
regardless of its outcome. Now that a failed whoami *replays* the stored identity,
a surviving record would restore the very session the user just dismissed.

But the cookie is what the server honours, and offline the logout POST reaches
nobody. So the intent is persisted too (`beeatlas.auth.pendingSignOut`):
`fetchWhoami()` retries the logout before it introspects and keeps answering
"signed out" until that lands. `startSignIn()` clears the flag — deliberately
signing in retires a sign-out still waiting for the network, which would otherwise
mint a fresh cookie and immediately spend it.

## Rejected alternatives

**An expiry on the cached identity.** Attractive because a role can be revoked
while you are away. Rejected: it buys nothing real. Role revocation is enforced
server-side on every request from a freshly-read allowlist (D-05), so a stale
`isAuthor` in local storage grants exactly nothing — while an expiry guarantees
that the field trip long enough to need offline identity is the one where it
disappears. The identity is corrected the moment the server can be reached.

**Trusting the cached `role` for anything.** Never. See §2; the constraint is the
point of the record.

**Leaving the conflation in place and relying on the `online` re-check.** That is
the status quo, and it is why this was deferrable rather than urgent. It is not a
foundation: it makes identity a property of connectivity, and "my specimens" over
a complete local database cannot be built on it.

## Consequences

- `AuthState.verified` is required — a new construction site will not compile
  until it says which of the three states it means.
- The account menu carries one more line, shown only when unverified: *"Last known
  sign-in — the server couldn't be reached to confirm it."* It explains rather
  than warns; the identity is still shown and still usable.
- Diagnostics (`src/diagnostics.ts`) reports the last known identity, read
  straight out of storage and never via whoami — the panel exists for the device
  that cannot reach the network, so only the local half of the question is
  answerable there.
- Sign-out is now the one auth action that fully works offline.
