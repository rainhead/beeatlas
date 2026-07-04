---
phase: 179-notes-feature-harvest-build-time-bake
verified: 2026-07-04T13:50:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
---

# Phase 179: Notes Feature + Harvest → Build-Time Bake Verification Report

**Phase Goal:** The first user-visible authoritative slice. An allowlisted author creates, edits, and deletes attributed WA-specific natural-history notes on a species page; published notes are harvested nightly into a build-time `notes.json` (an exact mirror of the shipped `species_hosts.js` bake) and rendered on species pages as an attributed, stacked list with a graceful empty state; the read path stays 100% static and offline-safe.
**Verified:** 2026-07-04T13:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Allowlisted author can create a server-sanitized markdown note, attributed with byline + created/updated timestamps (NOTES-01) | ✓ VERIFIED | `POST /api/notes` `@require_author` (api/main.py:345-390) renders via shared `render_note_markdown`, sets `author_id=g.identity["uid"]`, `status='approved'`, writes `note_revisions` create row + `created_at`/`updated_at`. Byline resolved by harvest from collectors.json. Live create UAT APPROVED (179-06 Task 1). |
| 2 | Author can edit and delete their own notes (NOTES-02) | ✓ VERIFIED | `PATCH`/`DELETE /api/notes/<id>` (api/main.py:393-471): IDOR-safe load-then-403 (`db_session.get` before `note.author_id != identity["uid"]` → abort(403)), 404 for missing, soft-delete sets `status='removed'` + remove revision (row survives). Live edit+delete UAT APPROVED. |
| 3 | Published notes harvested nightly into `notes.json`; species pages render an attributed stacked list w/ empty state; read path static/offline-safe, no runtime call on load (NOTES-03) | ✓ VERIFIED | `data/notes_harvest.py` reads store read-only via `make_engine`, approved-only newest-first, byline reuse of collectors.json; `[artifacts.notes]` authoritative + build_time_fetch(+_optional); `_data/notes.js` absence-tolerant loader; `_pages/species-detail.njk:108-131` bakes `<section class="notes-section">` newest-first with `| safe`, omits section when zero notes; no page-load fetch. Live post-bake render UAT APPROVED (179-06 Task 3). |
| 4 | (Optional NOTES-04) Live island shows author's just-written note immediately; offline/no-JS still shows baked note | ✓ VERIFIED | `src/bee-notes.ts` calls `fetchWhoami()` in connectedCallback (independent of bee-header), inert (`render` returns empty) for guest/non-author, re-fetches read endpoint after every confirmed write (D-02, no optimistic update), inline two-step delete confirm, `unsafeHTML` on trusted server HTML only. Baked `<bee-notes>` mount always emitted (njk:132). Live island round-trip UAT APPROVED. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/notes_store/render.py` | Shared render+sanitize entrypoint | ✓ VERIFIED | markdown-it "zero" preset + nh3 allowlist; imported by api/ + harvest |
| `data/notes_store/models.py` | body_html NOT NULL + author_id FK→users.id | ✓ VERIFIED | Lines 45,47: `author_id ForeignKey("users.id") nullable=False`, `body_html Text nullable=False` |
| `data/notes_store/migrations/versions/0003_...py` | Forward-only, backfill, NOT NULL, int FK | ✓ VERIFIED | revision="0003"; 3-step batch add+backfill-via-renderer+NOT NULL; downgrade raises NotImplementedError |
| `api/main.py` | POST/PATCH/DELETE/GET /api/notes | ✓ VERIFIED | 542 lines; all four routes, @require_author guards, approved-only read w/ own-note body_md+can_edit enrichment |
| `data/notes_harvest.py` | Read-only harvest → notes.json | ✓ VERIFIED | make_engine read-only, approved-only newest-first, collectors.json byline join, @login fallback |
| `_data/notes.js` | Absence-tolerant loader | ✓ VERIFIED | existsSync + try/catch → returns `{}`; default-export only |
| `data/artifacts.toml` | [artifacts.notes] authoritative | ✓ VERIFIED | provenance="authoritative", build_time_fetch=true, build_time_fetch_optional=true |
| `_pages/species-detail.njk` | Baked section + always-present mount | ✓ VERIFIED | notesForSpecies section (omitted if empty), `<bee-notes>` mount + canonicalName/bakedNotes handoff |
| `src/lib/formatDate.js` | formatDate(iso) | ✓ VERIFIED | Registered as Eleventy filter (eleventy.config.js:39) + imported by island |
| `src/styles/taxon-pages.css` | Phase 179 note CSS | ✓ VERIFIED | 586 lines incl .notes-section/.note/.note-body/.note-meta/.note-btn |
| `src/bee-notes.ts` | Light-DOM hydrating island | ✓ VERIFIED | 342 lines; customElement('bee-notes'), independent auth gate, CRUD, re-fetch |
| `src/auth-client.ts` | Note CRUD client | ✓ VERIFIED | fetchSpeciesNotes/createNote/updateNote/deleteNote, all credentials:'include', never-throw |
| `src/entries/taxon-page.ts` | Island registration | ✓ VERIFIED | imports `../bee-notes.ts` (side-effect registration) |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| migration 0003 | render_note_markdown | backfill import in upgrade() | ✓ WIRED (line 47,52) |
| models.py | users.id | author_id ForeignKey | ✓ WIRED (line 45) |
| api/main.py | render_note_markdown | render on write | ✓ WIRED (create+edit) |
| api/main.py | ownership check | note.author_id != g.identity["uid"] | ✓ WIRED (403 on PATCH/DELETE) |
| run.py | notes_harvest.export_notes_step | STEPS entry after collectors-events-export | ✓ WIRED (run.py:145-149) |
| notes_harvest.py | collectors.json | byline display_name/collector_url reuse | ✓ WIRED |
| species-detail.njk | notes[sp.canonical_name] | _data/notes.js loader | ✓ WIRED (njk:108,136) |
| eleventy.config.js | formatDate | addFilter | ✓ WIRED (line 39) |
| bee-notes.ts | fetchWhoami | connectedCallback independent fetch | ✓ WIRED (line 82) |
| taxon-page.ts | bee-notes.ts | registration import | ✓ WIRED (line 14) |
| nightly.sh | live notes store | NOTES_DB_PATH export | ✓ WIRED (nightly.sh:47,172; ship-blocking fix commit 3154a07a) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| species-detail.njk baked section | notes[canonical_name] | _data/notes.js ← public/data/notes.json ← notes_harvest.py ← SQLite store | Yes | ✓ FLOWING — live UAT confirmed an approved note on Agapostemon/subtilior renders in raw served HTML with harvest-resolved byline "Peter Abrahamsen" + /collectors/rainhead/ link, no runtime API call |
| bee-notes.ts author view | _liveNotes / bakedNotes | fetchSpeciesNotes ← GET /api/notes ← DB query (approved-only) | Yes | ✓ FLOWING — DB-backed query, live island UAT approved |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Notes JS suite (island, client, formatDate, loader) | `vitest run src/tests/{bee-notes,notes-client,formatDate,data-notes}.test.ts` | 4 files, 33 tests passed | ✓ PASS |
| Notes Python suite (render, migrations, schema, harvest, routes) | `pytest tests/test_notes_*.py ../api/tests/test_notes_routes.py` | 46 passed | ✓ PASS |
| TypeScript compiles | `tsc --noEmit` | clean | ✓ PASS |
| notes.json never committed | `git check-ignore / ls-files` | IGNORED + untracked | ✓ PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes declared for this phase. Verification driven by the pytest/vitest suites and the operator-run live UAT (below).

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| NOTES-01 | 179-01/02/04/05 | ✓ SATISFIED | create route + render/sanitize + baked/island display; Truth 1 |
| NOTES-02 | 179-01/02/04/05 | ✓ SATISFIED | edit/delete routes + ownership 403 + soft-delete; Truth 2 |
| NOTES-03 | 179-03/04 | ✓ SATISFIED | harvest + contract + loader + baked static section; Truth 3 |
| NOTES-04 (optional) | 179-02/05 | ✓ SATISFIED | live read endpoint + hydrating island; Truth 4 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER debt markers in any Phase 179 modified file |

### Human Verification Required

None outstanding. The Wave 5 human-UAT plan (179-06, `autonomous: false`) was executed and all three blocking gates were signed off "approved" by the user on 2026-07-04, per authoritative live evidence gathered this session:
- Live author create → edit → delete against api.beeatlas.net (island reflected each change) — APPROVED
- Forged-author + cross-origin + unauthenticated (401/403) write rejection — APPROVED
- Full harvest → publish → deploy → bake cycle on maderas: an approved note renders server-side in the baked `<section class="notes-section">` at https://beeatlas.net/species/Agapostemon/subtilior/index.html with no runtime API call — APPROVED

### Gaps Summary

No gaps. All four ROADMAP success criteria are observably achieved in the codebase: routes, render/sanitize, migration, harvest, contract, loader, baked template, and hydrating island all exist, are substantive, are wired, and carry real data end-to-end. Both automated suites (46 Python + 33 JS notes tests) pass, TypeScript compiles clean, `notes.json` is correctly gitignored/untracked, and the three blocking live-UAT gates are signed off.

**ℹ Info (non-blocking bookkeeping):** ROADMAP.md still shows `179-06-PLAN.md` as `- [ ]` unchecked and the phase table as "5/6 · In Progress". This is the known `phase.complete` CLI checkbox/count lag (memory `feedback_phase_complete_cli_drift`), not a goal gap — the plan's work is verifiably complete and its UAT approved. Recommend flipping the checkbox + phase status/count by hand during phase close.

---

_Verified: 2026-07-04T13:50:00Z_
_Verifier: Claude (gsd-verifier)_
