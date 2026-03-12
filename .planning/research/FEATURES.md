# Feature Research

**Domain:** Multi-layer interactive map with click-driven sidebar — specimen atlas with iNat event overlay
**Researched:** 2026-03-12
**Confidence:** HIGH (codebase directly inspected; OpenLayers API and map UX patterns verified)

---

## Scope: v1.4 Sample Layer

This milestone adds the frontend surfacing of data that already exists in built artifacts
(`samples.parquet` from v1.2, `links.parquet` from v1.3). All pipeline work is done.
The four requirements are MAP-03, MAP-04, MAP-05, LINK-05.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sample dot layer renders on map | samples.parquet exists; map without it means the milestone has not shipped | LOW | Plain unclustered VectorLayer; each row is one dot at (lon, lat); no Cluster source needed |
| Exclusive toggle: specimens vs sample dots | Two datasets; showing both simultaneously creates visual confusion and click ambiguity | LOW | `layer.setVisible(bool)` on each VectorLayer; exactly one active at a time |
| Sample marker click opens sidebar detail | Every clickable marker in this app opens a panel; omitting it for sample dots would be inconsistent | LOW | Reuses existing singleclick handler; branches on `_activeLayer` state |
| Sample sidebar: observer, date, specimen count | These are the three meaningful fields in samples.parquet beyond coordinates | LOW | `specimen_count` is nullable; null must render as "not recorded", not "0" |
| Sample sidebar: link to iNat observation | iNat is the authoritative source for these events; link closes the loop for collectors | LOW | URL: `https://www.inaturalist.org/observations/<observation_id>` |
| Specimen sidebar: iNat link when linkage exists | links.parquet is built and cached; not surfacing it wastes the v1.3 pipeline work | LOW | Lookup by occurrenceID at parquet load time; render link only when non-null |

### Differentiators (Competitive Advantage)

Features specific to this milestone that provide extra value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Toggle clears sidebar selection | Prevents stale data from the other layer appearing after a switch | LOW | On toggle: set selectedSamples = null (existing pattern); sidebar falls back to summary automatically |
| Sample dot style visually distinct from specimen clusters | Users must immediately understand they are viewing a different dataset | LOW | Different color or shape; simple flat circle vs recency-gradient cluster is sufficient |
| Filters show as inactive when sample layer is active | Specimen taxon/date filters have no meaning for sample dots; misleading UI must be avoided | MEDIUM | Conditionally render or disable filter controls when _activeLayer === 'samples'; sample dots have no taxon column |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Show specimens AND sample dots simultaneously | "More data = more useful" intuition | Click hit-test becomes ambiguous; user cannot know which layer was clicked; click handler must be forked per layer | Exclusive toggle is the correct design; both layers can exist in the OL layer list but only one is visible |
| Cluster sample dots | Specimens are clustered because 45k points overlap at state zoom | sample event count is in the hundreds; over-clustering a sparse dataset hides individual events collectors want to pinpoint | Plain unclustered VectorLayer; density does not warrant clustering |
| Filter sample dots by taxon | Specimen filtering already exists; parity feels expected | samples.parquet has no taxon column — taxon data is on specimens, not collection events | Disable or hide taxon filter when sample layer active; optionally show explanatory text |
| Persist selected sample marker in URL (o= param) | URL sharing works for specimens; parity feels right | Sample events use iNat observation_id, not ecdysis occurrenceID; mixing schemas in a single param adds fragility | Defer URL-persisted sample selection to a future milestone; v1.4 omits it without breaking existing URL sharing |
| Animate layer transition (crossfade) | Polished feel | No measurable user benefit for a field-use tool; OL does not provide built-in VectorLayer crossfade | Instant visibility swap is consistent with the rest of the app |

---

## Feature Dependencies

```
[samples.parquet loaded by hyparquet]
    └──enables──> [Sample dot layer renders on map]
                      └──enables──> [Sample marker click → iNat event sidebar]

[links.parquet loaded by hyparquet]
    └──enables──> [Specimen sidebar: iNat link when linkage exists]

[Exclusive toggle UI]
    └──requires──> [Both layers present in OL map]
    └──drives──>   [Sidebar clears on layer switch]
    └──drives──>   [Filter controls hide/disable when sample layer active]

[Sample dot layer] ──conflicts with (simultaneous)──> [Specimen cluster layer]
```

### Dependency Notes

- **Sample dot layer requires samples.parquet loaded:** The existing `ParquetSource` pattern handles
  this. A second `ParquetSource` instance for `samplesDump` is the natural extension. Each row
  becomes an OL Feature with geometry from (lon, lat) and properties `observation_id`, `observer`,
  `date`, `specimen_count`.

- **Specimen iNat link requires links.parquet:** Load at startup alongside `ecdysis.parquet`. Build
  a `Map<string, number>` (occurrenceID → inat_observation_id). Look up each specimen's
  `occurrenceID` when rendering the sidebar. The sidebar currently stores `s.occid` as the integer
  Ecdysis DB id; links.parquet is keyed by UUID `occurrenceID`. The join must use `occurrenceID`
  from `ecdysis.parquet` (added in v1.3). The simplest approach: resolve iNat links at load time
  in the `specimenSource.once('change', ...)` callback and pass them as a pre-resolved lookup to
  the sidebar.

- **Sidebar must branch on data type:** `bee-sidebar.ts` currently accepts `samples: Sample[] | null`.
  For iNat events, a distinct `InatEvent` interface is needed. The sidebar's render() already
  branches on `samples !== null`; add a parallel branch for `inatEvent !== null`. Exactly one of
  `samples`, `inatEvent` should be non-null at any time (or both null for the summary view).
  This is the highest-complexity change in v1.4 — it touches both `bee-map.ts` (what to pass) and
  `bee-sidebar.ts` (how to render it).

- **Filter controls conflict with sample layer:** When `_activeLayer === 'samples'`, the taxon/date
  filter controls are meaningless. Rendering them active is misleading. Recommended: conditionally
  render filter controls only when specimen layer is active, or render them visibly disabled with
  a brief explanation. This is a P2 improvement — the app works without it, but it reduces confusion.

---

## MVP Definition

### Launch With (v1.4)

Minimum viable product — all four defined requirements.

- [ ] MAP-03: Sample dot layer visible on map (unclustered VectorLayer from samples.parquet)
- [ ] MAP-04: Exclusive toggle switches between specimen clusters and sample dots; both layers
      respond; sidebar clears on switch
- [ ] MAP-05: Clicking a sample marker shows observer, date, specimen count (or "not recorded"),
      and iNat observation link in sidebar
- [ ] LINK-05: Specimen sidebar shows clickable iNat link when links.parquet maps the occurrenceID

### Add After Validation (v1.x)

- [ ] Filter controls adapt when layer is switched — hide or disable specimen-only filters when
      sample layer is active; defer until user confusion is reported
- [ ] Sample layer count in sidebar summary — "N collection events" when sample layer is active,
      mirroring the specimen summary panel
- [ ] URL encoding of selected sample marker — add `inat=<observation_id>` param when collectors
      confirm they share sample links; deferred because o= encoding is ecdysis-specific

### Future Consideration (v2+)

- [ ] Combined view (specimens + sample dots) with z-index and click disambiguation — only
      warranted if collectors explicitly request overlapping views
- [ ] Sample dot size-encoded by specimen count — collector insight value; wait for feedback on
      basic dot layer first

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Sample dot layer (MAP-03) | HIGH | LOW | P1 |
| Exclusive toggle (MAP-04) | HIGH | LOW | P1 |
| Sample sidebar with iNat link (MAP-05) | HIGH | MEDIUM | P1 |
| Specimen iNat link via links.parquet (LINK-05) | MEDIUM | LOW | P1 |
| Filter controls adapt per active layer | MEDIUM | LOW | P2 |
| Sidebar summary shows sample event count | LOW | LOW | P2 |
| URL state for selected sample marker | LOW | MEDIUM | P3 |
| Combined specimen + sample view | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.4 launch
- P2: Should have, add in v1.4 if time permits
- P3: Nice to have, future milestone

---

## Implementation Notes

### Exclusive Toggle Pattern (MAP-04)

OpenLayers `layer.setVisible(bool)` is the mechanism. The correct implementation:

```
toggleToSamples():   specimenLayer.setVisible(false); sampleLayer.setVisible(true); clearSelection();
toggleToSpecimens(): sampleLayer.setVisible(false); specimenLayer.setVisible(true); clearSelection();
```

A `@state() private _activeLayer: 'specimens' | 'samples'` field on `BeeMap` drives both the
toggle button label and the singleclick handler branch. No third-party layer switcher library is
needed — a simple two-button or `<input type="radio">` group is sufficient and consistent with the
app's minimal UI.

The singleclick handler in `bee-map.ts` checks `specimenLayer.getFeatures(event.pixel)`. With
two exclusive layers, the branch is: if `_activeLayer === 'specimens'`, handle as cluster hit; if
`_activeLayer === 'samples'`, check `sampleLayer.getFeatures(event.pixel)` and handle as iNat
event hit.

### Sidebar Data Shape (MAP-05)

`bee-sidebar.ts` should accept a new property `inatEvent: InatEvent | null` alongside the existing
`samples: Sample[] | null`:

```typescript
interface InatEvent {
  observationId: number;
  observer: string;
  date: string;           // ISO date string from parquet
  specimenCount: number | null;
}
```

The sidebar render() already branches on `samples !== null`. Add: else if `inatEvent !== null`,
render the iNat event detail panel. Both properties being null shows the summary view.

### Specimen iNat Link (LINK-05)

Load `links.parquet` at startup. Build a `Map<string, number>` keyed by integer Ecdysis DB id
(matching `s.occid` in the existing `Specimen` interface) for O(1) lookup per specimen in the
detail render. The join key mapping from UUID `occurrenceID` to integer `occid` must be done at
load time using the `occurrenceID` column in `ecdysis.parquet`.

---

## Layer Switching: Standard Map App Patterns

**How map apps handle exclusive layer switching (verified from OpenLayers docs and map UX
literature, MEDIUM confidence):**

1. **Visibility toggle via `setVisible()`** — the standard OL approach. No layer removal/addition
   needed. Layer objects persist; only visibility changes. This is what ol-layerswitcher uses for
   base layer radio buttons (type: 'base' layers get radio button behavior).

2. **Radio button or segmented button in UI** — the conventional UX pattern for mutually exclusive
   data layers. A checkbox implies independent toggling; a radio or segmented control communicates
   exclusivity. Google Maps, iNaturalist explore, and eBird all use radio/segmented buttons for
   exclusive base or data layer switches.

3. **Sidebar content clears on layer switch** — the dominant pattern in map apps with context
   panels (iNaturalist, eBird, AllTrails). The sidebar shows context for whatever is selected on
   the active layer; switching layers resets the selection to prevent stale context. This aligns
   with the existing `selectedSamples = null` pattern when filters are applied.

**Dot vs cluster for different densities:**

At state-level zoom with 45k specimen points, clustering is necessary to prevent visual noise and
click target collisions. At the same zoom with a few hundred iNat collection events, individual
dots are readable and preferred — clustering would collapse distinct field events into a single
unclickable blob, destroying the primary value of the layer (locating individual collection events).

The decision boundary is roughly: cluster when points overlap meaningfully at the user's working
zoom level. For the WA Bee Atlas specimen layer (45k points, statewide), clustering is essential.
For the sample layer (hundreds of events), it is not.

---

## Sources

- OpenLayers API `layer.setVisible()`: [OpenLayers Layer API](https://openlayers.org/en/latest/apidoc/module-ol_layer_Layer-Layer.html) — HIGH confidence
- ol-layerswitcher base layer radio pattern: [GitHub walkermatt/ol-layerswitcher](https://github.com/walkermatt/ol-layerswitcher) — MEDIUM confidence
- Map UI clustering patterns: [Cluster marker — Map UI Patterns](https://mapuipatterns.com/cluster-marker/), [Marker — Map UI Patterns](https://mapuipatterns.com/marker/) — MEDIUM confidence
- Map UI layer/sidebar patterns: [Map UI Design — Eleken](https://www.eleken.co/blog-posts/map-ui-design), [Map UI — UXPin](https://www.uxpin.com/studio/blog/map-ui/), [Map UI Patterns](https://mapuipatterns.com/patterns/) — MEDIUM confidence
- Existing codebase (`bee-map.ts`, `bee-sidebar.ts`, `PROJECT.md`) — HIGH confidence (direct inspection)

---
*Feature research for: Washington Bee Atlas v1.4 Sample Layer*
*Researched: 2026-03-12*
