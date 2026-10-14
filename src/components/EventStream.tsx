import { useMemo } from 'react';
import { EVENT_TYPES, SEVERITIES, type EventType, type IncidentEvent, type Severity } from '../types';
import { filterEvents } from '../lib/filters';
import { formatClock, formatTimestamp } from '../lib/format';
import { SEVERITY_TAILWIND } from '../lib/theme';
import { useIncident } from '../lib/store';
import type { Filters } from '../lib/urlState';

const MAX_ROWS = 400;
const NO_FILTERS: Filters = { services: [], types: [], severities: [] };
const NO_EVENTS: IncidentEvent[] = [];

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
        active
          ? 'border-sky-600 bg-sky-950 text-sky-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

export function EventStream() {
  const { incident, state, dispatch } = useIncident();
  // Hooks must run before the loading early-return below.
  const events = incident?.events ?? NO_EVENTS;
  const filters = state?.filters ?? NO_FILTERS;
  const filtered = useMemo(() => filterEvents(events, filters), [events, filters]);
  const visible = filtered.slice(0, MAX_ROWS);
  const filtersActive =
    filters.services.length > 0 || filters.types.length > 0 || filters.severities.length > 0;

  const presentTypes = useMemo(
    () => EVENT_TYPES.filter((t) => events.some((e) => e.type === t)),
    [events],
  );
  const presentSeverities = useMemo(
    () => SEVERITIES.filter((s) => events.some((e) => e.severity === s)),
    [events],
  );

  const select = (id: string, t: number) => {
    dispatch({ type: 'selectEvent', id });
    dispatch({ type: 'cursor', sec: t });
  };

  if (!incident || !state) return null;
  const { services } = incident;

  return (
    <section className="flex h-full flex-col rounded-md border border-zinc-800 bg-zinc-900/60" aria-label="Event stream">
      <div className="space-y-2 border-b border-zinc-800 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Service</span>
          {services.map((s) => (
            <Chip key={s} active={filters.services.includes(s)} onClick={() => dispatch({ type: 'toggleService', value: s })}>
              {s}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Type</span>
          {presentTypes.map((t: EventType) => (
            <Chip key={t} active={filters.types.includes(t)} onClick={() => dispatch({ type: 'toggleType', value: t })}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Severity</span>
          {presentSeverities.map((s: Severity) => (
            <Chip key={s} active={filters.severities.includes(s)} onClick={() => dispatch({ type: 'toggleSeverity', value: s })}>
              {s}
            </Chip>
          ))}
          {filtersActive && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'clearFilters' })}
              className="ml-1 text-xs text-sky-400 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Filtered events">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            <p>No events match the current filters.</p>
            {filtersActive && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'clearFilters' })}
                className="mt-2 text-sky-400 underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          visible.map((e) => {
            const selected = state.selectedEventId === e.id;
            return (
              <button
                key={e.id}
                type="button"
                role="listitem"
                onClick={() => select(e.id, e.t)}
                aria-current={selected ? 'true' : undefined}
                className={`block w-full border-b border-zinc-800/60 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:bg-zinc-800 ${
                  selected ? 'bg-zinc-800/90' : 'hover:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">
                    {formatClock(e.t)}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_TAILWIND[e.severity]}`}
                  >
                    {e.severity}
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-px font-mono text-[10px] text-zinc-400">
                    {e.type}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">{e.service}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-300">{e.message}</p>
              </button>
            );
          })
        )}
        {filtered.length > MAX_ROWS && (
          <p className="p-3 text-center font-mono text-xs text-zinc-500">
            Showing {MAX_ROWS} of {filtered.length} matching events
          </p>
        )}
      </div>

      <div className="border-t border-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-500">
        {filtered.length} event{filtered.length === 1 ? '' : 's'} · window{' '}
        {formatTimestamp(incident.start, state.windowStartSec)} –{' '}
        {formatTimestamp(incident.start, state.windowEndSec)}
      </div>
    </section>
  );
}
