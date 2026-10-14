import type { Severity } from '../types';

export const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#38bdf8',
  warning: '#fbbf24',
  error: '#fb923c',
  critical: '#fb7185',
};

export const SEVERITY_TAILWIND: Record<Severity, string> = {
  info: 'text-sky-400 border-sky-800 bg-sky-950/40',
  warning: 'text-amber-400 border-amber-800 bg-amber-950/40',
  error: 'text-orange-400 border-orange-800 bg-orange-950/40',
  critical: 'text-rose-400 border-rose-800 bg-rose-950/40',
};

const SERVICE_PALETTE: Record<string, string> = {
  api: '#38bdf8',
  db: '#fbbf24',
  worker: '#34d399',
  queue: '#fb7185',
  web: '#a78bfa',
};

export function serviceColor(service: string): string {
  return SERVICE_PALETTE[service] ?? '#94a3b8';
}
