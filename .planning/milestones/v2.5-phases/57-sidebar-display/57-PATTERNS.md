# Phase 57: Sidebar Display - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 6 modified files + 1 test file (new describes in existing file)
**Analogs found:** 6 / 6 (all modifications to existing files; patterns extracted from those same files)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `frontend/src/bee-sidebar.ts` | model (interfaces) | — | self (existing `Sample`, `SampleEvent` interface declarations at lines 17–56) | exact |
| `frontend/src/features.ts` | service | request-response | self (existing `host_observation_id` / `specimen_observation_id` null-coerce pattern at lines 42–45, 90) | exact |
| `frontend/src/bee-map.ts` — `buildSamples()` | transform | batch | self (existing property reads at lines 34–39, 43–47) | exact |
| `frontend/src/bee-map.ts` — `map-click-sample` emit | event dispatcher | event-driven | self (existing emit at lines 481–488) | exact |
| `frontend/src/bee-map.ts` — `_buildRecentSampleEvents()` | transform | batch | self (existing `SampleEvent` literal construction at lines 317–330) | exact |
| `frontend/src/bee-atlas.ts` — `_restoreSelectionSamples()` | service | CRUD | self (existing `Sample` literal construction at lines 752–759) | exact |
| `frontend/src/bee-specimen-detail.ts` | component (presenter) | request-response | self (existing conditional render: `s.hostObservationId != null ? html...` at lines 105–108) | exact |
| `frontend/src/bee-sample-detail.ts` | component (presenter) | request-response | self (existing flat-div render pattern at lines 71–73) | exact |
| `frontend/src/tests/bee-sidebar.test.ts` | test | — | self (existing DOM render describes at lines 186–270) | exact |

---

## Pattern Assignments

### `frontend/src/bee-sidebar.ts` — interface extension

**Analog:** Same file, lines 17–56 (existing `Sample` and `SampleEvent` interface declarations).

**Current `Sample` interface** (lines 17–23):
```typescript
export interface Sample {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  species: Specimen[];
}
```

**Current `SampleEvent` interface** (lines 49–56):
```typescript
export interface SampleEvent {
  observation_id: number;
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  coordinate: number[];  // EPSG:3857
}
```

**Add to each** — place `elevation_m` after the last existing field, before the closing brace:
```typescript
elevation_m: number | null;
```

TypeScript will then flag every incomplete object literal that constructs `Sample` or `SampleEvent` as a compile error — use those errors as a checklist for the remaining touch points.

---

### `frontend/src/features.ts` — DuckDB SELECT + setProperties

**Analog:** Same file. The established null-coerce pattern for nullable integers is at lines 42 and 45:
```typescript
// lines 42–45 of features.ts
host_observation_id: obj.host_observation_id != null ? Number(obj.host_observation_id) : null,
inat_host: obj.inat_host ?? null,
inat_quality_grade: obj.inat_quality_grade ?? null,
specimen_observation_id: obj.specimen_observation_id != null ? Number(obj.specimen_observation_id) : null,
```

**EcdysisSource — add to SELECT** (after line 22, inside the backtick SQL string):
```sql
elevation_m   -- add after specimen_observation_id
```

**EcdysisSource — add to setProperties** (after line 45):
```typescript
elevation_m: obj.elevation_m != null ? Number(obj.elevation_m) : null,
```

**SampleSource — add to SELECT** (after line 73, inside the backtick SQL string):
```sql
elevation_m   -- add after ecoregion_l3
```

**SampleSource — add to setProperties** (after line 90, inside `feature.setProperties`):
```typescript
elevation_m: obj.elevation_m != null ? Number(obj.elevation_m) : null,
```

Use `!= null` (loose) at the feature boundary to guard against both `null` and `undefined` from the DuckDB row. This coerces BigInt (DuckDB WASM INT16 can return as BigInt) to `number` at the boundary so downstream code can use `Math.round()` safely.

---

### `frontend/src/bee-map.ts` — `buildSamples()` (lines 29–51)

**Analog:** Same function. Current `map.set(key, {...})` at lines 34–40:
```typescript
map.set(key, {
  year: f.get('year') as number,
  month: f.get('month') as number,
  recordedBy: f.get('recordedBy') as string,
  fieldNumber: f.get('fieldNumber') as string,
  species: [],
});
```

**Add `elevation_m` to this literal** (after `species: []`):
```typescript
elevation_m: f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null,
```

`elevation_m` belongs on the `Sample` (grouping key), not per-`Specimen`. Reading from the first feature in the group is correct — all specimens in one sample share the same collection event and thus the same elevation.

---

### `frontend/src/bee-map.ts` — `_buildRecentSampleEvents()` (lines 308–331)

**Analog:** Same method. Current `SampleEvent` literal at lines 322–330:
```typescript
return {
  observation_id: f.get('observation_id') as number,
  observer: f.get('observer') as string,
  date,
  specimen_count: f.get('specimen_count') as number,
  sample_id: f.get('sample_id') as number | null,
  coordinate: (f.getGeometry() as Point).getCoordinates(),
};
```

**Add `elevation_m`** (after `coordinate`):
```typescript
elevation_m: f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null,
```

---

### `frontend/src/bee-map.ts` — `map-click-sample` emit (lines 481–488)

**Analog:** Same emit block:
```typescript
this._emit('map-click-sample', {
  observation_id: f.get('observation_id') as number,
  observer: f.get('observer') as string,
  date: f.get('date') as string,
  specimen_count: f.get('specimen_count') as number,
  sample_id: f.get('sample_id') as number | null,
  coordinate: (f.getGeometry() as Point).getCoordinates(),
});
```

**Add `elevation_m`** (after `coordinate`):
```typescript
elevation_m: f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null,
```

---

### `frontend/src/bee-atlas.ts` — `_restoreSelectionSamples()` (lines 727–778)

**Analog:** Same method. Current `map.set(key, {...})` at lines 752–759:
```typescript
map.set(key, {
  year: Number(obj.year),
  month: Number(obj.month),
  recordedBy: String(obj.recordedBy),
  fieldNumber: String(obj.fieldNumber),
  species: [],
});
```

Two changes required:

1. **Add `elevation_m` to the SELECT** at line 742–746 (after `specimen_observation_id`):
```sql
elevation_m
```

2. **Add `elevation_m` to the `map.set(key, {...})` literal** (after `species: []`):
```typescript
elevation_m: obj.elevation_m != null ? Number(obj.elevation_m) : null,
```

Omitting this causes elevation to disappear after browser back/forward navigation (URL-restore path rebuilds `Sample` objects independently of `buildSamples()`).

---

### `frontend/src/bee-specimen-detail.ts` — conditional elevation row

**Analog:** Same file. Existing conditional render pattern at lines 105–108:
```typescript
${s.hostObservationId != null ? html`
  · <a href="https://www.inaturalist.org/observations/${s.hostObservationId}" target="_blank" rel="noopener">${this._renderHostInfo(s)}</a>
` : html` · <span class="inat-missing">iNat: —</span>`}
```

**Existing `.host-label` CSS** (lines 50–53) — same visual as UI-SPEC's `.detail-label`:
```css
.host-label {
  color: var(--text-hint);
  font-size: 0.75rem;
}
```

**Add elevation row in `render()`** immediately after the existing `.sample-meta` line (line 100), before the `<ul class="species-list">`:
```typescript
${sample.elevation_m !== null
  ? html`<div class="sample-meta">
      <span class="host-label">Elevation</span>
      ${Math.round(sample.elevation_m)} m
    </div>`
  : ''}
```

Use `.host-label` (already defined, same styles as UI-SPEC's `.detail-label`) to avoid adding a redundant CSS rule. Use `!== null` strict equality — `!= null` would render when value is `undefined`.

Use `Math.round()` not `toFixed(0)` — `toFixed` is semantically wrong for integers and UI-SPEC mandates `Math.round`.

---

### `frontend/src/bee-sample-detail.ts` — conditional elevation row

**Analog:** Same file. Current flat-div render pattern at lines 71–73:
```typescript
<div class="event-date">${this._formatSampleDate(event.date)}</div>
<div class="event-observer">${event.observer}</div>
<div class="event-count">${count}</div>
```

**Existing `.event-count` CSS** (lines 33–35):
```css
.event-count {
  font-size: 0.8rem;
  color: var(--text-hint);
}
```

**Add CSS** to `static styles` (after `.event-count` block):
```css
.event-elevation {
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

**Add elevation row in `render()`** after `<div class="event-count">` (line 73):
```typescript
${event.elevation_m !== null
  ? html`<div class="event-elevation">${Math.round(event.elevation_m)} m</div>`
  : ''}
```

Use `!== null` strict equality. No label span needed for `bee-sample-detail` — UI-SPEC shows value-only (`"1219 m"`) matching `.event-count` / `.event-observer` flat style.

---

### `frontend/src/tests/bee-sidebar.test.ts` — new ELEV-05 / ELEV-06 describes

**Analog:** Same file. Existing DOM render describe at lines 186–270 (`'bee-specimen-detail render'`). The pattern to copy:

**Test structure pattern** (lines 186–225):
```typescript
describe('bee-specimen-detail render', () => {
  test('renders sample data into shadow DOM', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');

    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2023,
        month: 6,
        recordedBy: 'J. Smith',
        fieldNumber: 'WA-2023-001',
        species: [
          { name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null },
        ],
      },
    ];

    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const text = shadow.textContent ?? '';

    expect(text).toContain('J. Smith');

    document.body.removeChild(el);
  });
});
```

**New describes to add** — append to end of file, following the same structure. All four fixture objects must now include `elevation_m` since the interface will require it:

```typescript
describe('ELEV-05: bee-specimen-detail elevation display', () => {
  test('shows elevation row when elevation_m is non-null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [{
      year: 2023, month: 6,
      recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
      elevation_m: 1219,
      species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null }],
    }];
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain('1219 m');
    document.body.removeChild(el);
  });

  test('omits elevation row when elevation_m is null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [{
      year: 2023, month: 6,
      recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
      elevation_m: null,
      species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null }],
    }];
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).not.toContain('Elevation');
    expect(text).not.toContain(' m');
    document.body.removeChild(el);
  });
});

describe('ELEV-06: bee-sample-detail elevation display', () => {
  test('shows elevation when elevation_m is non-null', async () => {
    const { BeeSampleDetail } = await import('../bee-sample-detail.ts');
    const el = new BeeSampleDetail();
    el.sampleEvent = {
      observation_id: 1, observer: 'J. Smith', date: '2023-06-01',
      specimen_count: 3, sample_id: null, coordinate: [0, 0],
      elevation_m: 1219,
    };
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain('1219 m');
    document.body.removeChild(el);
  });

  test('omits elevation when elevation_m is null', async () => {
    const { BeeSampleDetail } = await import('../bee-sample-detail.ts');
    const el = new BeeSampleDetail();
    el.sampleEvent = {
      observation_id: 1, observer: 'J. Smith', date: '2023-06-01',
      specimen_count: 3, sample_id: null, coordinate: [0, 0],
      elevation_m: null,
    };
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).not.toContain(' m');
    document.body.removeChild(el);
  });
});
```

**Note on existing test fixtures:** After adding `elevation_m: number | null` to `Sample` and `SampleEvent`, the existing test fixtures in `bee-sidebar.test.ts` that construct these objects without `elevation_m` will produce TypeScript errors. Each existing fixture object (lines 191–205, 231–241, 262, 343–346, 352–355, 363–368, 374–377, 384–387) must be updated to include `elevation_m: null`.

---

## Shared Patterns

### Nullable integer coercion at DuckDB boundary
**Source:** `frontend/src/features.ts` lines 42, 45
**Apply to:** Every site that reads `elevation_m` from a DuckDB row (`obj.elevation_m`) or an OL feature property (`f.get('elevation_m')`)
```typescript
// From DuckDB row (features.ts, bee-atlas.ts)
obj.elevation_m != null ? Number(obj.elevation_m) : null

// From OL feature property (bee-map.ts)
f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null
```
Rationale: DuckDB WASM INT16 columns can return BigInt. `Number()` coercion at the boundary prevents `Math.round(BigInt)` TypeError downstream.

### Conditional Lit template row omission
**Source:** `frontend/src/bee-specimen-detail.ts` lines 105–108
**Apply to:** `bee-specimen-detail.ts` and `bee-sample-detail.ts` elevation rows
```typescript
${value !== null ? html`...` : ''}
```
Use `!== null` strict equality (not `!= null`) — `undefined` must not render.

### Pure presenter constraint
**Source:** `frontend/src/tests/bee-sidebar.test.ts` lines 93–96, 106–109
**Apply to:** `bee-specimen-detail.ts` and `bee-sample-detail.ts`
```typescript
test('bee-specimen-detail.ts does NOT contain @state()', () => {
  const src = readFileSync(resolve(__dirname, '../bee-specimen-detail.ts'), 'utf-8');
  expect(src).not.toMatch(/@state\(\)/);
});
```
`elevation_m` must flow in as a property on the data object (`Sample.elevation_m`, `SampleEvent.elevation_m`), not as a component `@state()`. Existing tests assert this invariant.

---

## No Analog Found

None. All phase 57 changes are to existing files with well-established patterns that apply directly.

---

## Metadata

**Analog search scope:** `frontend/src/` — all modified files are their own best analog
**Files scanned:** 8 source files + 1 test file
**Pattern extraction date:** 2026-04-15
