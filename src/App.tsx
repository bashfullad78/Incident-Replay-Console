import { useState } from 'react';
import { IncidentProvider, useIncident } from './lib/store';
import { IncidentSelector } from './components/IncidentSelector';
import { Timeline } from './components/Timeline';
import { Charts } from './components/Charts';
import { EventStream } from './components/EventStream';
import { DetailPanel } from './components/DetailPanel';

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (like insecure context) */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
      aria-live="polite"
    >
      {copied ? 'Link copied' : 'Copy link to this view'}
    </button>
  );
}

function LoadingState() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6" aria-busy="true" aria-label="Loading incident">
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-64 rounded bg-zinc-800" />
        <div className="h-36 w-full rounded bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-56 rounded bg-zinc-800" />
          <div className="h-56 rounded bg-zinc-800" />
        </div>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16" role="alert">
      <h1 className="text-lg font-semibold text-rose-400">Failed to load incident data</h1>
      <p className="mt-2 rounded border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
        {message}
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        The fixture may be missing or malformed. Fixtures are files bundled with the
        app; check that <code className="font-mono">incidents</code> is present.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
      >
        Retry
      </button>
    </main>
  );
}

function Shell() {
  const { status, error, incident, selectIncident } = useIncident();

  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={() => selectIncident(incident?.id ?? '')} />;
  }
  if (status === 'loading') return <LoadingState />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-50">
              Incident Replay Console
            </h1>
            <p className="text-xs text-zinc-500">
              Reconstruct the outage: scrub, correlate, filter, share.
            </p>
          </div>
          <ShareButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <IncidentSelector />
        <section className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3" aria-label="Timeline">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Timeline
          </h2>
          <Timeline />
        </section>
        <Charts />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-[560px] lg:col-span-2">
            <EventStream />
          </div>
          <div className="h-[560px]">
            <DetailPanel />
          </div>
        </div>
        <footer className="pb-6 pt-2 text-xs text-zinc-600">
          Simulated telemetry from deterministic fixtures. Disclaimere: Not real systems.
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <IncidentProvider>
      <Shell />
    </IncidentProvider>
  );
}
