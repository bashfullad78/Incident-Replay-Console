import { describe, expect, it } from 'vitest';
import { downsampleSeries } from '../src/lib/downsample';
import { buildChartRows } from '../src/lib/chartData';

describe('downsampleSeries', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ t: i, value: i * 2 }));

  it('passes short series through unchanged', () => {
    const out = downsampleSeries(points, 240);
    expect(out).toHaveLength(100);
    expect(out[0]).toEqual({ t: 0, value: 0 });
  });

  it('reduces to at most maxPoints plus the final sample', () => {
    const out = downsampleSeries(points, 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out[out.length - 1]).toEqual({ t: 99, value: 198 });
  });

  it('averages values within each bucket', () => {
    const out = downsampleSeries(points, 10);
    // first bucket covers indices 0 to 9 (10 samples, values 0 to 18)
    expect(out[0].value).toBeCloseTo(9, 5);
  });

  it('preserves monotonic timestamps', () => {
    const out = downsampleSeries(points, 7);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].t).toBeGreaterThanOrEqual(out[i - 1].t);
    }
  });
});

describe('buildChartRows', () => {
  const samples = [
    { t: 0, service: 'api', metric: 'latency_p95_ms', value: 10 },
    { t: 1, service: 'api', metric: 'latency_p95_ms', value: 20 },
    { t: 0, service: 'db', metric: 'latency_p95_ms', value: 100 },
    { t: 1, service: 'db', metric: 'latency_p95_ms', value: 200 },
    { t: 0, service: 'api', metric: 'other', value: 999 },
    { t: 50, service: 'api', metric: 'latency_p95_ms', value: 5000 }, // outside window
  ];

  it('aggregates per service within the window, ignoring other metrics', () => {
    const rows = buildChartRows(samples, 'latency_p95_ms', 0, 2, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ t: 0, api: 10, db: 100 });
    expect(rows[1]).toEqual({ t: 1, api: 20, db: 200 });
  });

  it('returns empty rows for inverted or empty windows', () => {
    expect(buildChartRows(samples, 'latency_p95_ms', 5, 1)).toEqual([]);
    expect(buildChartRows(samples, 'latency_p95_ms', 0, 0)).toEqual([]);
  });

  it('excludes samples outside the window', () => {
    const rows = buildChartRows(samples, 'latency_p95_ms', 0, 2, 2);
    for (const row of rows) {
      expect(row.api).toBeLessThan(1000);
      expect(row.db).toBeLessThan(1000);
    }
  });
});
