 import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
import { Feature } from "ol";
import type { Extent } from "ol/extent.js";
import Point from "ol/geom/Point.js";
import { fromLonLat, Projection } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';

const columns = [
  'fieldNumber',
  'dateLabelPrint',
  'decimalLongitude',
  'decimalLatitude',
];

export class ParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns, file: buffer}))
        .then(objects => {
          const features = objects.map(obj => {
            const feature = new Feature(new Point(fromLonLat([obj.decimalLongitude, obj.decimalLatitude], projection)));
            feature.setId(`osu:${obj.fieldNumber}`);
            feature.setProperties(obj);
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
