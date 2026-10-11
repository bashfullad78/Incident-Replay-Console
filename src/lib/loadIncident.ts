import type { Incident, IncidentMeta } from '../types';
import { validateIncident, validateMeta } from './validate';

type JsonModule = { default: unknown };

// Vite turns each fixture into a lazy chunk so only selected incident is downloaded after the initial bundle.
const modules = import.meta.glob<JsonModule>('/src/data/incidents/*.json', {
  eager: false,
});

const INDEX_KEY = '/src/data/incidents/index.json';
const INCIDENT_PREFIX = '/src/data/incidents/';

const incidentKey = (id: string): string => `${INCIDENT_PREFIX}${id}.json`;

/** All fixture ids present in the build. */
export function incidentIds(): string[] {
  return Object.keys(modules)
    .filter((k) => k !== INDEX_KEY)
    .map((k) => k.slice(INCIDENT_PREFIX.length).replace(/\.json$/, ''))
    .sort();
}

/** Load the incident index (picker metadata). */
export async function loadIncidentMeta(): Promise<IncidentMeta[]> {
  const loader = modules[INDEX_KEY];
  if (!loader) throw new Error('Malformed fixture: incident index missing');
  const mod = await loader();
  if (!Array.isArray(mod.default)) throw new Error('Malformed fixture: index must be an array');
  return (mod.default as unknown[]).map(validateMeta);
}

/** Load and validate one incident by id. Throws on unknown or malformed data. */
export async function loadIncident(id: string): Promise<Incident> {
  const key = incidentKey(id);
  const loader = modules[key];
  if (!loader) throw new Error(`Unknown incident: ${id}`);
  const mod = await loader();
  return validateIncident(mod.default);
}
