# Phase 180: Moderation Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 180-moderation-loop
**Areas discussed:** Takedown UI surface, Backend override shape, State & reversibility, Audit / reason capture

---

## Takedown UI surface

### Where should a curator's takedown control live?
| Option | Description | Selected |
|--------|-------------|----------|
| Inline on the notes island | 'Take down' on each note in the species-page `<bee-notes>` island for curators, alongside owner edit/delete | ✓ |
| Operator-only, no UI | Authenticated API call only (curl/CLI), no button | |
| Minimal curator view | Curator-only list of recent notes with hide buttons (drifts toward workbench) | |

### Discovery: reactive vs a needs-moderation surface
| Option | Description | Selected |
|--------|-------------|----------|
| Reactive is enough | Curator acts on notes they view on a species page; no global list | ✓ |
| Need a discovery surface | Cross-species list to scan (expands scope toward the deferred workbench) | |

**User's choice:** Inline island control; reactive moderation.
**Notes:** Fits roadmap "UI hint: yes" + "NOT a workbench". Matches the allowlist-trust model.

---

## Backend override shape

### How to implement the curator-override authz path
| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated takedown endpoint | New `POST /api/notes/{id}/takedown`; owner DELETE/PATCH untouched | ✓ |
| Relax existing DELETE for curators | Allow when `author_id==uid OR role=='curator'`; overloads owner path | |

### Curator scope: takedown-only or also edit-any?
| Option | Description | Selected |
|--------|-------------|----------|
| Takedown only | Curator hides/removes but never rewrites others' content | ✓ |
| Also edit any note | Curator can edit any body (attribution questions; not required) | |

**User's choice:** Dedicated endpoint; takedown-only.
**Notes:** Keeps IDOR guards on owner routes simple; authors keep sole content ownership.

---

## State & reversibility

### Reversible or terminal?
| Option | Description | Selected |
|--------|-------------|----------|
| Reversible 'hidden' state | Distinct `hidden` status; curator can restore to `approved` | ✓ |
| Terminal, reuse 'removed' | Reuse author self-delete `removed`; no restore | |

### Ledger distinction
| Option | Description | Selected |
|--------|-------------|----------|
| Distinct action + moderator | `action='takedown'` (+ `restore`), `editor_id`=curator uid | ✓ |
| Reuse 'remove' | Same verb as author delete; only editor_id differs | |

### Restore visibility (follow-up)
| Option | Description | Selected |
|--------|-------------|----------|
| Endpoint reveals hidden to curators | GET returns hidden notes to curator viewers with a Restore control | |
| Restore is operator-only | Hidden never surfaces in any read; restore via authenticated API (curl) | ✓ |

**User's choice:** Reversible `hidden` state; distinct ledger action + moderator uid; restore operator-only.
**Notes:** Deliberate asymmetry — takedown has inline UI, restore does not. Read endpoint's "never return non-approved" invariant is more important than restore-UX symmetry.

---

## Audit / reason capture

### Capture a reason?
| Option | Description | Selected |
|--------|-------------|----------|
| Optional reason string | Free-text reason on the `note_revisions` takedown row; empty allowed | ✓ |
| No reason field | Only who/when/action | |

### Where does moderator attribution live?
| Option | Description | Selected |
|--------|-------------|----------|
| Ledger row only | `note_revisions` (editor_id + revised_at + action); no new note columns | ✓ |
| Also stamp the note row | Add `moderated_by`/`moderated_at` columns (migration) | |

**User's choice:** Optional reason on the ledger row; attribution in the ledger only.
**Notes:** Likely needs a nullable `reason` column on `note_revisions` (forward-only Alembic 0004). No schema churn on the `notes` table.

---

## Claude's Discretion
- Exact HTTP status codes / response shapes for takedown & restore (mirror existing note routes).
- Button copy/placement in the island (follow `.note-btn` conventions).
- Whether "Take down" also appears on the curator's own notes (low stakes).

## Deferred Ideas
- Discovery / moderation workbench (roadmap scope guardrail).
- Inline restore UI (kept UI-less to preserve read-endpoint leak-free invariant).
- Pre-moderation queue, reader flagging/voting, edit-history UI (REQUIREMENTS.md Moderation depth).
- `notes-guest-freshness-gap` todo — reviewed, not folded (read-path freshness, later milestone; orthogonal to moderation).
