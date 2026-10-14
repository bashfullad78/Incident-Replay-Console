import { describe, expect, it } from 'vitest';
import { reducer } from '../src/lib/store';
import { initViewState } from '../src/lib/urlState';
import type { Incident } from '../src/types';

const incident = (durationSec: number, id = 'inc-a'): Incident => ({
  id,
  title: 'Test incident',
  summary: 'test',
  start: '2026-10-04T14:00:00Z',
  durationSec,
  services: ['api'],
  metrics: ['latency_p95_ms'],
  samples: [],
  events: [],
});

describe('reducer', () => {
  it('resets the view when a new incident is selected', () => {
    const s = reducer(initViewState('inc-a', 100), {
      type: 'incident',
      incident: incident(500, 'inc-b'),
    });
    expect(s.incidentId).toBe('inc-b');
    expect(s.durationSec).toBe(500);
    expect(s.windowEndSec).toBe(500);
    expect(s.cursorSec).toBe(0);
    expect(s.selectedEventId).toBeNull();
    expect(s.filters.services).toEqual([]);
  });

  it('clamps the cursor to the incident duration', () => {
    const s = reducer(initViewState('inc-a', 100), { type: 'cursor', sec: 500 });
    expect(s.cursorSec).toBe(100);
  });

  it('shifts the window when the cursor moves outside it', () => {
    const s0 = initViewState('inc-a', 600); // window 0..600
    const s1 = reducer(s0, { type: 'window', start: 100, end: 200 });
    const s2 = reducer(s1, { type: 'cursor', sec: 300 });
    expect(s2.cursorSec).toBe(300);
    expect(s2.windowStartSec).toBeGreaterThan(100);
    expect(s2.windowEndSec).toBeLessThanOrEqual(600);
    expect(s2.windowEndSec - s2.windowStartSec).toBe(100);
  });

  it('clamps and preserves window width', () => {
    const s = reducer(initViewState('inc-a', 600), { type: 'window', start: 550, end: 650 });
    expect(s.windowStartSec).toBe(500);
    expect(s.windowEndSec).toBe(600);
  });

  it('enforces the minimum window width', () => {
    const s = reducer(initViewState('inc-a', 600), { type: 'window', start: 100, end: 101 });
    expect(s.windowEndSec - s.windowStartSec).toBe(10);
  });

  it('toggles filters and clears them', () => {
    let s = reducer(initViewState('inc-a', 100), { type: 'toggleService', value: 'api' });
    s = reducer(s, { type: 'toggleService', value: 'db' });
    expect(s.filters.services).toEqual(['api', 'db']);
    s = reducer(s, { type: 'toggleService', value: 'api' });
    expect(s.filters.services).toEqual(['db']);
    s = reducer(s, { type: 'toggleType', value: 'deploy' });
    expect(s.filters.types).toEqual(['deploy']);
    s = reducer(s, { type: 'clearFilters' });
    expect(s.filters).toEqual({ services: [], types: [], severities: [] });
  });

  it('selects and deselects events', () => {
    let s = reducer(initViewState('inc-a', 100), { type: 'selectEvent', id: 'evt-1' });
    expect(s.selectedEventId).toBe('evt-1');
    s = reducer(s, { type: 'selectEvent', id: null });
    expect(s.selectedEventId).toBeNull();
  });

  it('replace keeps the runtime duration', () => {
    const s = reducer(initViewState('inc-a', 100), {
      type: 'replace',
      state: initViewState('inc-a', 999), // durationSec ignored from URL state
    });
    expect(s.durationSec).toBe(100);
  });
});
