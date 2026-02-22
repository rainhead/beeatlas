import { Feature } from 'ol';
import type { FeatureLike } from 'ol/Feature.js';
import Circle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import { Temporal } from 'temporal-polyfill';
import { filterState, isFilterActive, matchesFilter } from './filter.ts';

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

/** Convert a 6-char hex color + opacity to rgba() string */
function hexWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const styleCache = new Map<string, Style>();

export function clusterStyle(feature: FeatureLike): Style {
  const innerFeatures: Feature[] = (feature.get('features') as Feature[] | undefined) ?? [feature as Feature];
  const active = isFilterActive(filterState);

  let bestTier: keyof typeof RECENCY_COLORS = 'older';
  let matchCount = 0;

  for (const f of innerFeatures) {
    const tier = recencyTier(f.get('year') as number, f.get('month') as number);
    if (tier === 'fresh') bestTier = 'fresh';
    else if (tier === 'thisYear' && bestTier === 'older') bestTier = 'thisYear';
    if (!active || matchesFilter(f, filterState)) matchCount++;
  }

  const isGhosted = active && matchCount === 0;
  const displayCount = active ? matchCount : innerFeatures.length;

  // Skip cache when filter active — same count:tier pair can have different match counts
  const cacheKey = active ? null : `${displayCount}:${bestTier}`;
  if (cacheKey && styleCache.has(cacheKey)) return styleCache.get(cacheKey)!;

  const fillColor = isGhosted ? hexWithOpacity('#aaaaaa', 0.2) : hexWithOpacity(RECENCY_COLORS[bestTier], 1.0);
  const strokeColor = isGhosted ? 'rgba(255,255,255,0.2)' : '#ffffff';
  const radius = displayCount <= 1 ? 4 : 6 + Math.log2(Math.max(displayCount, 1)) * 2;

  const style = new Style({
    image: new Circle({
      radius,
      fill: new Fill({ color: fillColor }),
      stroke: new Stroke({ color: strokeColor, width: 1 }),
    }),
    text: isGhosted ? undefined : new Text({
      text: String(displayCount),
      fill: new Fill({ color: '#fff' }),
      font: 'bold 11px sans-serif',
    }),
  });

  if (cacheKey) styleCache.set(cacheKey, style);
  return style;
}
