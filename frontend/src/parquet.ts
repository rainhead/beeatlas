import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
import { Feature } from "ol";
import type { Extent } from "ol/extent.js";
import Point from "ol/geom/Point.js";
import { fromLonLat, Projection } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';

const linkColumns = ['occurrenceID', 'inat_observation_id'];

export async function loadLinksMap(url: string): Promise<Map<string, number>> {
  const buffer = await asyncBufferFromUrl({ url });
  const objects = await parquetReadObjects({ columns: linkColumns, file: buffer });
  const map = new Map<string, number>();
  for (const obj of objects) {
    if (obj.occurrenceID != null && obj.inat_observation_id != null) {
      map.set(obj.occurrenceID as string, Number(obj.inat_observation_id));  // BigInt coercion
    }
  }
  return map;
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
];

export class ParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrl({url})
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
            });
            return feature;
          })
          console.debug(`Adding ${features.length} features from ${url}`);
          this.addFeatures(features);
          if (success)
            success(features);
        })
        .catch(failure);
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
];

export class SampleParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns: sampleColumns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.lat == null || obj.lon == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.lon, obj.lat])));
            feature.setId(`inat:${Number(obj.observation_id)}`);
            feature.setProperties({
              observation_id: Number(obj.observation_id),
              observer: obj.observer,
              date: obj.date,
              specimen_count: Number(obj.specimen_count),
            });
            return feature;
          });
          console.debug(`Adding ${features.length} features from ${url}`);
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch(failure);
    };
    super({loader: load, strategy: all});
  }
}
