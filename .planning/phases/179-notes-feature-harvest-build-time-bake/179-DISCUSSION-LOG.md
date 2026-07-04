# Phase 179: Notes Feature + Harvest → Build-Time Bake - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 179-notes-feature-harvest-build-time-bake
**Areas discussed:** Authoring surface, Note format & sanitize, CRUD & delete semantics, Harvest & byline

---

## Authoring surface

| Option | Description | Selected |
|--------|-------------|----------|
| Inline island | Notes `<section>` on species-detail.njk IS the island: static baked list for readers, hydrates to inline editor + per-note edit/delete for the author. | ✓ |
| Modal overlay | Baked list static; Add/Edit opens a modal dialog. Heavier UI, edit flow further from the note. | |
| Dedicated compose route | Author writes on a separate page/SPA route; species-detail stays purely static but author leaves the page. | |

**User's choice:** Inline island
**Notes:** One surface, reuses render location, natural home for the live-island.

---

## NOTES-04 live-island (sub-decision under Authoring)

| Option | Description | Selected |
|--------|-------------|----------|
| Ship it | After a write the island re-fetches this species' notes and re-renders immediately; baked list stays the offline/no-JS source of truth. | ✓ |
| Defer (baked-only) | Island writes, shows "will appear after next build"; note surfaces only after nightly build. | |

**User's choice:** Yes — ship it
**Notes:** Low marginal cost given the island already exists; closes the "saved but don't see it" gap. Consequence: write API needs a read endpoint for the island.

---

## Note format & sanitize

| Option | Description | Selected |
|--------|-------------|----------|
| Restricted markdown | Safe subset (bold/italic/links/lists), rendered to HTML. | ✓ |
| Plain text | Escaped text with preserved line breaks. Simplest, no links/emphasis. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sanitize on write now | Sanitize/allowlist on write (store clean) + escape/allowlist on render. Defense in depth. | ✓ |
| Escape-on-render only, defer to 180 | Render path safe; store raw, full write-sanitize lands in Phase 180. | |

**User's choice:** Restricted markdown + sanitize on write now
**Notes:** Markdown→HTML needs a tag allowlist regardless; store markdown source + render safe HTML once server-side so only one renderer exists (Python), no markdown lib in the browser.

---

## CRUD & delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete | status='removed' + note_revision; row + history survive; shared with Phase-180 takedown. | ✓ |
| Hard delete | Physical row removal; discards the audit ledger the schema was shaped to keep. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Store markdown, render HTML at write → serve safe HTML | body_md source + body_html; one renderer, island injects trusted HTML. | ✓ |
| Store markdown only, render on each path | Single DB source but two renderers (Python + JS) to keep in sync; markdown lib in browser. | |

**User's choice:** Soft-delete + store-markdown-render-HTML-once
**Notes:** author_id → FK users.id; edit/delete require session uid == author_id (locked as consequence, not asked). Curator override stays Phase 180.

---

## Harvest & byline

**Byline name source — reformulated after user challenge.**

> User: "We currently display full names for collectors when we have them. Why would we build a second system?"

Original framing offered a "capture iNat display name onto users table" option, which the user correctly identified as a redundant second attribution system. Byline name source settled (not a competing choice): reuse the existing `collectors_export.py` `display_name` resolution (`arg_max(recordedBy, year)` + `@login` fallback), joined on `inat_login` at build time.

| Byline link option | Description | Selected |
|--------|-------------|----------|
| Collector page when present, else plain text | Link display_name to /collectors/<login>/ when the author has a collector page; else plain text. | ✓ |
| Always link iNat profile | Uniform inaturalist.org/people/<login>; sends readers off-site. | |
| Plain text, no link | Unlinked name. | |

| Order/scope option | Description | Selected |
|--------|-------------|----------|
| Newest first; approved only | status='approved' only; created_at desc; harvest reads store read-only in WAL, authoritative + build_time_fetch in artifacts.toml. | ✓ |
| Oldest first; approved only | Same scope, chronological asc. | |

**User's choice:** Collector-page-when-present + newest-first/approved-only
**Notes:** notes.json mirrors species_hosts.json (Record<canonical_name, Note[]>); absence-tolerant _data/notes.js loader.

---

## Claude's Discretion

- Exact Python markdown renderer + HTML sanitizer (within restricted-subset + link-safety + inert-payload guardrails).
- REST endpoint shapes (lean: POST/PATCH/DELETE /api/notes + a species read endpoint) and the read endpoint's auth model.
- Empty-state behavior (guests see no empty box; authors get "Add note" on empty species) — confirm in UAT.
- Note length / rate limits.
- `body` column kept vs renamed to `body_md` in the forward-only migration.

## Deferred Ideas

- Full XSS acceptance + curator takedown + role source + audit-field completeness — Phase 180.
- Capturing an iNat display name onto the users table — rejected as a redundant second attribution system.
- Note revision/edit-history UI (diff/revert) — deferred (Future Requirements).
- Reviewed-not-folded todos: 144-code-review-deferred, 165-code-review-deferred, rebuild-source-into-facets (matched on generic "phase" keyword only).
