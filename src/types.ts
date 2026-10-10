export type Severity = 'info' | 'warning' | 'error' | 'critical';

export type EventType =
  | 'deploy'
  | 'alert'
  | 'error'
  | 'config'
  | 'mitigation'
  | 'note'
  | 'recovery';

export const SEVERITIES: Severity[] = ['info', 'warning', 'error', 'critical'];

export const EVENT_TYPES: EventType[] = [
  'deploy',
  'alert',
  'error',
  'config',
  'mitigation',
  'note',
  'recovery',
];

/* A single telemetry data point. `t` secs since incident start. */
export interface MetricSample {
  t: number;
  service: string;
  metric: string;
  value: number;
}

/* A timestamped thang that happened during the incident. */
export interface IncidentEvent {
  id: string;
  t: number;
  type: EventType;
  severity: Severity;
  service: string;
  message: string;
  metadata?: Record<string, string | number | boolean>;
}

/* A complete incident fixture. */
export interface Incident {
  id: string;
  title: string;
  summary: string;
  /** ISO timestamp of the incident start */
  start: string;
  durationSec: number;
  services: string[];
  metrics: string[];
  samples: MetricSample[];
  events: IncidentEvent[];
}

/* Metadata for incident picker (index.json). */
export interface IncidentMeta {
  id: string;
  title: string;
  summary: string;
  start: string;
  durationSec: number;
  services: string[];
  eventCount: number;
  sampleCount: number;
}
