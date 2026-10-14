export interface DataPoint {
  t: number;
  value: number;
}

/**
 * Reduce a sorted series to at most `maxPoints` bucket averages.
 * Bucket boundaries are indices based and evenly spaced, first
 * sample of each bucket supplies the timestsmp, and the final sample is 
 * appended to avoid loss of most recent value.
 */
export function downsampleSeries(points: readonly DataPoint[], maxPoints: number): DataPoint[] {
  if (points.length <= maxPoints) return points.map((p) => ({ ...p }));
  if (maxPoints < 1) throw new Error('maxPoints must be >= 1');

  const bucket = points.length / maxPoints;
  const out: DataPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.min(points.length, Math.max(start + 1, Math.floor((i + 1) * bucket)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += points[j].value;
    out.push({ t: points[start].t, value: sum / (end - start) });
  }
  const last = points[points.length - 1];
  if (out[out.length - 1].t !== last.t) out.push({ t: last.t, value: last.value });
  return out;
}
