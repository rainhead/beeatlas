
import type RenderFeature from 'ol/render/Feature.js';
import Circle from 'ol/style/Circle.js';
// import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";

const stroke = new Stroke({color: 'rgba(64, 0, 255, 0.2)', width: 1});
export const beeStyle = new Style({
  image: new Circle({
    radius: 2,
    stroke,
  }),
});

export const clusterStyle = (feature: RenderFeature) => {
  const features = feature.get('features');
  const radius = features ? Math.log(features.length) : 2;
  return new Style({
    image: new Circle({
      radius,
      stroke,
    }),
    stroke,
  })
}
