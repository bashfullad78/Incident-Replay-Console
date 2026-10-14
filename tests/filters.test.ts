import { describe, expect, it } from 'vitest';
import { filterEvents } from '../src/lib/filters';
import type { IncidentEvent } from '../src/types';

const ev = (service: string, type: IncidentEvent['type'], severity: IncidentEvent['severity']): IncidentEvent => ({
  id: `${service}-${type}-${severity}`,
  t: 0,
  type,
  severity,
  service,
  message: 'test',
});

const events: IncidentEvent[] = [
  ev('api', 'deploy', 'info'),
  ev('api', 'alert', 'critical'),
  ev('db', 'error', 'warning'),
  ev('worker', 'mitigation', 'info'),
];

describe('filterEvents', () => {
  it('passes everything with empty filters', () => {
    expect(filterEvents(events, { services: [], types: [], severities: [] })).toHaveLength(4);
  });

  it('filters by service, type, and severity (AND across facets)', () => {
    expect(
      filterEvents(events, { services: ['api'], types: [], severities: [] }),
    ).toHaveLength(2);
    expect(
      filterEvents(events, { services: ['api'], types: ['alert'], severities: [] }),
    ).toHaveLength(1);
    expect(
      filterEvents(events, {
        services: ['api'],
        types: ['alert'],
        severities: ['critical'],
      }),
    ).toHaveLength(1);
    expect(
      filterEvents(events, {
        services: ['api'],
        types: ['alert'],
        severities: ['info'],
      }),
    ).toHaveLength(0);
  });

  it('matches multiple values within a facet (OR within facet)', () => {
    expect(
      filterEvents(events, {
        services: ['api', 'db'],
        types: [],
        severities: [],
      }),
    ).toHaveLength(3);
  });
});
