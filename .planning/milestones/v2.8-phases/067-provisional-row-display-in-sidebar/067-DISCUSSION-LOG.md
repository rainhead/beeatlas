# Phase 67: Provisional Row Display in Sidebar — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 067-provisional-row-display-in-sidebar
**Areas discussed:** Provisional row content, Provisional label copy, Visual distinction, Schema update scope

---

## Provisional Row Content

| Option | Description | Selected |
|--------|-------------|----------|
| Full context | Date + collector (host_inat_login) + count + elevation + link + taxon name | ✓ |
| Taxon + link only | Just taxon name and iNat observation link | |
| Taxon + date + link | Taxon name, date, and iNat link | |

**User's choice:** Full context — same fields as sample-only rows, plus the iNat ID label and quality badge.

---

## Provisional Label Copy

| Option | Description | Selected |
|--------|-------------|----------|
| Provisional: Bombus sp. | Compact clinical prefix | |
| Community ID (iNat): Bombus sp. | Explicit source + tentative nature | |
| Provisional iNat ID: Bombus sp. | Middle ground | |
| iNat ID: Bombus sp. (RG) | Label includes quality grade; not described as "provisional" | ✓ |

**User's choice:** "iNat ID: Bombus sp. (RG)" — include the iNat quality grade; frame as an iNat identification, not provisional. Quality grade communicates certainty level.

**Follow-up — Grade source:**

| Option | Description | Selected |
|--------|-------------|----------|
| WABA obs grade | Grade of the WABA specimen observation (specimen_inat_quality_grade) | ✓ |
| Host obs grade | Use existing inat_quality_grade (host plant observation grade) | |
| Skip grade | Omit quality badge from provisional rows | |

**User's choice:** WABA observation's grade — requires adding `specimen_inat_quality_grade` to export.py.

---

## Visual Distinction

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text | Same visual style as sample-only rows | ✓ |
| Subtle tint/badge | Light background tint or row badge | |
| You decide | Leave to Claude's discretion | |

**User's choice:** Plain text — the "iNat ID:" prefix + quality badge provide enough signal.

---

## Schema Update Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum + quality grade | is_provisional, specimen_inat_taxon_name, host_inat_login, specimen_inat_quality_grade | ✓ |
| All Phase 66 fields | Above + specimen_inat_genus + specimen_inat_family | |
| Minimum only (no grade) | Contradicts decided label format | |

**User's choice:** Minimum + quality grade — only what this phase renders.

---

## Claude's Discretion

- CSS class naming for the iNat ID label
- Whether to extract a shared `_renderQualityBadge` helper
- DOM structure within the provisional row
- Test fixture structure

## Deferred Ideas

- specimen_inat_genus / specimen_inat_family in OccurrenceRow — future filter scope
- Visual row tint for provisional status
