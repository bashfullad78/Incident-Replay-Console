import { useEffect, useRef, useState } from 'react';
import type { IncidentEvent } from '../types';
import { formatClock, formatTimestamp } from '../lib/format';
import { SEVERITY_COLORS } from '../lib/theme';
import { useIncident } from '../lib/store';

const HEIGHT = 132;
const PAD = 8;
const MARKER_Y = 16;
const BRUSH_TOP = 30;
const BRUSH_BOTTOM = HEIGHT - 22;
const MIN_WINDOW = 10;
const PLAY_INTERVAL_MS = 100;
const PLAY_STEP_SEC = 1;

const BTN =
  'min-h-[44px] rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm tabular-nums text-zinc-200 hover:border-zinc-500 active:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60';

const ZOOM_STEPS = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900];

function tickStep(duration: number, target: number): number {
  const raw = duration / target;
  return ZOOM_STEPS.find((s) => s >= raw) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

/** Measure the container width so the SVG can use exact pixel coordinates. */
function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

type DragMode = 'scrub' | 'move' | 'l' | 'r';

export function Timeline() {
  const { incident, state, dispatch } = useIncident();
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ mode: DragMode; grabOffset: number } | null>(null);
  const [playing, setPlaying] = useState(false);

  // Derived values use safe fallbacks so hooks below run unconditionally
  // (the loading early-return comes after all hook calls).
  const duration = incident?.durationSec ?? 0;
  const start = incident?.start ?? '';
  const events = incident?.events ?? [];
  const cursorSec = state?.cursorSec ?? 0;
  const ws = state?.windowStartSec ?? 0;
  const we = state?.windowEndSec ?? 0;

  const innerW = Math.max(width - PAD * 2, 10);
  const x = (t: number): number => PAD + (t / duration) * innerW;
  const tFromX = (px: number): number =>
    Math.min(duration, Math.max(0, ((px - PAD) / innerW) * duration));

  const zoomAround = (center: number, factor: number) => {
    const widthSec = we - ws;
    const nextWidth = Math.min(duration, Math.max(MIN_WINDOW, widthSec * factor));
    const ratio = (center - ws) / widthSec;
    let s = center - ratio * nextWidth;
    s = Math.min(Math.max(s, 0), duration - nextWidth);
    dispatch({ type: 'window', start: s, end: s + nextWidth });
  };

  // Native wheel listener: React attaches wheel as passive, so
  // preventDefault requires a direct subscription.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !incident || !state) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const t = tFromX(e.clientX - rect.left);
      zoomAround(t, e.deltaY > 0 ? 1.25 : 0.8);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Space / play button: self chaining timeout so each tick uses the most fresh cursor and effect stays a plain dep tracked hook.
  useEffect(() => {
    if (!playing || !state) return;
    if (state.cursorSec >= state.durationSec) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(
      () => dispatch({ type: 'cursor', sec: state.cursorSec + PLAY_STEP_SEC }),
      PLAY_INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [playing, state, dispatch]);

  if (!incident || !state) return null;

  const togglePlay = () => {
    // Play from start when pressed at the end of the incident.
    if (!playing && cursorSec >= duration) dispatch({ type: 'cursor', sec: 0 });
    setPlaying((p) => !p);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    const handle = (target.closest('[data-handle]')?.getAttribute('data-handle') ??
      'scrub') as DragMode;
    const t = tFromX(e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0));
    dragRef.current = { mode: handle, grabOffset: handle === 'move' ? t - ws : 0 };
    svgRef.current?.setPointerCapture(e.pointerId);
    if (handle === 'scrub') dispatch({ type: 'cursor', sec: t });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = tFromX(e.clientX - rect.left);
    if (drag.mode === 'scrub') {
      dispatch({ type: 'cursor', sec: t });
    } else if (drag.mode === 'move') {
      const w = we - ws;
      const s = Math.min(Math.max(t - drag.grabOffset, 0), duration - w);
      dispatch({ type: 'window', start: s, end: s + w });
    } else if (drag.mode === 'l') {
      const s = Math.min(t, we - MIN_WINDOW);
      dispatch({ type: 'window', start: Math.max(0, s), end: we });
    } else {
      const e2 = Math.max(t, ws + MIN_WINDOW);
      dispatch({ type: 'window', start: ws, end: Math.min(duration, e2) });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 5;
    switch (e.key) {
      case 'ArrowLeft':
        dispatch({ type: 'cursor', sec: cursorSec - step });
        break;
      case 'ArrowRight':
        dispatch({ type: 'cursor', sec: cursorSec + step });
        break;
      case 'Home':
        dispatch({ type: 'cursor', sec: 0 });
        break;
      case 'End':
        dispatch({ type: 'cursor', sec: duration });
        break;
      case '+':
      case '=':
      case '<':
        zoomAround(cursorSec, 0.8);
        break;
      case '-':
      case '_':
      case '>':
        zoomAround(cursorSec, 1.25);
        break;
      case ' ':
        togglePlay();
        break;
      case '0':
        dispatch({ type: 'window', start: 0, end: duration });
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const step = tickStep(duration, 8);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  const cursorX = x(cursorSec);

  return (
    <div ref={wrapRef} className="w-full [-webkit-tap-highlight-color:transparent]">
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        className="block touch-none select-none rounded-md bg-zinc-900/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Incident timeline"
      >
        {/* gridlines + time axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              y1={BRUSH_TOP}
              x2={x(t)}
              y2={BRUSH_BOTTOM}
              stroke="#27272a"
              strokeWidth={1}
            />
            <text
              x={x(t)}
              y={HEIGHT - 6}
              fill="#71717a"
              fontSize={10}
              textAnchor="middle"
              className="font-mono"
            >
              {formatClock(t)}
            </text>
          </g>
        ))}

        {/* dimmed region outside the window */}
        <rect x={PAD} y={BRUSH_TOP} width={Math.max(0, x(ws) - PAD)} height={BRUSH_BOTTOM - BRUSH_TOP} fill="rgba(9,9,11,0.55)" />
        <rect x={x(we)} y={BRUSH_TOP} width={Math.max(0, PAD + innerW - x(we))} height={BRUSH_BOTTOM - BRUSH_TOP} fill="rgba(9,9,11,0.55)" />

        {/* scrub overlay */}
        <rect data-handle="scrub" x={PAD} y={BRUSH_TOP} width={innerW} height={BRUSH_BOTTOM - BRUSH_TOP} fill="transparent" style={{ cursor: 'crosshair' }} />

        {/* brush window */}
        <rect
          data-handle="move"
          x={x(ws)}
          y={BRUSH_TOP}
          width={Math.max(2, x(we) - x(ws))}
          height={BRUSH_BOTTOM - BRUSH_TOP}
          fill="rgba(56,189,248,0.07)"
          stroke="#334155"
          strokeWidth={1}
          style={{ cursor: 'grab' }}
        />
        {/* brush handles*/}
        <rect data-handle="l" x={x(ws) - 10} y={BRUSH_TOP} width={20} height={BRUSH_BOTTOM - BRUSH_TOP} fill="transparent" style={{ cursor: 'ew-resize' }} />
        <rect data-handle="r" x={x(we) - 10} y={BRUSH_TOP} width={20} height={BRUSH_BOTTOM - BRUSH_TOP} fill="transparent" style={{ cursor: 'ew-resize' }} />
        <rect
          data-handle="l"
          x={x(ws) - 3}
          y={BRUSH_TOP}
          width={7}
          height={BRUSH_BOTTOM - BRUSH_TOP}
          rx={2}
          fill="#475569"
          style={{ cursor: 'ew-resize' }}
        />
        <rect
          data-handle="r"
          x={x(we) - 4}
          y={BRUSH_TOP}
          width={7}
          height={BRUSH_BOTTOM - BRUSH_TOP}
          rx={2}
          fill="#475569"
          style={{ cursor: 'ew-resize' }}
        />

        {/* event markers */}
        {events.map((e: IncidentEvent) => {
          const color = SEVERITY_COLORS[e.severity];
          const r = e.severity === 'critical' ? 5 : 3.5;
          const inWindow = e.t >= ws && e.t <= we;
          return (
            <g key={e.id} opacity={inWindow ? 1 : 0.35}>
              {e.severity === 'critical' && (
                <circle cx={x(e.t)} cy={MARKER_Y} r={r + 2.5} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
              )}
              <circle cx={x(e.t)} cy={MARKER_Y} r={r} fill={color}>
                <title>{`${formatTimestamp(start, e.t)} — [${e.severity}] ${e.message}`}</title>
              </circle>
            </g>
          );
        })}

        {/* playhead (keyboard-operable slider) */}
        <g
          tabIndex={0}
          role="slider"
          aria-label="Cursor position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(cursorSec)}
          aria-valuetext={`${formatClock(cursorSec)} of ${formatClock(duration)}`}
          onKeyDown={onKeyDown}
          style={{ outline: 'none', cursor: 'ew-resize' }}
        >
          <line x1={cursorX} y1={BRUSH_TOP - 6} x2={cursorX} y2={BRUSH_BOTTOM} stroke="#e4e4e7" strokeWidth={1.5} />
          <polygon
            points={`${cursorX - 5},${BRUSH_TOP - 6} ${cursorX + 5},${BRUSH_TOP - 6} ${cursorX},${BRUSH_TOP}`}
            fill="#e4e4e7"
          />
          <rect x={cursorX - 6} y={BRUSH_TOP - 8} width={12} height={BRUSH_BOTTOM - BRUSH_TOP + 10} fill="transparent" />
        </g>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Timeline playback">
        <button type="button" className={BTN} aria-label="Step back 30 seconds" onClick={() => dispatch({ type: 'cursor', sec: cursorSec - 30 })}>
          −30s
        </button>
        <button type="button" className={BTN} aria-pressed={playing} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" className={BTN} aria-label="Step forward 30 seconds" onClick={() => dispatch({ type: 'cursor', sec: cursorSec + 30 })}>
          +30s
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-zinc-800" />
        <button type="button" className={BTN} aria-label="Zoom out" onClick={() => zoomAround(cursorSec, 1.25)}>
          −
        </button>
        <button type="button" className={BTN} aria-label="Reset window" onClick={() => dispatch({ type: 'window', start: 0, end: duration })}>
          0
        </button>
        <button type="button" className={BTN} aria-label="Zoom in" onClick={() => zoomAround(cursorSec, 0.8)}>
          +
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Drag to scrub · drag window to pan · edge handles resize
        <span className="hidden sm:inline">
          {' '}· scroll zooms ·{' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">←</kbd>{' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">→</kbd>{' '}
          scrub (<kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">Shift</kbd> = 30s){' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">&lt;</kbd>
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">&gt;</kbd> or{' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">+</kbd>
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">−</kbd> zoom ·{' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">Space</kbd> play ·{' '}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono">0</kbd> reset window
        </span>
      </p>
    </div>
  );
}
