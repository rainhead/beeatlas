 import { asyncBufferFromUrl, parquetQuery } from "hyparquet";
import { Feature } from "ol";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import { fromLonLat } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";
import Circle from 'ol/style/Circle.js';
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";

const black = '#000000';
const yellow = '#ffff00';
const transparentWhite = 'rgba(255, 255, 255, 0.4)';
const solidBlue = '#3399CC';
const fill = new Fill({color: transparentWhite});
const stroke = new Stroke({color: solidBlue, width: 1.25});
const style = new Style({
  image: new Circle({
    radius: 2,
    fill,
    stroke,
  }),
  fill,
  stroke,
});

export async function makeParquetLayer(url: string) {
  const buffer = await asyncBufferFromUrl({url});
  const objects = await parquetQuery({
    columns: ['decimalLongitude', 'decimalLatitude', 'gbifID', 'species'],
    file: buffer,
    filter: {species: 'Bombus occidentalis'},
  });
  const features = objects.map(obj => new Feature({
    geometry: new Point(fromLonLat([obj.decimalLongitude, obj.decimalLatitude])),
    id: obj.gbifID,
    properties: {species: obj.species},
  }));
  return new VectorLayer({
    source: new VectorSource({features}),
    style,
  });
}
