import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateIncident, validateMeta } from '../src/lib/validate';
import { incidentIds } from '../src/lib/loadIncident';
import type { Incident } from '../src/types';

const FIXTURE_DIR = join(__dirname, '..', 'src', 'data', 'incidents');

function regenerateTo(dir: string): void {
  execFileSync('node', [join(__dirname, '..', 'scripts', 'generate-fixtures.mjs'), '--out', dir], {
    stdio: 'pipe',
  });
}

describe('committed fixtures', () => {
  it('contain the three expected incidents', () => {
    expect(incidentIds()).toEqual(['bad-deploy', 'db-saturation', 'queue-backlog']);
  });

  it('validate against the schema', () => {
    for (const id of incidentIds()) {
      const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), 'utf8'));
      const inc: Incident = validateIncident(raw);
      expect(inc.id).toBe(id);
      expect(inc.durationSec).toBeGreaterThan(0);
      expect(inc.events.length).toBeGreaterThan(5);
      expect(inc.samples.length).toBeGreaterThan(1000);
      // events are chronological with unique ids
      let last = -1;
      const ids = new Set<string>();
      for (const e of inc.events) {
        expect(e.t).toBeGreaterThanOrEqual(last);
        last = e.t;
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
      }
      // samples are within the incident duration
      for (const s of inc.samples) {
        expect(s.t).toBeGreaterThanOrEqual(0);
        expect(s.t).toBeLessThanOrEqual(inc.durationSec);
      }
    }
  });

  it('index.json entries validate and match their fixtures', () => {
    const index = JSON.parse(readFileSync(join(FIXTURE_DIR, 'index.json'), 'utf8'));
    expect(Array.isArray(index)).toBe(true);
    expect(index).toHaveLength(3);
    for (const meta of index) {
      const m = validateMeta(meta);
      const inc = validateIncident(
        JSON.parse(readFileSync(join(FIXTURE_DIR, `${m.id}.json`), 'utf8')),
      );
      expect(m.eventCount).toBe(inc.events.length);
      expect(m.sampleCount).toBe(inc.samples.length);
      expect(m.durationSec).toBe(inc.durationSec);
    }
  });
});

describe('fixture generator determinism', () => {
  it('regenerates byte-identical fixtures', () => {
    const dir1 = mkdtempSync(join(tmpdir(), 'fixtures-1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'fixtures-2-'));
    try {
      regenerateTo(dir1);
      regenerateTo(dir2);
      for (const file of ['index.json', ...incidentIds().map((id) => `${id}.json`)]) {
        const a = readFileSync(join(dir1, file));
        const b = readFileSync(join(dir2, file));
        expect(a.equals(b)).toBe(true);
      }
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('matches the committed fixtures byte-for-byte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-3-'));
    try {
      regenerateTo(dir);
      for (const file of ['index.json', ...incidentIds().map((id) => `${id}.json`)]) {
        const fresh = readFileSync(join(dir, file));
        const committed = readFileSync(join(FIXTURE_DIR, file));
        expect(fresh.equals(committed)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
