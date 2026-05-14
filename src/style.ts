export const RECENCY_COLORS = {
  thisYear: '#2ecc71',
  lastYear: '#f39c12',
  earlier:  '#7f8c8d',
} as const;

const _thisYear = new Date().getFullYear();
const _lastYear = _thisYear - 1;

export function recencyTier(year: number, _month: number): keyof typeof RECENCY_COLORS {
  if (year >= _thisYear) return 'thisYear';
  if (year >= _lastYear) return 'lastYear';
  return 'earlier';
}
