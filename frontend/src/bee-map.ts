import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { View } from "ol";
import OpenLayersMap from "ol/Map.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { ParquetSource, loadLinksMap } from "./parquet.ts";
import ecdysisDump from './assets/ecdysis.parquet?url';
import samplesDump from './assets/samples.parquet?url';
import linksDump from './assets/links.parquet?url';
import VectorLayer from "ol/layer/Vector.js";
import LayerGroup from "ol/layer/Group.js";
import Cluster from "ol/source/Cluster.js";
import { clusterStyle } from "./style.ts";
import { SampleParquetSource } from './parquet.ts';
import { sampleDotStyle } from './style.ts';
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import Feature from "ol/Feature.js";
import Point from 'ol/geom/Point.js';
import type MapBrowserEvent from "ol/MapBrowserEvent.js";
import { filterState, isFilterActive, matchesFilter } from './filter.ts';
import './bee-sidebar.ts';
import type { Sample, DataSummary, TaxonOption, FilteredSummary, FilterChangedEvent, SampleEvent } from './bee-sidebar.ts';

const sphericalMercator = 'EPSG:3857';

// Default Washington State view
const DEFAULT_LON = -120.5;
const DEFAULT_LAT = 47.5;
const DEFAULT_ZOOM = 7;

interface ParsedParams {
  lon: number;
  lat: number;
  zoom: number;
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  occurrenceIds: string[];
  layerMode: 'specimens' | 'samples';
}

function buildSearchParams(
  center: number[],
  zoom: number,
  fs: typeof filterState,
  selectedOccIds: string[] | null,
  layerMode: 'specimens' | 'samples'
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('x', center[0]!.toFixed(4));
  params.set('y', center[1]!.toFixed(4));
  params.set('z', zoom.toFixed(2));
  if (fs.taxonName !== null) {
    params.set('taxon', fs.taxonName);
    params.set('taxonRank', fs.taxonRank!);
  }
  if (fs.yearFrom !== null) params.set('yr0', String(fs.yearFrom));
  if (fs.yearTo   !== null) params.set('yr1', String(fs.yearTo));
  if (fs.months.size > 0)  params.set('months', [...fs.months].sort((a, b) => a - b).join(','));
  if (selectedOccIds !== null && selectedOccIds.length > 0) {
    params.set('o', selectedOccIds.join(','));
  }
  if (layerMode !== 'specimens') params.set('lm', layerMode);  // omit default value
  return params;
}

function parseUrlParams(search: string): ParsedParams {
  const p = new URLSearchParams(search);
  const x = parseFloat(p.get('x') ?? '');
  const y = parseFloat(p.get('y') ?? '');
  const z = parseFloat(p.get('z') ?? '');
  const lon  = isFinite(x) && x >= -180 && x <= 180 ? x : DEFAULT_LON;
  const lat  = isFinite(y) && y >= -90  && y <= 90  ? y : DEFAULT_LAT;
  const zoom = isFinite(z) && z >= 1    && z <= 22  ? z : DEFAULT_ZOOM;

  const taxonName = p.get('taxon') ?? null;
  const rawRank   = p.get('taxonRank') ?? null;
  const taxonRank = (['family', 'genus', 'species'] as const).includes(rawRank as any)
    ? rawRank as 'family' | 'genus' | 'species' : null;
  // Both must be present and valid; if either is missing treat both as absent
  const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;
  const resolvedTaxonRank = (taxonName && taxonRank) ? taxonRank : null;

  const yearFrom = parseInt(p.get('yr0') ?? '') || null;
  const yearTo   = parseInt(p.get('yr1') ?? '') || null;
  const monthsStr = p.get('months') ?? '';
  const months = new Set(
    monthsStr ? monthsStr.split(',').map(Number).filter(n => n >= 1 && n <= 12) : []
  );
  const oRaw = p.get('o') ?? '';
  const occurrenceIds = oRaw
    ? oRaw.split(',').map(s => s.trim()).filter(s => s.startsWith('ecdysis:') && s.length > 8)
    : [];

  const lmRaw = p.get('lm') ?? '';
  const layerMode: 'specimens' | 'samples' = lmRaw === 'samples' ? 'samples' : 'specimens';

  return { lon, lat, zoom, taxonName: resolvedTaxonName, taxonRank: resolvedTaxonRank, yearFrom, yearTo, months, occurrenceIds, layerMode };
}

function buildSamples(features: Feature[], linksMap?: Map<string, number>): Sample[] {
  const map = new Map<string, Sample>();
  for (const f of features) {
    const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
    if (!map.has(key)) {
      map.set(key, {
        year: f.get('year') as number,
        month: f.get('month') as number,
        recordedBy: f.get('recordedBy') as string,
        fieldNumber: f.get('fieldNumber') as string,
        species: [],
      });
    }
    const occid = (f.getId() as string).replace('ecdysis:', '');
    const inatId = linksMap ? (linksMap.get(f.get('occurrenceID') as string) ?? null) : null;
    const floralHost = (f.get('floralHost') as string | null | undefined) ?? null;
    map.get(key)!.species.push({ name: f.get('scientificName') as string, occid, inatObservationId: inatId, floralHost });
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

function computeSummary(features: Feature[]): DataSummary {
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let min = Infinity, max = -Infinity;
  for (const f of features) {
    const s = f.get('scientificName') as string;
    const g = f.get('genus') as string;
    const fam = f.get('family') as string;
    if (s) species.add(s);
    if (g) genera.add(g);
    if (fam) families.add(fam);
    const y = f.get('year') as number;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return {
    totalSpecimens: features.length,
    speciesCount: species.size,
    genusCount: genera.size,
    familyCount: families.size,
    earliestYear: min === Infinity ? 0 : min,
    latestYear: max === -Infinity ? 0 : max,
  };
}

function buildTaxaOptions(features: Feature[]): TaxonOption[] {
  const families = new Set<string>();
  const genera = new Set<string>();
  const species = new Set<string>();
  for (const f of features) {
    const fam = f.get('family') as string | null;
    const gen = f.get('genus') as string | null;
    const sp  = f.get('scientificName') as string | null;
    if (fam) families.add(fam);
    if (gen) genera.add(gen);
    if (sp) species.add(sp);
  }
  return [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
    ...[...species].sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
  ];
}

const specimenSource = new ParquetSource({url: ecdysisDump});
const clusterSource = new Cluster({
  distance: 40,
  minDistance: 0,
  source: specimenSource,
});
const specimenLayer = new VectorLayer({
  source: clusterSource,
  style: clusterStyle,
});
const sampleSource = new SampleParquetSource({url: samplesDump});
const sampleLayer = new VectorLayer({ source: sampleSource, style: sampleDotStyle });

@customElement('bee-map')
export class BeeMap extends LitElement {
  @query('#map')
  mapElement!: HTMLDivElement

  map?: OpenLayersMap

  @state()
  private selectedSamples: Sample[] | null = null;

  @state()
  private summary: DataSummary | null = null;

  private _linksMap: Map<string, number> = new Map();

  @state() private _selectedSampleEvent: SampleEvent | null = null;

  @state() private layerMode: 'specimens' | 'samples' = 'specimens';
  @state() private sampleDataLoaded = false;
  @state() private recentSampleEvents: SampleEvent[] = [];

  @state()
  private taxaOptions: TaxonOption[] = [];

  @state()
  private filteredSummary: FilteredSummary | null = null;

  private _isRestoringFromHistory = false;
  private _mapMoveDebounce: ReturnType<typeof setTimeout> | null = null;
  private _selectedOccIds: string[] | null = null;

  // Filter state mirrored for URL sync — these track what to pass down to bee-sidebar for display restore
  @state() private _restoredTaxonInput = '';
  @state() private _restoredTaxonRank: 'family' | 'genus' | 'species' | null = null;
  @state() private _restoredTaxonName: string | null = null;
  @state() private _restoredYearFrom: number | null = null;
  @state() private _restoredYearTo: number | null = null;
  @state() private _restoredMonths: Set<number> = new Set();

  private _onPopState = () => {
    this._isRestoringFromHistory = true;
    if (this._mapMoveDebounce) {
      clearTimeout(this._mapMoveDebounce);
      this._mapMoveDebounce = null;
    }
    const parsed = parseUrlParams(window.location.search);
    const view = this.map!.getView();
    const currentCenter = toLonLat(view.getCenter()!);
    const currentZoom = view.getZoom()!;
    const viewWillChange =
      Math.abs(currentCenter[0]! - parsed.lon) > 0.0001 ||
      Math.abs(currentCenter[1]! - parsed.lat) > 0.0001 ||
      Math.abs(currentZoom - parsed.zoom) > 0.01;

    if (viewWillChange) {
      // OL will fire moveend after the programmatic move — reset flag there.
      // Without this, the finally block would reset it synchronously, letting
      // the moveend handler push a new history entry that cancels back navigation.
      this.map!.once('moveend', () => {
        this._isRestoringFromHistory = false;
      });
    } else {
      // No view change — OL won't fire moveend, reset flag synchronously
      this._isRestoringFromHistory = false;
    }

    view.setCenter(fromLonLat([parsed.lon, parsed.lat]));
    view.setZoom(parsed.zoom);
    this._restoreFilterState(parsed);
    if (parsed.layerMode !== this.layerMode) {
      // Layer switch clears selections and syncs URL
      this._onLayerChanged(parsed.layerMode);
    } else if (parsed.occurrenceIds.length > 0) {
      this._restoreSelectedOccurrences(parsed.occurrenceIds);
    } else {
      this.selectedSamples = null;
      this._selectedOccIds = null;
    }
  };

  static styles = css`
:host {
  align-items: stretch;
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: auto;
}
#map {
  flex-grow: 1
}
bee-sidebar {
  width: 25rem;
  border-left: 1px solid #cccccc;
  overflow-y: auto;
}
@media (max-aspect-ratio: 1) {
  :host {
    flex-direction: column;
  }
  #map {
    height: 50svh;
    flex-grow: 0;
    flex-shrink: 0;
  }
  bee-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid #cccccc;
    flex-grow: 1;
  }
}
  `

  private _onLayerChanged(mode: 'specimens' | 'samples') {
    this.layerMode = mode;
    specimenLayer.setVisible(mode === 'specimens');
    sampleLayer.setVisible(mode === 'samples');
    this.selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;
    if (mode === 'samples' && this.sampleDataLoaded) {
      this.recentSampleEvents = this._buildRecentSampleEvents();
    }
    if (this.map) this._pushUrlState();
  }

  private _buildRecentSampleEvents(): SampleEvent[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return sampleSource.getFeatures()
      .filter(f => new Date(f.get('date') as string) >= cutoff)
      .sort((a, b) =>
        new Date(b.get('date') as string).valueOf() -
        new Date(a.get('date') as string).valueOf()
      )
      .map(f => ({
        observation_id: f.get('observation_id') as number,
        observer: f.get('observer') as string,
        date: f.get('date') as string,
        specimen_count: f.get('specimen_count') as number,
        coordinate: (f.getGeometry() as Point).getCoordinates(),
      }));
  }

  private _onSampleEventClick(e: CustomEvent<{coordinate: number[]}>) {
    if (!this.map) return;
    this.map.getView().animate({ center: e.detail.coordinate, zoom: 12, duration: 300 });
  }

  private _restoreFilterState(parsed: ParsedParams) {
    filterState.taxonName = parsed.taxonName;
    filterState.taxonRank = parsed.taxonRank;
    filterState.yearFrom  = parsed.yearFrom;
    filterState.yearTo    = parsed.yearTo;
    filterState.months    = parsed.months;

    clusterSource.changed();
    this.map?.render();

    // Recompute filteredSummary
    const allFeatures = specimenSource.getFeatures();
    const active = isFilterActive(filterState);
    if (active && allFeatures.length > 0) {
      const matching = allFeatures.filter(f => matchesFilter(f, filterState));
      const fSummary = computeSummary(matching);
      this.filteredSummary = {
        filteredSpecimens: fSummary.totalSpecimens,
        filteredSpeciesCount: fSummary.speciesCount,
        filteredGenusCount: fSummary.genusCount,
        filteredFamilyCount: fSummary.familyCount,
        total: this.summary!,
        isActive: true,
      };
    } else {
      this.filteredSummary = null;
    }

    // Mirror to sidebar-driving @state fields (drives bee-sidebar controls via property binding)
    this._restoredTaxonName  = parsed.taxonName;
    this._restoredTaxonRank  = parsed.taxonRank;
    this._restoredTaxonInput = parsed.taxonName
      ? (this.taxaOptions.find(o => o.name === parsed.taxonName && o.rank === parsed.taxonRank)?.label ?? parsed.taxonName)
      : '';
    this._restoredYearFrom = parsed.yearFrom;
    this._restoredYearTo   = parsed.yearTo;
    this._restoredMonths   = parsed.months;
  }

  private _restoreSelectedOccurrences(occIds: string[]) {
    const features: Feature[] = [];
    for (const occId of occIds) {
      const feature = specimenSource.getFeatureById(occId) as Feature | null;
      if (feature) features.push(feature);
    }
    if (features.length === 0) {
      this.selectedSamples = null;
      this._selectedOccIds = null;
      return;
    }
    const toShow = isFilterActive(filterState)
      ? features.filter(f => matchesFilter(f, filterState))
      : features;
    if (toShow.length > 0) {
      this.selectedSamples = buildSamples(toShow, this._linksMap);
      this._selectedOccIds = toShow.map(f => f.getId() as string);
    } else {
      this.selectedSamples = null;
      this._selectedOccIds = null;
    }
  }

  private _pushUrlState() {
    const view = this.map!.getView();
    const center = toLonLat(view.getCenter()!);
    const zoom = view.getZoom()!;
    const params = buildSearchParams(center, zoom, filterState, this._selectedOccIds, this.layerMode);
    window.history.replaceState({}, '', '?' + params.toString());
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  }

  private _applyFilter(detail: FilterChangedEvent) {
    // Mutate the shared singleton (closed over by clusterStyle)
    filterState.taxonName = detail.taxonName;
    filterState.taxonRank = detail.taxonRank;
    filterState.yearFrom  = detail.yearFrom;
    filterState.yearTo    = detail.yearTo;
    filterState.months    = detail.months;

    // Force OL to repaint with new filter state
    clusterSource.changed();
    // Also call map render in case changed() alone doesn't trigger repaint
    this.map?.render();

    // Recompute filtered summary for sidebar stats
    const allFeatures = specimenSource.getFeatures();
    const active = isFilterActive(filterState);
    if (active && allFeatures.length > 0) {
      const matching = allFeatures.filter(f => matchesFilter(f, filterState));
      const fSummary = computeSummary(matching);
      this.filteredSummary = {
        filteredSpecimens: fSummary.totalSpecimens,
        filteredSpeciesCount: fSummary.speciesCount,
        filteredGenusCount: fSummary.genusCount,
        filteredFamilyCount: fSummary.familyCount,
        total: this.summary!,
        isActive: true,
      };
    } else {
      this.filteredSummary = null;
    }

    // Clear selected samples (applying a filter dismisses any open cluster detail)
    this.selectedSamples = null;

    // Sync filter change to URL
    this._selectedOccIds = null;
    if (!this._isRestoringFromHistory && this.map) {
      this._pushUrlState();
    }
  }

  public render() {
    return html`
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
      <div id="map"></div>
      <bee-sidebar
        .samples=${this.selectedSamples}
        .summary=${this.summary}
        .taxaOptions=${this.taxaOptions}
        .filteredSummary=${this.filteredSummary}
        .layerMode=${this.layerMode}
        .recentSampleEvents=${this.recentSampleEvents}
        .selectedSampleEvent=${this._selectedSampleEvent}
        .restoredTaxonInput=${this._restoredTaxonInput}
        .restoredTaxonRank=${this._restoredTaxonRank}
        .restoredTaxonName=${this._restoredTaxonName}
        .restoredYearFrom=${this._restoredYearFrom}
        .restoredYearTo=${this._restoredYearTo}
        .restoredMonths=${this._restoredMonths}
        @close=${() => {
          this.selectedSamples = null;
          this._selectedOccIds = null;
          if (this.map) this._pushUrlState();
        }}
        @filter-changed=${(e: CustomEvent<FilterChangedEvent>) => this._applyFilter(e.detail)}
        @layer-changed=${(e: CustomEvent<'specimens' | 'samples'>) => this._onLayerChanged(e.detail)}
        @sample-event-click=${(e: CustomEvent<{coordinate: number[]}>) => this._onSampleEventClick(e)}
      ></bee-sidebar>
    `
  }

  public firstUpdated(_changedProperties: PropertyValues): void {
    const initialParams = parseUrlParams(window.location.search);

    const baseLayer = new LayerGroup();
    this.map = new OpenLayersMap({
      layers: [
        new TileLayer({
          source: new XYZ({
            attributions: 'Base map by Esri and its data providers',
            urls: [
              'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
              'https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
            ]
          }),
        }),
        new TileLayer({
          source: new XYZ({
            // NB: this source is unmaintained
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
          }),
        }),
        baseLayer,
        specimenLayer,
        sampleLayer,
      ],
      target: this.mapElement,
      view: new View({
        center: fromLonLat([initialParams.lon, initialParams.lat]),
        projection: sphericalMercator,
        zoom: initialParams.zoom,
      }),
    });
    sampleLayer.setVisible(false);

    // Restore layer mode from URL (do this directly, not via _onLayerChanged,
    // because _onLayerChanged calls _pushUrlState which needs this.map to be ready)
    if (initialParams.layerMode === 'samples') {
      this.layerMode = 'samples';
      specimenLayer.setVisible(false);
      sampleLayer.setVisible(true);
    }

    // Write initial URL state (covers no-param fresh loads — makes URL bar show params immediately)
    const view = this.map.getView();
    const initCenter = toLonLat(view.getCenter()!);
    const initParams = buildSearchParams(
      initCenter, view.getZoom()!, filterState,
      initialParams.occurrenceIds.length > 0 ? initialParams.occurrenceIds : null,
      initialParams.layerMode
    );
    window.history.replaceState({}, '', '?' + initParams.toString());

    // Restore filter state from URL params (filter singleton + sidebar display)
    if (initialParams.taxonName || initialParams.yearFrom || initialParams.yearTo || initialParams.months.size > 0) {
      filterState.taxonName = initialParams.taxonName;
      filterState.taxonRank = initialParams.taxonRank;
      filterState.yearFrom  = initialParams.yearFrom;
      filterState.yearTo    = initialParams.yearTo;
      filterState.months    = initialParams.months;
      // Mirror to sidebar display fields
      this._restoredTaxonName  = initialParams.taxonName;
      this._restoredTaxonRank  = initialParams.taxonRank;
      this._restoredTaxonInput = initialParams.taxonName ?? '';
      this._restoredYearFrom   = initialParams.yearFrom;
      this._restoredYearTo     = initialParams.yearTo;
      this._restoredMonths     = initialParams.months;
    }

    specimenSource.once('change', () => {
      const features = specimenSource.getFeatures();
      if (features.length > 0) {
        this.summary = computeSummary(features);
        this.taxaOptions = buildTaxaOptions(features);

        // Recompute filteredSummary if filter was restored from URL
        if (isFilterActive(filterState)) {
          const matching = features.filter(f => matchesFilter(f, filterState));
          const fSummary = computeSummary(matching);
          this.filteredSummary = {
            filteredSpecimens: fSummary.totalSpecimens,
            filteredSpeciesCount: fSummary.speciesCount,
            filteredGenusCount: fSummary.genusCount,
            filteredFamilyCount: fSummary.familyCount,
            total: this.summary,
            isActive: true,
          };
          // Now taxaOptions is available — refine _restoredTaxonInput label
          if (this._restoredTaxonName) {
            const opt = this.taxaOptions.find(o => o.name === this._restoredTaxonName && o.rank === this._restoredTaxonRank);
            if (opt) this._restoredTaxonInput = opt.label;
          }
        }

        // Restore selected occurrence (must happen here — data not available until this callback)
        if (initialParams.occurrenceIds.length > 0) {
          this._restoreSelectedOccurrences(initialParams.occurrenceIds);
          // Re-sync URL after occurrence restore (keeps o= param in the URL bar)
          if (this.map) this._pushUrlState();
        }
      }
    });

    sampleSource.once('change', () => {
      this.sampleDataLoaded = true;
      if (this.layerMode === 'samples') {
        this.recentSampleEvents = this._buildRecentSampleEvents();
      }
    });

    loadLinksMap(linksDump).catch(() => new Map<string, number>()).then(map => {
      this._linksMap = map;
    });

    // moveend: replaceState immediately, pushState after 500ms debounce
    this.map.on('moveend', () => {
      if (this._isRestoringFromHistory) return;
      this._pushUrlState();
    });

    // singleclick handler: mode-gated for specimen vs sample layer
    this.map.on('singleclick', async (event: MapBrowserEvent) => {
      if (this.layerMode === 'specimens') {
        const hits = await specimenLayer.getFeatures(event.pixel);
        if (!hits.length) {
          this.selectedSamples = null;
          this._selectedOccIds = null;
          return;
        }
        const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
        const toShow = isFilterActive(filterState) ? inner.filter(f => matchesFilter(f, filterState)) : inner;
        if (toShow.length === 0) return;
        this.selectedSamples = buildSamples(toShow, this._linksMap);
        this._selectedOccIds = toShow.map(f => f.getId() as string);
      } else {
        const hits = await sampleLayer.getFeatures(event.pixel);
        if (!hits.length) {
          this._selectedSampleEvent = null;
          return;
        }
        const f = hits[0]!;
        this._selectedSampleEvent = {
          observation_id: f.get('observation_id') as number,
          observer: f.get('observer') as string,
          date: f.get('date') as string,
          specimen_count: f.get('specimen_count') as number,
          coordinate: (f.getGeometry() as Point).getCoordinates(),
        };
      }
      this._pushUrlState();
    });

    // popstate: restore app state when user navigates back/forward
    window.addEventListener('popstate', this._onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onPopState);
    if (this._mapMoveDebounce) {
      clearTimeout(this._mapMoveDebounce);
      this._mapMoveDebounce = null;
    }
  }
}
