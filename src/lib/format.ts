const pad = (n: number): string => String(n).padStart(2, '0');

/** Format a "seconds since start" offset as mm:ss (h:mm:ss for long incidents). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/** Format an offset as a clock time using the incident start. */
export function formatTimestamp(isoStart: string, offsetSec: number): string {
  const start = new Date(isoStart);
  if (Number.isNaN(start.getTime())) return '--:--:--';
  const d = new Date(start.getTime() + offsetSec * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Format an ISO start string as a human date. */
export function formatDate(isoStart: string): string {
  const d = new Date(isoStart);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
