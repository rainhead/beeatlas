 import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
import { Feature } from "ol";
import type { Extent } from "ol/extent.js";
import Point from "ol/geom/Point.js";
import { fromLonLat, Projection } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';

const columns = [
  'catalogNumber',
  'coordinateUncertaintyInMeters',
  'decimalLongitude',
  'decimalLatitude',
  'elevation',
  'family',
  'genus',
  'gbifID',
  'infraspecificEpithet',
  'references',
  'species',
  'taxonKey',
];

export type GBIFProperties = {
  catalogNumber: string | null;
  coordinateUncertaintyInMeters: number;
  elevation: number | null;
  family: string;
  genus: string;
  infraspecificEpithet: string | null;
  references: string | null;
  species: string | null; // scientificName
  taxonKey: number; // gbif taxon id
};

// const filterExtent = (extent: Extent) => {
//   const [minx, miny, maxx, maxy] = extent;
//   const filter: ParquetQueryFilter = {
//     decimalLongitude: [{$and: [
//       {decimalLongitude: {$gte: minx}},
//       {decimalLongitude: {$lte: maxx}},
//       {decimalLatitude: {$gte: miny}},
//       {decimalLatitude: {$lte: maxy}},
//     ]}]
//   };
//   return filter;
// }

export class ParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns, file: buffer}))
        .then(objects => {
          const features = objects.map(obj => new Feature({
            geometry: new Point(fromLonLat([obj.decimalLongitude, obj.decimalLatitude])),
            id: `gbif:${obj.gbifID}`,
            properties: obj,
          }));
          this.addFeatures(features);
          if (success)
            success(features);
        })
        .catch(failure);
    }
    super({loader: load, strategy: all});
  }
}
