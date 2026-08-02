/**
 * The maplibre-gl stub, in one place.
 *
 * maplibre-gl has module-level side effects happy-dom cannot survive, so every
 * test file that (transitively) imports <bee-map> has to mock it. That stub used
 * to be pasted into three files, which meant a renderer API change edited three
 * copies — and the copies only stayed identical by luck.
 *
 * `vi.mock` factories are hoisted above imports, so a caller cannot close over a
 * value from module scope. It CAN await a dynamic import inside the factory,
 * which is how these are wired up:
 *
 *     vi.mock('maplibre-gl', async () => (await import('./helpers/maplibre-mock.ts')).maplibreMock());
 *
 * Deliberately inert: it models the shape <bee-map> calls, not behaviour. The
 * tests that use it assert on <bee-atlas> state and rendered chrome, and mount an
 * inert <bee-map> stub of their own on top; nothing here should grow logic. If a
 * test needs a map that does something, it wants a real browser (see the run-app
 * skill), not a cleverer fake.
 */
import { vi } from 'vitest';

export function maplibreMock() {
  const MapMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    once: vi.fn(),
    remove: vi.fn(),
    getCenter: vi.fn(() => ({ lng: -120.5, lat: 47.5 })),
    getZoom: vi.fn(() => 7),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => ({
      setData: vi.fn(),
      // Promise-based in MapLibre; the Mapbox signature took a callback.
      getClusterLeaves: vi.fn(async () => []),
    })),
    setFilter: vi.fn(),
    setStyle: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    resize: vi.fn(),
    // No addInteraction — MapLibre has no such API. The click priority chain is
    // one map.on('click') walking queryRenderedFeatures layer by layer, so these
    // two stand in for the five Mapbox interaction handlers.
    getLayer: vi.fn(() => undefined),
    queryRenderedFeatures: vi.fn(() => []),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    querySourceFeatures: vi.fn(() => []),
    addControl: vi.fn(),
  }));

  // Named exports, not a default: maplibre-gl is ESM-only with no default export,
  // and <bee-map> imports it as a namespace.
  return {
    Map: MapMock,
    GeolocateControl: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      trigger: vi.fn(() => true),
    })),
    Point: class {
      x: number;
      y: number;
      constructor(x: number, y: number) { this.x = x; this.y = y; }
    },
    addProtocol: vi.fn(),
    setWorkerUrl: vi.fn(),
  };
}
