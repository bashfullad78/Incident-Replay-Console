import {
  EVENT_TYPES,
  SEVERITIES,
  type Incident,
  type IncidentEvent,
  type IncidentMeta,
  type MetricSample,
} from '../types';

function fail(path: string, detail: string): never {
  throw new Error(`Malformed fixture (${path}): ${detail}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) fail(path, `"${key}" must be a non-empty string`);
  return v;
}

function reqNumber(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, `"${key}" must be a finite number`);
  return v;
}

function reqStringArray(obj: Record<string, unknown>, key: string, path: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    fail(path, `"${key}" must be an array of strings`);
  }
  return v as string[];
}

function validateSample(raw: unknown, i: number, incident: { services: string[]; metrics: string[]; durationSec: number }): MetricSample {
  const path = `samples[${i}]`;
  if (!isRecord(raw)) fail(path, 'must be an object');
  const t = reqNumber(raw, 't', path);
  if (t < 0 || t > incident.durationSec) fail(path, `"t" (${t}) outside incident duration`);
  const service = reqString(raw, 'service', path);
  if (!incident.services.includes(service)) fail(path, `unknown service "${service}"`);
  const metric = reqString(raw, 'metric', path);
  if (!incident.metrics.includes(metric)) fail(path, `unknown metric "${metric}"`);
  const value = reqNumber(raw, 'value', path);
  return { t, service, metric, value };
}

function validateEvent(raw: unknown, i: number, incident: { services: string[]; durationSec: number }): IncidentEvent {
  const path = `events[${i}]`;
  if (!isRecord(raw)) fail(path, 'must be an object');
  const id = reqString(raw, 'id', path);
  const t = reqNumber(raw, 't', path);
  if (t < 0 || t > incident.durationSec) fail(path, `"t" (${t}) outside incident duration`);
  const type = reqString(raw, 'type', path);
  if (!EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
    fail(path, `unknown event type "${type}"`);
  }
  const severity = reqString(raw, 'severity', path);
  if (!SEVERITIES.includes(severity as (typeof SEVERITIES)[number])) {
    fail(path, `unknown severity "${severity}"`);
  }
  const service = reqString(raw, 'service', path);
  if (!incident.services.includes(service)) fail(path, `unknown service "${service}"`);
  const message = reqString(raw, 'message', path);

  const metadata: Record<string, string | number | boolean> | undefined =
    raw.metadata === undefined ? undefined : (raw.metadata as Record<string, string | number | boolean>);
  if (metadata !== undefined) {
    if (!isRecord(metadata)) fail(path, '"metadata" must be an object');
    for (const [k, v] of Object.entries(metadata)) {
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        fail(path, `metadata["${k}"] must be a string, number, or boolean`);
      }
    }
  }

  return {
    id,
    t,
    type: type as IncidentEvent['type'],
    severity: severity as IncidentEvent['severity'],
    service,
    message,
    metadata,
  };
}

/** Validate an untrusted fixture payload into an Incident, or throw. */
export function validateIncident(raw: unknown): Incident {
  if (!isRecord(raw)) fail('root', 'must be an object');
  const id = reqString(raw, 'id', 'root');
  const title = reqString(raw, 'title', 'root');
  const summary = reqString(raw, 'summary', 'root');
  const start = reqString(raw, 'start', 'root');
  if (Number.isNaN(new Date(start).getTime())) fail('root', '"start" must be an ISO date');
  const durationSec = reqNumber(raw, 'durationSec', 'root');
  if (durationSec <= 0) fail('root', '"durationSec" must be positive');
  const services = reqStringArray(raw, 'services', 'root');
  const metrics = reqStringArray(raw, 'metrics', 'root');
  const incident = { id, title, summary, start, durationSec, services, metrics };

  if (!Array.isArray(raw.samples)) fail('root', '"samples" must be an array');
  const samples = (raw.samples as unknown[]).map((s, i) => validateSample(s, i, incident));

  if (!Array.isArray(raw.events)) fail('root', '"events" must be an array');
  const events = (raw.events as unknown[]).map((e, i) => validateEvent(e, i, incident));

  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) fail(`events`, `duplicate event id "${e.id}"`);
    seen.add(e.id);
  }

  return { ...incident, samples, events };
}

/** Validate an index.json entry into IncidentMeta, or throw. */
export function validateMeta(raw: unknown): IncidentMeta {
  if (!isRecord(raw)) fail('index', 'entry must be an object');
  const id = reqString(raw, 'id', 'index');
  const title = reqString(raw, 'title', 'index');
  const summary = reqString(raw, 'summary', 'index');
  const start = reqString(raw, 'start', 'index');
  if (Number.isNaN(new Date(start).getTime())) fail('index', '"start" must be an ISO date');
  const durationSec = reqNumber(raw, 'durationSec', 'index');
  const services = reqStringArray(raw, 'services', 'index');
  const eventCount = reqNumber(raw, 'eventCount', 'index');
  const sampleCount = reqNumber(raw, 'sampleCount', 'index');
  return { id, title, summary, start, durationSec, services, eventCount, sampleCount };
}
