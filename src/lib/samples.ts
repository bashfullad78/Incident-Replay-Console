import type { MetricSample } from '../types';

const key = (metric: string, service: string): string => `${metric}|${service}`;

export type SampleIndex = Map<string, MetricSample[]>;

/** Group samples into per-(metric, service) series, each sorted by time. */
export function buildSampleIndex(samples: MetricSample[]): SampleIndex {
  const index: SampleIndex = new Map();
  for (const s of samples) {
    const k = key(s.metric, s.service);
    const series = index.get(k);
    if (series) series.push(s);
    else index.set(k, [s]);
  }
  for (const series of index.values()) series.sort((a, b) => a.t - b.t);
  return index;
}

/** Nearest sample at or before `t` in a sorted series (null if none yet). */
export function sampleAt(series: MetricSample[] | undefined, t: number): MetricSample | null {
  if (!series || series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  if (t < series[0].t) return null;
  if (t >= series[hi].t) return series[hi];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return series[lo];
}
