import { EVENT_TYPES, SEVERITIES, type EventType, type Severity } from '../types';

export interface Filters {
  services: string[];
  types: EventType[];
  severities: Severity[];
}

/**
 * The investigation view. `durationSec` is runtime-only state.
*/
export interface ViewState {
  incidentId: string;
  durationSec: number;
  cursorSec: number;
  windowStartSec: number;
  windowEndSec: number;
  selectedEventId: string | null;
  filters: Filters;
}

export const MIN_WINDOW_SEC = 10;

const INCIDENT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SERVICE_RE = /^[a-z0-9][a-z0-9_-]*$/;
const NUMBER_RE = /^\d+(?:\.\d+)?$/;
// Compose from an unanchored pattern: NUMBER_RE.source carries its own
// ^...$ anchors, so re embedding it would produce a never matching regex.
const WINDOW_RE = /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/;

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export function initViewState(incidentId: string, durationSec: number): ViewState {
  return {
    incidentId,
    durationSec,
    cursorSec: 0,
    windowStartSec: 0,
    windowEndSec: durationSec,
    selectedEventId: null,
    filters: { services: [], types: [], severities: [] },
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Serialize view state to a URL query string (no leading "?"). */
export function encodeViewState(state: ViewState): string {
  const p = new URLSearchParams();
  p.set('i', state.incidentId);
  p.set('c', String(Math.round(state.cursorSec)));
  p.set(
    'w',
    `${Math.round(state.windowStartSec)},${Math.round(state.windowEndSec)}`,
  );
  if (state.selectedEventId) p.set('e', state.selectedEventId);
  if (state.filters.services.length) p.set('se', state.filters.services.join(','));
  if (state.filters.types.length) p.set('ty', state.filters.types.join(','));
  if (state.filters.severities.length) p.set('sv', state.filters.severities.join(','));
  return p.toString();
}

function parseEnumList<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const token of raw.split(',')) {
    if ((allowed as readonly string[]).includes(token) && !out.includes(token as T)) {
      out.push(token as T);
    }
  }
  return out;
}

function parseServiceList(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const token of raw.split(',')) {
    if (SERVICE_RE.test(token) && !out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * Parse query string into a ViewState. Junk values ignored; numeric state
 * is camped to the incident duration supplied by the caller (the fixture is loaded before decoding in app, so bounds are always known).
 */
export function decodeViewState(
  query: string,
  opts: { defaultIncidentId: string; durationSec: number },
): ViewState {
  const state = initViewState(opts.defaultIncidentId, opts.durationSec);
  const p = new URLSearchParams(query);

  const incidentId = p.get('i');
  if (incidentId && INCIDENT_ID_RE.test(incidentId)) state.incidentId = incidentId;

  const cursor = p.get('c');
  if (cursor && NUMBER_RE.test(cursor)) {
    state.cursorSec = clamp(Number(cursor), 0, opts.durationSec);
  }

  const window = p.get('w');
  if (window) {
    const m = window.match(WINDOW_RE);
    if (m) {
      const start = Number(m[1]);
      const end = Number(m[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const width = Math.max(
          Math.min(end - start, opts.durationSec),
          MIN_WINDOW_SEC,
        );
        const s = clamp(start, 0, opts.durationSec - width);
        state.windowStartSec = s;
        state.windowEndSec = s + width;
      }
    }
  }

  const eventId = p.get('e');
  if (eventId) state.selectedEventId = eventId.slice(0, 128);

  state.filters.services = parseServiceList(p.get('se'));
  state.filters.types = parseEnumList(p.get('ty'), EVENT_TYPES);
  state.filters.severities = parseEnumList(p.get('sv'), SEVERITIES);

  return state;
}

export { toggle };
