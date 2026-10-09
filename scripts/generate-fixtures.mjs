// Deterministic incident fixture generator.
// Determinism: every series uses a seeded mulberry32 PRNG and closed-form
// phase functions (smoothsteps + gaussian bumps), so regeneration is
// byte identical.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');


// math helpers

function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// smoothstep: 0 before a, 1 after b, smooth in between
const ss = (t, a, b) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
// gaussian bump centered at c with width w
const g = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));

const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};


// series builder

function buildSeries(duration, fn, seed, { dp = 2, int = false } = {}) {
  const rand = rng(seed);
  const out = [];
  for (let t = 0; t <= duration; t++) {
    const v = fn(t, rand);
    out.push(int ? Math.round(v) : round(v, dp));
  }
  return out;
}


// incident builders

function ev(t, type, severity, service, message, metadata = {}) {
  return {
    id: `evt-${String(t).padStart(4, '0')}-${type}`,
    t,
    type,
    severity,
    service,
    message,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

function buildDbSaturation() {
  const duration = 720; 
  const samples = [];
  const add = (service, metric, fn, seed, opts) => {
    buildSeries(duration, fn, seed, opts).forEach((value, t) => {
      samples.push({ t, service, metric, value });
    });
  };

  // db.connections: baseline 42, ramps 60s->300s to the 100 limit,
  // plateau, then drains after mitigation at 480s.
  add('db', 'connections', (t, r) =>
    42 + 2 * Math.sin(t / 20) + r() * 1.6 + 57 * ss(t, 60, 300) - 52 * ss(t, 480, 700),
    101, { dp: 1, int: true });

  // db.query_time_avg_ms: tracks connection pressure.
  add('db', 'query_time_avg_ms', (t, r) =>
    12 + r() * 1.2 + 195 * ss(t, 90, 300) - 188 * ss(t, 500, 660), 102);

  // api.latency_p95_ms: two waves — saturation peak ~295s, mitigation blip ~510s.
  add('api', 'latency_p95_ms', (t, r) =>
    85 + 3 * Math.sin(t / 30) + r() * 4 + 330 * g(t, 295, 50) + 250 * g(t, 510, 35),
    103, { dp: 0 });

  // api.error_rate_pct: rises with latency, small secondary bump.
  add('api', 'error_rate_pct', (t, r) =>
    0.25 + r() * 0.12 + 4.5 * g(t, 295, 60) + 3 * g(t, 520, 40), 104);

  // api.requests_per_sec: retry storm amplifies traffic ~300s.
  add('api', 'requests_per_sec', (t, r) =>
    240 + 8 * Math.sin(t / 40) + r() * 6 + 280 * g(t, 300, 55), 105, { dp: 0 });

  // worker.queue_depth: retries enqueue background work; drains after mitigation.
  add('worker', 'queue_depth', (t, r) =>
    40 + r() * 5 + 860 * ss(t, 240, 430) - 855 * ss(t, 540, 720), 106, { dp: 0, int: true });

  const events = [
    ev(12, 'note', 'info', 'system', 'Scheduled configuration audit completed', { audit_id: 'cfg-audit-8821' }),
    ev(90, 'deploy', 'info', 'api', 'Deploy api@1.9.4 (routine release, unrelated to incident)', { version: '1.9.4', sha: '9f3c21a' }),
    ev(180, 'alert', 'warning', 'db', 'db.connection_wait_ms above 200ms threshold', { metric: 'connection_wait_ms', value: 214 }),
    ev(240, 'error', 'error', 'api', 'Retry amplification detected: client retries at 3x baseline', { retry_ratio: 3.1 }),
    ev(270, 'alert', 'warning', 'db', 'db.connections above 90% of limit', { value: 96, limit: 100 }),
    ev(300, 'error', 'critical', 'db', 'db.connections at limit; new connections queued', { value: 99, limit: 100 }),
    ev(330, 'error', 'critical', 'api', 'api.latency_p95_ms above 400ms for 2 minutes', { value: 412 }),
    ev(360, 'alert', 'critical', 'system', 'INC-2041 opened: database connection saturation', { incident_id: 'INC-2041' }),
    ev(420, 'note', 'info', 'engineer', 'E. Ramos identified connection pool exhaustion on db-primary', { engineer: 'E. Ramos' }),
    ev(480, 'mitigation', 'warning', 'db', 'config change: max_connections 100 -> 150 (temporary)', { setting: 'max_connections', from: 100, to: 150 }),
    ev(510, 'mitigation', 'info', 'db', 'Terminated 34 idle connections older than 10 minutes', { connections_killed: 34 }),
    ev(600, 'note', 'info', 'system', 'Connection pressure nominal; monitoring for recurrence'),
    ev(720, 'recovery', 'info', 'system', 'INC-2041 resolved: latency and error rate back to baseline', { incident_id: 'INC-2041' }),
  ];

  return {
    id: 'db-saturation',
    title: 'Database connection saturation',
    summary:
      'Connection pool exhaustion on the primary database cascaded into API latency and error spikes, amplified by client retries. Mitigation raised the connection limit and reaped idle connections.',
    start: '2026-10-04T14:00:00Z',
    durationSec: duration,
    services: ['api', 'db', 'worker', 'system', 'engineer'],
    metrics: ['latency_p95_ms', 'error_rate_pct', 'requests_per_sec', 'connections', 'query_time_avg_ms', 'queue_depth'],
    samples,
    events,
  };
}

function buildQueueBacklog() {
  const duration = 900; // 15 minutes
  const samples = [];
  const add = (service, metric, fn, seed, opts) => {
    buildSeries(duration, fn, seed, opts).forEach((value, t) => {
      samples.push({ t, service, metric, value });
    });
  };

  // worker.active_workers: worker 7 dies at 120s, replaced at 540s.
  add('worker', 'active_workers', (t) => 6 - ss(t, 118, 122) + ss(t, 538, 542), 201, { dp: 0, int: true });

  // worker.throughput_per_sec: loses a worker, backpressure dip, catch-up burst.
  add('worker', 'throughput_per_sec', (t, r) =>
    180 + r() * 8 - 30 * ss(t, 120, 180) + 30 * ss(t, 538, 542) - 60 * g(t, 360, 60) + 70 * g(t, 640, 70),
    202, { dp: 0 });

  // worker.memory_mb: worker-7 climbs to its 1.5GB cgroup limit and is OOM killed.
  add('worker', 'memory_mb', (t, r) =>
    512 - 82 * ss(t, 120, 130) + 82 * ss(t, 540, 550) + 1388 * g(t, 115, 16) + r() * 12,
    203, { dp: 0 });

  // queue.depth: grows ~9/s while a worker is missing, drains ~18/s after restart.
  add('queue', 'depth', (t, r) =>
    320 + r() * 10 + 3240 * ss(t, 120, 480) - 3230 * ss(t, 540, 740), 204, { dp: 0, int: true });

  // queue.oldest_message_age_sec: head of line age tracks the backlog.
  add('queue', 'oldest_message_age_sec', (t, r) =>
    4 + r() * 0.5 + 116 * ss(t, 120, 480) - 114 * ss(t, 540, 760), 205, { dp: 1 });

  // api.latency_p95_ms: mildly affected while async job results are delayed.
  add('api', 'latency_p95_ms', (t, r) =>
    90 + r() * 4 + 70 * ss(t, 300, 480) - 66 * ss(t, 560, 700), 206, { dp: 0 });

  const events = [
    ev(60, 'note', 'info', 'system', 'Nightly consumer lag report: all queues nominal'),
    ev(120, 'error', 'critical', 'worker', 'worker-7 OOM killed (rss 1.9GB, limit 1.5GB)', { worker: 'worker-7', rss_mb: 1900, limit_mb: 1500 }),
    ev(150, 'alert', 'warning', 'queue', 'queue.depth above 1000', { value: 1012 }),
    ev(240, 'error', 'warning', 'worker', 'Autoscaler declined scale-up: pool already at maximum', { pool_max: 6 }),
    ev(300, 'error', 'error', 'api', 'Job-status polling degraded: results delayed for some requests'),
    ev(420, 'alert', 'critical', 'queue', 'queue.depth above 3000; oldest message 96s', { value: 3150, oldest_age_sec: 96 }),
    ev(480, 'mitigation', 'info', 'worker', 'Restarted worker pool (rollout restart)', { action: 'rollout-restart' }),
    ev(540, 'recovery', 'warning', 'worker', 'worker-7 replaced; pool healthy at 6/6'),
    ev(600, 'note', 'info', 'engineer', 'M. Chen confirmed drain rate ~18 msg/s exceeds ingress ~9 msg/s', { engineer: 'M. Chen' }),
    ev(780, 'note', 'info', 'queue', 'Backlog fully drained; depth back to baseline'),
    ev(900, 'recovery', 'info', 'system', 'INC-2042 resolved', { incident_id: 'INC-2042' }),
  ];

  return {
    id: 'queue-backlog',
    title: 'Worker failure and queue backlog',
    summary:
      'An OOM-killed worker shrank the consumer pool below the autoscaler maximum, so queue depth grew faster than it drained and job results were delayed. Restarting the pool restored capacity and drained the backlog.',
    start: '2026-10-05T09:30:00Z',
    durationSec: duration,
    services: ['api', 'worker', 'queue', 'system', 'engineer'],
    metrics: ['active_workers', 'throughput_per_sec', 'memory_mb', 'depth', 'oldest_message_age_sec', 'latency_p95_ms'],
    samples,
    events,
  };
}

function buildBadDeploy() {
  const duration = 780; // 13 minutes
  const samples = [];
  const add = (service, metric, fn, seed, opts) => {
    buildSeries(duration, fn, seed, opts).forEach((value, t) => {
      samples.push({ t, service, metric, value });
    });
  };

  // Regression envelope: spikes after the 2.14.0 deploy, partially masked by
  // the feature flag disable at 300s, removed by the rollback at 420s.
  const regression = (t) => (1 - ss(t, 420, 480)) * (1 - 0.55 * g(t, 310, 40));

  add('api', 'error_rate_pct', (t, r) =>
    0.3 + r() * 0.1 + (6.2 * g(t, 158, 25) + 2.4 * g(t, 200, 120)) * regression(t), 301);

  add('api', 'latency_p95_ms', (t, r) =>
    80 + r() * 4 + (60 * g(t, 200, 50) + 160 * g(t, 330, 80)) * (1 - ss(t, 420, 520)),
    302, { dp: 0 });

  add('api', 'requests_per_sec', (t, r) =>
    220 + r() * 6 + 45 * g(t, 300, 60) * (1 - ss(t, 420, 520)), 303, { dp: 0 });

  add('web', 'page_load_p95_ms', (t, r) =>
    1400 + r() * 60 + 1200 * g(t, 320, 90) * (1 - ss(t, 430, 540)), 304, { dp: 0 });

  add('web', 'js_errors_per_min', (t, r) =>
    12 + r() * 3 + (200 * g(t, 160, 30) + 60 * g(t, 220, 80)) * (1 - ss(t, 420, 500)),
    305, { dp: 0 });

  const events = [
    ev(100, 'note', 'info', 'system', 'Pre-deploy smoke tests passed (canary 5%)', { canary_pct: 5 }),
    ev(120, 'deploy', 'info', 'api', 'Deploy api@2.14.0', { version: '2.14.0', sha: 'a1b2c3d' }),
    ev(150, 'error', 'critical', 'api', 'NullPointerException in CheckoutController (new code path in 2.14.0)', { exception: 'NullPointerException' }),
    ev(165, 'alert', 'warning', 'api', 'error_rate above 1%', { value: 2.4 }),
    ev(180, 'alert', 'critical', 'api', 'error_rate above 5%', { value: 6.1 }),
    ev(240, 'error', 'error', 'api', 'Client retries amplifying load (+18%)', { retry_increase_pct: 18 }),
    ev(300, 'mitigation', 'warning', 'api', 'Feature flag checkout.v2 disabled', { flag: 'checkout.v2', enabled: false }),
    ev(330, 'note', 'info', 'engineer', 'Partial recovery — flagged traffic on legacy path', { engineer: 'J. Okafor' }),
    ev(420, 'mitigation', 'info', 'api', 'Rollback api@2.14.0 -> api@2.13.8', { from: '2.14.0', to: '2.13.8' }),
    ev(480, 'recovery', 'warning', 'api', 'Error rate back to baseline'),
    ev(600, 'note', 'info', 'system', 'Latency normal; post-incident review scheduled', { review: 'PIR-2026-10-06' }),
    ev(780, 'recovery', 'info', 'system', 'INC-2043 resolved', { incident_id: 'INC-2043' }),
  ];

  return {
    id: 'bad-deploy',
    title: 'Erroneous deployment and rollback',
    summary:
      'Release 2.14.0 shipped a regression that raised API errors and page-load times. Disabling the checkout.v2 flag masked most of it; a full rollback to 2.13.8 restored baseline.',
    start: '2026-10-06T16:45:00Z',
    durationSec: duration,
    services: ['api', 'web', 'system', 'engineer'],
    metrics: ['error_rate_pct', 'latency_p95_ms', 'requests_per_sec', 'page_load_p95_ms', 'js_errors_per_min'],
    samples,
    events,
  };
}


// writer

function toMeta(inc) {
  return {
    id: inc.id,
    title: inc.title,
    summary: inc.summary,
    start: inc.start,
    durationSec: inc.durationSec,
    services: inc.services,
    eventCount: inc.events.length,
    sampleCount: inc.samples.length,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx !== -1 && argv[outIdx + 1]
    ? resolve(argv[outIdx + 1])
    : join(root, 'src/data/incidents');

  const incidents = [buildDbSaturation(), buildQueueBacklog(), buildBadDeploy()];

  await mkdir(outDir, { recursive: true });
  for (const inc of incidents) {
    const path = join(outDir, `${inc.id}.json`);
    await writeFile(path, JSON.stringify(inc));
    console.log(`wrote ${path} (${inc.samples.length} samples, ${inc.events.length} events)`);
  }
  const indexPath = join(outDir, 'index.json');
  await writeFile(indexPath, JSON.stringify(incidents.map(toMeta)));
  console.log(`wrote ${indexPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
