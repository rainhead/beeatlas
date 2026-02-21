import { Feature } from 'ol';
import type { FeatureLike } from 'ol/Feature.js';
import Circle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import { Temporal } from 'temporal-polyfill';

export const RECENCY_COLORS = {
  fresh:    '#2ecc71',  // within 6 weeks
  thisYear: '#f39c12',  // this year, older than 6 weeks
  older:    '#7f8c8d',  // before this year
} as const;

const today = Temporal.Now.plainDateISO();
const sixWeeksAgo = today.subtract({ weeks: 6 });

function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  const sampleDate = Temporal.PlainDate.from({ year, month, day: 1 });
  if (Temporal.PlainDate.compare(sampleDate, sixWeeksAgo) >= 0) return 'fresh';
  if (year >= today.year) return 'thisYear';
  return 'older';
}

const styleCache = new Map<string, Style>();

export function clusterStyle(feature: FeatureLike): Style {
  const innerFeatures: Feature[] = (feature.get('features') as Feature[] | undefined) ?? [feature as Feature];
  const count = innerFeatures.length;

  // Find the most-recent tier across all inner features
  let bestTier: keyof typeof RECENCY_COLORS = 'older';
  for (const f of innerFeatures) {
    const tier = recencyTier(f.get('year') as number, f.get('month') as number);
    if (tier === 'fresh') { bestTier = 'fresh'; break; }
    if (tier === 'thisYear') bestTier = 'thisYear';
  }

  const cacheKey = `${count}:${bestTier}`;
  if (styleCache.has(cacheKey)) return styleCache.get(cacheKey)!;

  const radius = count === 1 ? 4 : 6 + Math.log2(count) * 2;
  const color = RECENCY_COLORS[bestTier];

  const style = new Style({
    image: new Circle({
      radius,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 1 }),
    }),
    text: new Text({
      text: String(count),
      fill: new Fill({ color: '#fff' }),
      font: 'bold 11px sans-serif',
    }),
  });
  styleCache.set(cacheKey, style);
  return style;
}
