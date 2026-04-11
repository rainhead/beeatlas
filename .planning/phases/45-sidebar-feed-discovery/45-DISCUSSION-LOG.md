# Phase 45: Sidebar Feed Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 45-sidebar-feed-discovery
**Areas discussed:** Discovery trigger, Feed scope, Presentation style, Multiple collectors, Data flow

---

## Discovery Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Collector filter active | Show feed link only when at least one collector is selected | ✓ (with teaser) |
| Always visible | Permanent 'Subscribe' section, always showing main feed + active variants | |
| Samples mode only | Only show when layerMode is 'samples' | |

**User's choice:** Collector filter active — but also show a teaser hint ("search by collector name to subscribe to a feed of determinations" or similar) in the specimens summary panel when no collector is selected.

---

## Feed Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Collector feeds only | Show only collector-variant feed URLs | ✓ |
| All active filter variants | Surface genus/county/ecoregion feeds when those filters are active | |

**User's choice:** Collector feeds only.

---

## Presentation Style

| Option | Description | Selected |
|--------|-------------|----------|
| Inline below filter chip | Small subscribe link beneath active collector chip | |
| Dedicated sidebar section | A "Feeds" section at the bottom of the sidebar | ✓ |
| Inline in summary section | Append feed link at bottom of stats summary panel | |

**User's choice:** Dedicated sidebar section. Mockup accepted: collector name + "— determinations", [Copy URL] button, [Open] link.

---

## Copy vs Open Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Both Copy URL and Open | Copy to clipboard + open XML in new tab | ✓ |
| Subscribe link only | Single anchor opening feed XML | |
| Copy URL only | Clipboard copy only | |

**User's choice:** Both Copy URL and Open.

---

## Multiple Collectors

| Option | Description | Selected |
|--------|-------------|----------|
| One entry per collector | One feed row per selected collector | ✓ |
| First collector only | Single feed for first selected collector | |
| Disabled / hidden | Hide Feeds section when more than one collector selected | |

**User's choice:** One entry per collector.

---

## Data Flow

| Option | Description | Selected |
|--------|-------------|----------|
| bee-atlas loads index.json at startup | Fetches once at init, builds Map, passes activeFeedEntries prop | ✓ |
| Pass raw index.json entries | bee-atlas passes all collector entries; bee-sidebar filters | |
| bee-sidebar computes URL from pattern | Derives URL from collector slug, no index.json needed | |

**User's choice:** bee-atlas loads index.json at startup, computes activeFeedEntries, passes as prop to bee-sidebar.

---
