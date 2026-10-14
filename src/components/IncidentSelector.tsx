import { formatClock, formatDate } from '../lib/format';
import { useIncident } from '../lib/store';

export function IncidentSelector() {
  const { metas, incident, selectIncident } = useIncident();

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Incident
        </span>
        <select
          value={incident?.id ?? ''}
          onChange={(e) => selectIncident(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          aria-label="Select incident"
        >
          {metas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      {incident && (
        <dl className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Started</dt>
            <dd className="font-mono text-zinc-200">{formatDate(incident.start)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Duration</dt>
            <dd className="font-mono text-zinc-200">{formatClock(incident.durationSec)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Services</dt>
            <dd className="font-mono text-zinc-200">{incident.services.join(', ')}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Evidence</dt>
            <dd className="font-mono text-zinc-200">
              {incident.events.length} events · {incident.samples.length.toLocaleString()} samples
            </dd>
          </div>
        </dl>
      )}
      {incident && (
        <p className="max-w-2xl text-sm text-zinc-400">{incident.summary}</p>
      )}
    </div>
  );
}
