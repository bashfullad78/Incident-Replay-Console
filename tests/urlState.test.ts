import { describe, expect, it } from 'vitest';
import {
  decodeViewState,
  encodeViewState,
  initViewState,
  MIN_WINDOW_SEC,
  type ViewState,
} from '../src/lib/urlState';

const DURATION = 720;

const base = (): ViewState => initViewState('db-saturation', DURATION);

describe('initViewState', () => {
  it('defaults to full-window, unfiltered, no selection', () => {
    const s = base();
    expect(s.cursorSec).toBe(0);
    expect(s.windowStartSec).toBe(0);
    expect(s.windowEndSec).toBe(DURATION);
    expect(s.selectedEventId).toBeNull();
    expect(s.filters).toEqual({ services: [], types: [], severities: [] });
    expect(s.incidentId).toBe('db-saturation');
    expect(s.durationSec).toBe(DURATION);
  });
});

describe('encodeViewState / decodeViewState round-trip', () => {
  it('round-trips a fully populated state', () => {
    const s: ViewState = {
      ...base(),
      cursorSec: 312.4,
      windowStartSec: 120,
      windowEndSec: 420,
      selectedEventId: 'evt-0300-error',
      filters: {
        services: ['api', 'db'],
        types: ['deploy', 'alert'],
        severities: ['critical', 'info'],
      },
    };
    const decoded = decodeViewState(encodeViewState(s), {
      defaultIncidentId: 'x',
      durationSec: DURATION,
    });
    expect(decoded).toEqual({ ...s, cursorSec: 312, durationSec: DURATION });
  });

  it('round-trips a minimal state with compact encoding', () => {
    const s = base();
    const qs = encodeViewState(s);
    expect(qs).not.toContain('e=');
    expect(qs).not.toContain('se=');
    expect(qs).not.toContain('ty=');
    expect(qs).not.toContain('sv=');
    expect(decodeViewState(qs, { defaultIncidentId: 'x', durationSec: DURATION })).toEqual(s);
  });
});

describe('decodeViewState validation', () => {
  it('ignores unknown incident ids characters and junk numbers', () => {
    const s = decodeViewState('i=has space&c=abc&w=not,a-number', {
      defaultIncidentId: 'fallback',
      durationSec: DURATION,
    });
    expect(s.incidentId).toBe('fallback');
    expect(s.cursorSec).toBe(0);
    expect(s.windowEndSec).toBe(DURATION);
  });

  it('clamps cursor and window to the incident duration', () => {
    const s = decodeViewState(`c=99999&w=0,99999`, {
      defaultIncidentId: 'db-saturation',
      durationSec: DURATION,
    });
    expect(s.cursorSec).toBe(DURATION);
    expect(s.windowStartSec).toBe(0);
    expect(s.windowEndSec).toBe(DURATION);
  });

  it('enforces the minimum window width', () => {
    const s = decodeViewState(`w=100,101`, {
      defaultIncidentId: 'db-saturation',
      durationSec: DURATION,
    });
    expect(s.windowEndSec - s.windowStartSec).toBe(MIN_WINDOW_SEC);
  });

  it('drops invalid enum values from filter lists', () => {
    const s = decodeViewState('sv=critical,bogus&ty=deploy,nope&se=api,db', {
      defaultIncidentId: 'db-saturation',
      durationSec: DURATION,
    });
    expect(s.filters.severities).toEqual(['critical']);
    expect(s.filters.types).toEqual(['deploy']);
    expect(s.filters.services).toEqual(['api', 'db']);
  });

  it('truncates overlong event ids', () => {
    const s = decodeViewState(`e=${'a'.repeat(300)}`, {
      defaultIncidentId: 'db-saturation',
      durationSec: DURATION,
    });
    expect(s.selectedEventId).toHaveLength(128);
  });
});
