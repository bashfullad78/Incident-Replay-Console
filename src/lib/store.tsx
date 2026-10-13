import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Incident, IncidentMeta } from '../types';
import { loadIncident, loadIncidentMeta } from './loadIncident';
import {
  MIN_WINDOW_SEC,
  decodeViewState,
  encodeViewState,
  initViewState,
  toggle,
  type ViewState,
} from './urlState';

export type Action =
  | { type: 'incident'; incident: Incident }
  | { type: 'cursor'; sec: number }
  | { type: 'window'; start: number; end: number }
  | { type: 'selectEvent'; id: string | null }
  | { type: 'toggleService'; value: string }
  | { type: 'toggleType'; value: string }
  | { type: 'toggleSeverity'; value: string }
  | { type: 'clearFilters' }
  | { type: 'replace'; state: ViewState };

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export function reducer(state: ViewState, action: Action): ViewState {
  switch (action.type) {
    case 'incident':
      return initViewState(action.incident.id, action.incident.durationSec);

    case 'cursor': {
      const c = clamp(action.sec, 0, state.durationSec);
      let { windowStartSec: s, windowEndSec: e } = state;
      const width = e - s;
      if (c < s) {
        e = Math.min(state.durationSec, c + width * 0.15);
        s = Math.max(0, e - width);
      } else if (c > e) {
        s = Math.max(0, c - width * 0.15);
        e = Math.min(state.durationSec, s + width);
      }
      return { ...state, cursorSec: c, windowStartSec: s, windowEndSec: e };
    }

    case 'window': {
      const dur = state.durationSec;
      const width = clamp(action.end - action.start, MIN_WINDOW_SEC, dur);
      const s = clamp(action.start, 0, dur - width);
      return { ...state, windowStartSec: s, windowEndSec: s + width };
    }

    case 'selectEvent':
      return { ...state, selectedEventId: action.id };

    case 'toggleService':
      return { ...state, filters: { ...state.filters, services: toggle(state.filters.services, action.value) } };
    case 'toggleType':
      return { ...state, filters: { ...state.filters, types: toggle(state.filters.types, action.value as ViewState['filters']['types'][number]) } };
    case 'toggleSeverity':
      return { ...state, filters: { ...state.filters, severities: toggle(state.filters.severities, action.value as ViewState['filters']['severities'][number]) } };

    case 'clearFilters':
      return { ...state, filters: { services: [], types: [], severities: [] } };

    case 'replace':
      return { ...action.state, durationSec: state.durationSec };
  }
}

interface IncidentContextValue {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  metas: IncidentMeta[];
  incident: Incident | null;
  state: ViewState | null;
  dispatch: React.Dispatch<Action>;
  selectIncident: (id: string) => void;
}

const IncidentContext = createContext<IncidentContextValue | null>(null);

export function useIncident(): IncidentContextValue {
  const ctx = useContext(IncidentContext);
  if (!ctx) throw new Error('useIncident must be used inside <IncidentProvider>');
  return ctx;
}

export function IncidentProvider({ children }: { children: ReactNode }) {
  const [metas, setMetas] = useState<IncidentMeta[]>([]);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reducer, initViewState('pending', 0));

  // Boot: load the index, resolve the incident from the URL (or the first
  // available), then decode the rest of the view state against its duration.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const metaList = await loadIncidentMeta();
        if (cancelled || metaList.length === 0) {
          if (!cancelled) {
            setError('No incident fixtures found in the build.');
            setStatus('error');
          }
          return;
        }
        const wanted = new URLSearchParams(window.location.search).get('i');
        const id = wanted && metaList.some((m) => m.id === wanted) ? wanted : metaList[0].id;
        const inc = await loadIncident(id);
        if (cancelled) return;
        setMetas(metaList);
        setIncident(inc);
        const decoded = decodeViewState(window.location.search, {
          defaultIncidentId: id,
          durationSec: inc.durationSec,
        });
        dispatch({ type: 'replace', state: decoded });
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Back/forward navigation: redecode the URL, loading a different incident
  // when the URL points at one.
  useEffect(() => {
    if (status !== 'ready' || !incident) return;
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('i');
      const targetId = wanted && wanted !== incident.id ? wanted : incident.id;
      (async () => {
        try {
          const inc =
            targetId === incident.id ? incident : await loadIncident(targetId);
          if (inc.id !== incident.id) setIncident(inc);
          const decoded = decodeViewState(params.toString(), {
            defaultIncidentId: inc.id,
            durationSec: inc.durationSec,
          });
          dispatch({ type: 'replace', state: decoded });
        } catch {
          /* unknown incident in URL: keep current view */
        }
      })();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [status, incident]);

  // Write state back to the URL (replaceState: history stays clean).
  useEffect(() => {
    if (status !== 'ready' || !incident || !state) return;
    const qs = encodeViewState(state);
    const next = `?${qs}`;
    if (window.location.search !== next) {
      window.history.replaceState(null, '', `${window.location.pathname}${next}`);
    }
  }, [state, status, incident]);

  const selectIncident = useCallback(
    (id: string) => {
      if (id === incident?.id) return;
      setStatus('loading');
      setError(null);
      (async () => {
        try {
          const inc = await loadIncident(id);
          setIncident(inc);
          dispatch({ type: 'incident', incident: inc });
          setStatus('ready');
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      })();
    },
    [incident],
  );

  const value = useMemo<IncidentContextValue>(
    () => ({ status, error, metas, incident, state, dispatch, selectIncident }),
    [status, error, metas, incident, state, selectIncident],
  );

  return <IncidentContext.Provider value={value}>{children}</IncidentContext.Provider>;
}
