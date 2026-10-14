import { useMemo } from 'react';
import { filterEvents } from '../lib/filters';
import { buildSampleIndex, sampleAt } from '../lib/samples';
import { formatClock, formatTimestamp } from '../lib/format';
import { SEVERITY_TAILWIND, serviceColor } from '../lib/theme';
import { useIncident } from '../lib/store';
import type { MetricSample } from '../types';

const NEARBY_WINDOW = 30;
const NO_SAMPLES: MetricSample[] = [];

export function DetailPanel() {
  const { incident, state, dispatch } = useIncident();

  // Hooks run before any early return.
  const selected = useMemo(() => {
    if (!incident || !state?.selectedEventId) return null;
    return incident.events.find((e) => e.id === state.selectedEventId) ?? null;
  }, [incident, state]);
  const index = useMemo(
    () => buildSampleIndex(incident?.samples ?? NO_SAMPLES),
    [incident?.samples],
  );

  if (!incident || !state) return null;

  if (selected) {
    const entries = Object.entries(selected.metadata ?? {});
    return (
      <section
        className="flex h-full flex-col rounded-md border border-zinc-800 bg-zinc-900/60"
        aria-label="Selected event"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 p-3">
          <h2 className="text-sm font-semibold text-zinc-100">Event detail</h2>
          <button
            type="button"
            onClick={() => dispatch({ type: 'selectEvent', id: null })}
            className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          >
            Close
          </button>
        </div>
        <div className="space-y-3 p-3 text-sm">
          <p className="text-zinc-200">{selected.message}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt className="text-zinc-500">time</dt>
            <dd className="text-zinc-200">
              {formatTimestamp(incident.start, selected.t)} ({formatClock(selected.t)})
            </dd>
            <dt className="text-zinc-500">type</dt>
            <dd className="text-zinc-200">{selected.type}</dd>
            <dt className="text-zinc-500">severity</dt>
            <dd>
              <span className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_TAILWIND[selected.severity]}`}>
                {selected.severity}
              </span>
            </dd>
            <dt className="text-zinc-500">service</dt>
            <dd style={{ color: serviceColor(selected.service) }}>{selected.service}</dd>
            <dt className="text-zinc-500">id</dt>
            <dd className="text-zinc-400">{selected.id}</dd>
          </dl>
          {entries.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Metadata</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-xs">
                {entries.map(([k, v]) => (
                  <span key={k} className="contents">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="text-zinc-200">{String(v)}</dd>
                  </span>
                ))}
              </dl>
            </div>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: 'cursor', sec: selected.t })}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          >
            Center window on this event
          </button>
        </div>
      </section>
    );
  }

  // No selection: show cursor context — nearby events + metric values.
  const nearby = filterEvents(incident.events, {
    services: [],
    types: [],
    severities: [],
  }).filter(
    (e) => Math.abs(e.t - state.cursorSec) <= NEARBY_WINDOW,
  );
  const cursorValues = incident.metrics.flatMap((metric) =>
    incident.services.map((service) => {
      const s = sampleAt(index.get(`${metric}|${service}`), state.cursorSec);
      return s ? { metric, service, value: s.value } : null;
    }),
  ).filter((x): x is { metric: string; service: string; value: number } => x !== null);

  return (
    <section
      className="flex h-full flex-col rounded-md border border-zinc-800 bg-zinc-900/60"
      aria-label="Cursor context"
    >
      <div className="border-b border-zinc-800 p-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Cursor at{' '}
          <span className="font-mono text-sky-300">
            {formatTimestamp(incident.start, state.cursorSec)}
          </span>
          <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
            +{formatClock(state.cursorSec)}
          </span>
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Select an event in the stream or on the timeline for full detail.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Metrics @ cursor
          </h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
            {cursorValues.map(({ metric, service, value }) => (
              <span key={`${metric}|${service}`} className="contents">
                <dt className="text-zinc-500">
                  <span style={{ color: serviceColor(service) }}>{service}</span>
                  <span className="text-zinc-600"> · </span>
                  {metric}
                </dt>
                <dd className="text-zinc-200">{value.toLocaleString()}</dd>
              </span>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Events within ±{NEARBY_WINDOW}s
          </h3>
          {nearby.length === 0 ? (
            <p className="text-xs text-zinc-500">No events near the cursor.</p>
          ) : (
            <ul className="space-y-1">
              {nearby.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'selectEvent', id: e.id });
                      dispatch({ type: 'cursor', sec: e.t });
                    }}
                    className="w-full rounded border border-transparent px-2 py-1 text-left text-xs text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  >
                    <span className="font-mono text-zinc-500">{formatClock(e.t)}</span>{' '}
                    <span className={`font-semibold uppercase ${SEVERITY_TAILWIND[e.severity].split(' ')[0]}`}>
                      {e.severity}
                    </span>{' '}
                    <span className="text-zinc-500">{e.type}</span>
                    <span className="block truncate text-zinc-400">{e.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
