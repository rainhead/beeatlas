export const RECENCY_COLORS = {
  fresh:    '#2ecc71',  // within 6 weeks
  thisYear: '#f39c12',  // this year, older than 6 weeks
  older:    '#7f8c8d',  // before this year
} as const;

const _now = new Date();
const _sixWeeksAgoMs = _now.getTime() - 6 * 7 * 86_400_000;
const _thisYear = _now.getFullYear();

export function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  if (new Date(year, month - 1, 1).getTime() >= _sixWeeksAgoMs) return 'fresh';
  if (year >= _thisYear) return 'thisYear';
  return 'older';
}
