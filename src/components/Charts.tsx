import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricSample } from '../types';
import { buildChartRows } from '../lib/chartData';
import { buildSampleIndex, sampleAt } from '../lib/samples';
import { serviceColor } from '../lib/theme';
import { formatClock, formatTimestamp } from '../lib/format';
import { useIncident } from '../lib/store';

function MetricChart({
  metric,
  samples,
  start,
  end,
  cursor,
  incidentStart,
}: {
  metric: string;
  samples: MetricSample[];
  start: number;
  end: number;
  cursor: number;
  incidentStart: string;
}) {
  const rows = useMemo(
    () => buildChartRows(samples, metric, start, end, 240),
    [samples, metric, start, end],
  );
  const services = useMemo(
    () => [...new Set(samples.filter((s) => s.metric === metric).map((s) => s.service))],
    [samples, metric],
  );

  // Current value at the cursor, per service.
  const index = useMemo(() => buildSampleIndex(samples), [samples]);
  const atCursor = services.map((service) => {
    const s = sampleAt(index.get(`${metric}|${service}`), cursor);
    return { service, value: s ? s.value : null };
  });

  return (
    <section
      className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
      aria-label={`${metric} chart`}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="font-mono text-sm font-medium text-zinc-200">{metric}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
          {atCursor.map(({ service, value }) => (
            <span key={service} style={{ color: serviceColor(service) }}>
              {service}: {value === null ? '—' : value.toLocaleString()}
              <span className="text-zinc-500"> @{formatClock(cursor)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[start, end]}
              tickFormatter={(t: number) => formatClock(t)}
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              tickCount={6}
              stroke="#3f3f46"
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              tickCount={5}
              width={52}
              stroke="#3f3f46"
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-200">
                    <div className="text-zinc-500">{formatTimestamp(incidentStart, label as number)}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} style={{ color: serviceColor(String(p.dataKey)) }}>
                        {String(p.dataKey)}: {Number(p.value).toLocaleString()}
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <ReferenceLine
              x={cursor}
              stroke="#e4e4e7"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {services.map((service) => (
              <Area
                key={service}
                type="monotone"
                dataKey={service}
                stroke={serviceColor(service)}
                strokeWidth={1.5}
                fill={serviceColor(service)}
                fillOpacity={0.12}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function Charts() {
  const { incident, state } = useIncident();
  if (!incident || !state) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {incident.metrics.map((metric) => (
        <MetricChart
          key={metric}
          metric={metric}
          samples={incident.samples}
          start={state.windowStartSec}
          end={state.windowEndSec}
          cursor={state.cursorSec}
          incidentStart={incident.start}
        />
      ))}
    </div>
  );
}
