// Type declarations for .geojson file imports via Vite's JSON import handling.
// Vite treats .geojson as JSON; TypeScript needs this declaration to resolve the module.
declare module '*.geojson' {
  import type { FeatureCollection } from 'geojson';
  const value: FeatureCollection;
  export default value;
}
