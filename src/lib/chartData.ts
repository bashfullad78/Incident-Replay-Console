import type { MetricSample } from '../types';

export interface ChartRow {
  t: number;
  [service: string]: number;
}

/**
 * Aggregate samples of one metric into at most `maxPoints` time buckets within
 * [start, end), averaging per service. Output rows are sorted by time and
 * contain one numeric column per servoce that reported the metric.
 */
export function buildChartRows(
  samples: readonly MetricSample[],
  metric: string,
  start: number,
  end: number,
  maxPoints = 240,
): ChartRow[] {
  if (end <= start || maxPoints < 1) return [];
  const bucketSec = (end - start) / maxPoints;
  const buckets = new Map<number, Map<string, { sum: number; n: number }>>();

  for (const s of samples) {
    if (s.metric !== metric || s.t < start || s.t > end) continue;
    const bi = Math.min(maxPoints - 1, Math.floor((s.t - start) / bucketSec));
    let bucket = buckets.get(bi);
    if (!bucket) {
      bucket = new Map();
      buckets.set(bi, bucket);
    }
    const agg = bucket.get(s.service) ?? { sum: 0, n: 0 };
    agg.sum += s.value;
    agg.n += 1;
    bucket.set(s.service, agg);
  }

  const rows: ChartRow[] = [];
  for (const [bi, services] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const row: ChartRow = { t: Math.round((start + bi * bucketSec) * 1000) / 1000 };
    for (const [service, agg] of services) {
      row[service] = Math.round((agg.sum / agg.n) * 1000) / 1000;
    }
    rows.push(row);
  }
  return rows;
}
