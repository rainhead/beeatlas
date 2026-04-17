import { getDB, tablesReady } from './sqlite.ts';
import { Feature } from "ol";
import Point from "ol/geom/Point.js";
import { fromLonLat } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';
import type { Extent } from "ol/extent.js";
import type { Projection } from "ol/proj.js";

export class OccurrenceSource extends VectorSource {
  constructor({ onError }: { onError?: (err: Error) => void } = {}) {
    const load = async (_extent: Extent, _resolution: number, _projection: Projection, success: any, failure: any) => {
      try {
        await tablesReady;
        const { sqlite3, db } = await getDB();
        const rows: Record<string, unknown>[] = [];
        await sqlite3.exec(db, `SELECT * FROM occurrences`, (rowValues: unknown[], columnNames: string[]) => {
          const obj: Record<string, unknown> = {};
          columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
          rows.push(obj);
        });
        const features = rows.flatMap(obj => {
          if (obj.lat == null || obj.lon == null) return [];
          const feature = new Feature();
          feature.setGeometry(new Point(fromLonLat([Number(obj.lon), Number(obj.lat)])));
          if (obj.ecdysis_id != null) {
            feature.setId('ecdysis:' + obj.ecdysis_id);
          } else {
            feature.setId('inat:' + Number(obj.observation_id));
          }
          const props: Record<string, unknown> = {};
          for (const col of Object.keys(obj)) {
            props[col] = obj[col] ?? null;
          }
          feature.setProperties(props);
          return feature;
        });
        console.debug(`Adding ${features.length} occurrence features from SQLite`);
        this.addFeatures(features);
        if (success) success(features);
      } catch (err: unknown) {
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        failure();
      }
    };
    super({ loader: load, strategy: all });
  }
}
