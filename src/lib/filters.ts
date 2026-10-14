import type { IncidentEvent } from '../types';
import type { Filters } from './urlState';

/**
 * Filter events by the active facets. An empty facet list means "no filter"
 * (everything passes), which keeps the URL minimal for the default view.
 */
export function filterEvents(events: IncidentEvent[], filters: Filters): IncidentEvent[] {
  const { services, types, severities } = filters;
  return events.filter(
    (e) =>
      (services.length === 0 || services.includes(e.service)) &&
      (types.length === 0 || types.includes(e.type)) &&
      (severities.length === 0 || severities.includes(e.severity)),
  );
}
