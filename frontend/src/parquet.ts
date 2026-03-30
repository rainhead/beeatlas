import { parquetReadObjects } from "hyparquet";
import { Feature } from "ol";
import type { Extent } from "ol/extent.js";
import Point from "ol/geom/Point.js";
import { fromLonLat, Projection } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';

async function asyncBufferFromUrlEager(url: string) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return {
    byteLength: arrayBuffer.byteLength,
    slice: async (start: number, end?: number) => arrayBuffer.slice(start, end),
  };
}

const columns = [
  'ecdysis_id',
  'occurrenceID',
  'longitude',
  'latitude',
  'year',
  'month',
  'scientificName',
  'recordedBy',
  'fieldNumber',
  'genus',
  'family',
  'floralHost',
  'county',
  'ecoregion_l3',
  'inat_observation_id',
];

export class ParquetSource extends VectorSource {
  constructor({url, onError}: {url: string, onError?: (err: Error) => void}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrlEager(url)
        .then(buffer => parquetReadObjects({columns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.longitude == null || obj.latitude == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.longitude, obj.latitude])))
            feature.setId(`ecdysis:${obj.ecdysis_id}`);
            feature.setProperties({
              occurrenceID: obj.occurrenceID,
              year: Number(obj.year),
              month: Number(obj.month),       // DarwinCore months are 1-indexed (1=January, 12=December)
              scientificName: obj.scientificName,
              recordedBy: obj.recordedBy,
              fieldNumber: obj.fieldNumber,
              genus: obj.genus,
              family: obj.family,
              floralHost: obj.floralHost ?? null,
              county: obj.county as string ?? null,
              ecoregion_l3: obj.ecoregion_l3 as string ?? null,
              inat_observation_id: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null,
            });
            return feature;
          })
          console.debug(`Adding ${features.length} features from ${url}`);
          this.addFeatures(features);
          if (success)
            success(features);
        })
        .catch((err: Error) => {
          if (onError) onError(err);
          failure();
        });
    }
    super({loader: load, strategy: all});
  }
}

const sampleColumns = [
  'observation_id',
  'observer',
  'date',
  'lat',
  'lon',
  'specimen_count',
  'sample_id',
  'county',
  'ecoregion_l3',
];

export class SampleParquetSource extends VectorSource {
  constructor({url, onError}: {url: string, onError?: (err: Error) => void}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrlEager(url)
        .then(buffer => parquetReadObjects({columns: sampleColumns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.lat == null || obj.lon == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.lon, obj.lat])));
            feature.setId(`inat:${Number(obj.observation_id)}`);
            const d = new Date(obj.date);
            feature.setProperties({
              observation_id: Number(obj.observation_id),
              observer: obj.observer,
              date: obj.date,
              year: d.getUTCFullYear(),
              month: d.getUTCMonth() + 1,
              specimen_count: Number(obj.specimen_count),
              sample_id: obj.sample_id != null ? Number(obj.sample_id) : null,
              county: obj.county as string ?? null,
              ecoregion_l3: obj.ecoregion_l3 as string ?? null,
            });
            return feature;
          });
          console.debug(`Adding ${features.length} features from ${url}`);
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch((err: Error) => {
          if (onError) onError(err);
          failure();
        });
    };
    super({loader: load, strategy: all});
  }
}
