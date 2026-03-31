import { getDuckDB, tablesReady } from './duckdb.ts';
import { Feature } from "ol";
import Point from "ol/geom/Point.js";
import { fromLonLat } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';
import type { Extent } from "ol/extent.js";
import type { Projection } from "ol/proj.js";

export class EcdysisSource extends VectorSource {
  constructor({ onError }: { onError?: (err: Error) => void } = {}) {
    const load = async (_extent: Extent, _resolution: number, _projection: Projection, success: any, failure: any) => {
      let conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDuckDB>>['connect']>> | null = null;
      try {
        await tablesReady;
        const db = await getDuckDB();
        conn = await db.connect();
        const table = await conn.query(`
          SELECT ecdysis_id, occurrenceID, longitude, latitude, year, month,
                 scientificName, recordedBy, fieldNumber, genus, family,
                 floralHost, county, ecoregion_l3, inat_observation_id
          FROM ecdysis
        `);
        const features = table.toArray().flatMap(row => {
          const obj = row.toJSON();
          if (obj.longitude == null || obj.latitude == null) return [];
          const feature = new Feature();
          feature.setGeometry(new Point(fromLonLat([obj.longitude, obj.latitude])));
          feature.setId(`ecdysis:${obj.ecdysis_id}`);
          feature.setProperties({
            occurrenceID: obj.occurrenceID,
            year: Number(obj.year),
            month: Number(obj.month),
            scientificName: obj.scientificName,
            recordedBy: obj.recordedBy,
            fieldNumber: obj.fieldNumber,
            genus: obj.genus,
            family: obj.family,
            floralHost: obj.floralHost ?? null,
            county: obj.county ?? null,
            ecoregion_l3: obj.ecoregion_l3 ?? null,
            inat_observation_id: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null,
          });
          return feature;
        });
        console.debug(`Adding ${features.length} ecdysis features from DuckDB`);
        this.addFeatures(features);
        if (success) success(features);
      } catch (err: unknown) {
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        failure();
      } finally {
        if (conn) await conn.close();
      }
    };
    super({ loader: load, strategy: all });
  }
}

export class SampleSource extends VectorSource {
  constructor({ onError }: { onError?: (err: Error) => void } = {}) {
    const load = async (_extent: Extent, _resolution: number, _projection: Projection, success: any, failure: any) => {
      let conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDuckDB>>['connect']>> | null = null;
      try {
        await tablesReady;
        const db = await getDuckDB();
        conn = await db.connect();
        const table = await conn.query(`
          SELECT observation_id, observer, date, lat, lon,
                 specimen_count, sample_id, county, ecoregion_l3
          FROM samples
        `);
        const features = table.toArray().flatMap(row => {
          const obj = row.toJSON();
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
            county: obj.county ?? null,
            ecoregion_l3: obj.ecoregion_l3 ?? null,
          });
          return feature;
        });
        console.debug(`Adding ${features.length} sample features from DuckDB`);
        this.addFeatures(features);
        if (success) success(features);
      } catch (err: unknown) {
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        failure();
      } finally {
        if (conn) await conn.close();
      }
    };
    super({ loader: load, strategy: all });
  }
}
