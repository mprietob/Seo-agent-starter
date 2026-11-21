import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PilotRepository, PILOT_DOMAIN, PILOT_ID, PILOT_PROPERTY, projectStats } from '../src/integrations/pilot.js';
import type { MotorReader, ReadTool } from '../src/integrations/dispatch-mcp.js';
import { validates } from '../src/gabi/contracts.js';

const capturedAt = '2026-09-20T12:00:00.000Z';
const snapshot = (date: string, clicks: number, impressions: number, position: number) => ({
  project_id: PILOT_ID,
  date,
  clicks,
  impressions,
  top_queries: [{ query: 'pintor en Ferrol', clicks, impressions, position }],
  top_pages: [{ page: `https://${PILOT_DOMAIN}/`, clicks, impressions, position }]
});

test('pilot projection keeps GSC query and page observations separate and schema-valid', () => {
  const projection = projectStats({ snapshots: [snapshot('2026-09-18', 4, 40, 8), snapshot('2026-09-19', 6, 60, 6)] }, capturedAt);
  assert.deepEqual(projection.dates, ['2026-09-18', '2026-09-19']);
  assert.equal(projection.clicks, 10);
  assert.equal(projection.impressions, 100);
  assert.equal(projection.metrics.length, 2);
  assert.equal(projection.metrics.every(row => row.ctr === 0.1 && row.position === 6.8), true);
  assert.equal(projection.evidence.every(row => validates('Evidence', row) && row.site_id === PILOT_ID), true);
  assert.equal(projection.ideas.every(row => validates('Idea', row) && row.site_id === PILOT_ID), true);
  assert.equal(JSON.stringify(projection.ideas).includes('query-to-URL'), false);
});

test('pilot projection rejects foreign sites and URLs before creating any evidence', () => {
  const foreignProject = snapshot('2026-09-19', 1, 10, 4);
  foreignProject.project_id = '00000000-0000-4000-8000-000000000099';
  assert.throws(() => projectStats({ snapshots: [foreignProject] }, capturedAt), { code: 'invalid_upstream_response' });
  const foreignPage = snapshot('2026-09-19', 1, 10, 4);
  foreignPage.top_pages[0]!.page = 'https://example.org/';
  assert.throws(() => projectStats({ snapshots: [foreignPage] }, capturedAt), { code: 'invalid_upstream_response' });
});

test('pilot refresh validates read-only upstream configuration before syncing or persisting', async t => {
  const calls: ReadTool[] = [];
  let synced = 0;
  const motor: MotorReader = {
    async read(_token, tool) {
      calls.push(tool);
      if (tool === 'get_project') return {
        domain: PILOT_DOMAIN, slug: 'pinturas-gabriel', gsc_property: PILOT_PROPERTY,
        github_repo: 'should-not-be-set', auto_approve: false, auto_approve_tools: false, publish_target: 'manual'
      };
      throw new Error('must not read metrics');
    }
  };
  const dir = mkdtempSync(join(tmpdir(), 'gabi-pilot-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = new PilotRepository(motor, 'upstream-token', async () => { synced += 1; }, join(dir, 'state.json'));
  await assert.rejects(() => repo.refresh(), { code: 'dependency_unavailable' });
  assert.deepEqual(calls, ['get_project']);
  assert.equal(synced, 0);
});

test('pilot refresh persists only normalized GSC observations after explicit sync', async t => {
  const calls: ReadTool[] = [];
  let synced = 0;
  const motor: MotorReader = {
    async read(_token, tool) {
      calls.push(tool);
      if (tool === 'get_project') return {
        domain: PILOT_DOMAIN, slug: 'pinturas-gabriel', gsc_property: PILOT_PROPERTY,
        github_repo: null, auto_approve: false, auto_approve_tools: false, publish_target: 'manual'
      };
      return { snapshots: [snapshot('2026-09-19', 3, 30, 7)] };
    }
  };
  const dir = mkdtempSync(join(tmpdir(), 'gabi-pilot-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'state.json');
  const repo = new PilotRepository(motor, 'upstream-token', async () => { synced += 1; }, file);
  await repo.refresh();
  assert.deepEqual(calls, ['get_project', 'get_site_stats']);
  assert.equal(synced, 1);
  assert.equal(repo.view().state, 'ready');
  assert.equal(JSON.stringify(readFileSync(file, 'utf8')).includes('upstream-token'), false);
});

test('pilot refuses a corrupted saved projection before exposing local observations', t => {
  const dir = mkdtempSync(join(tmpdir(), 'gabi-pilot-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'state.json');
  writeFileSync(file, JSON.stringify({ siteId: PILOT_ID, projection: { capturedAt: 'not-a-projection' }, evidence: [] }));
  const motor: MotorReader = { async read() { throw new Error('not called'); } };
  assert.throws(() => new PilotRepository(motor, 'upstream-token', async () => undefined, file), /Invalid local pilot state/);
});
