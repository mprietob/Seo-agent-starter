import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DispatchRepository } from '../src/integrations/dispatch.js';
import { DispatchMcpReader, type MotorReader, type ReadTool } from '../src/integrations/dispatch-mcp.js';
import { validates, type Row } from '../src/gabi/contracts.js';

function setup() {
  const site = JSON.parse(readFileSync(new URL('../../contracts/v1/examples/site.json', import.meta.url), 'utf8'));
  const project: Row = { name: 'Mock project', slug: 'a', domain: site.domain, auto_approve: false, auto_approve_tools: false, publish_target: 'manual', github_repo: null, gsc_property: null };
  const idea: Row = { id: '20000000-0000-4000-8000-000000000001', project_id: 'upstream-a', type: 'guide', title: 'Read-only idea', rationale: null, created_at: '2026-09-09T12:00:00+00:00', status: 'pending', secret: 'never-project-this' };
  const stats: Row = { snapshots: [{ project_id: 'upstream-a', date: '2026-09-09', clicks: 12, impressions: 120, top_queries: ['never-project-this'] }] };
  const calls: ReadTool[] = [];
  const motor: MotorReader = { async read(_token, tool) { calls.push(tool); return tool === 'get_project' ? project : tool === 'get_suggestions' ? [idea] : stats; } };
  const repo = new DispatchRepository(motor, [{ site, projectId: 'upstream-a', slug: 'a', token: async () => 'fake' }]);
  return { site, project, idea, stats, repo, calls };
}

test('adapter projects allowed fields and tracks changes within its lifetime', async () => {
  const { repo, site, idea } = setup();
  const first = await repo.ideas(site.site_id);
  assert.equal(validates('Idea', first[0]), true);
  assert.equal(JSON.stringify(first).includes('never-project-this'), false);
  assert.equal(first[0]!.revision, 1);
  assert.equal((await repo.ideas(site.site_id))[0]!.revision, 1);
  idea.title = 'Changed title';
  assert.equal((await repo.ideas(site.site_id))[0]!.revision, 2);
  assert.deepEqual(first[0]!.evidence_refs, []);
});

test('misbound project or foreign suggestion cannot be normalized', async () => {
  const { repo, site, project, idea } = setup();
  idea.project_id = 'foreign';
  await assert.rejects(() => repo.ideas(site.site_id), { code: 'invalid_upstream_response' });
  project.slug = 'foreign';
  await assert.rejects(() => repo.site(site.site_id), { code: 'invalid_upstream_response' });
});

test('configured providers and automatic approval block metrics before calling the tool', async () => {
  for (const field of ['gsc_property', 'github_repo', 'auto_approve', 'auto_approve_tools']) {
    const { repo, site, project, calls } = setup();
    project[field] = field.startsWith('auto_') ? true : 'foreign-resource';
    await assert.rejects(() => repo.captureEvidence(site.site_id), { code: 'not_found_or_forbidden' });
    assert.deepEqual(calls, ['get_project']);
  }
});

test('evidence is an immutable scoped capture with minimized fields', async () => {
  const { repo, site, stats } = setup();
  const evidence = await repo.captureEvidence(site.site_id);
  assert.equal(validates('Evidence', evidence), true);
  assert.equal(JSON.stringify(evidence).includes('never-project-this'), false);
  assert.equal(evidence.freshness, 'unknown');
  stats.snapshots = [];
  assert.deepEqual(await repo.evidence(site.site_id, String(evidence.evidence_id)), evidence);
  assert.equal(await repo.evidence(site.site_id, 'foreign-id'), undefined);
  await assert.rejects(() => repo.captureEvidence(site.site_id), { code: 'dependency_unavailable' });
});

test('foreign and malformed metrics fail closed', async () => {
  for (const snapshot of [
    { project_id: 'foreign', date: '2026-09-09', clicks: 1, impressions: 2 },
    { project_id: 'upstream-a', date: '2026-09-09', clicks: '12', impressions: 2 }
  ]) {
    const { repo, site, stats } = setup(); stats.snapshots = [snapshot];
    await assert.rejects(() => repo.captureEvidence(site.site_id), { code: 'invalid_upstream_response' });
  }
});

test('unsupported approval states never reach upstream', async () => {
  const { repo, site, calls } = setup();
  await assert.rejects(() => repo.ideas(site.site_id, 'approved'), { code: 'invalid_request' });
  assert.deepEqual(calls, []);
});

test('transport refuses remote URLs, credential URLs and unknown tools', async () => {
  for (const url of ['https://example.org/api/mcp', 'http://user:pass@127.0.0.1/api/mcp', 'http://127.0.0.1/api/mcp?key=fake']) assert.throws(() => new DispatchMcpReader(url));
  await assert.rejects(() => new DispatchMcpReader().read('fake', 'merge_pr' as ReadTool), { code: 'not_found_or_forbidden' });
});

test('SDK transport handles tool errors, invalid JSON, redirects and oversized replies safely', async t => {
  let mode = 'normal';
  const server = createServer(async (request, response) => {
    let data = ''; for await (const chunk of request) data += chunk;
    const message = JSON.parse(data);
    if (!('id' in message)) { response.writeHead(202); response.end(); return; }
    if (mode === 'timeout') return;
    if (mode === 'redirect') { response.writeHead(302, { location: 'http://127.0.0.1:1/never' }); response.end(); return; }
    if (mode === 'oversize') { response.writeHead(200); response.end('x'.repeat(1024 * 1024 + 1)); return; }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { content: [{ type: 'text', text: mode === 'invalid-json' ? 'not JSON' : '{"ok":true}' }], ...(mode === 'tool-error' ? { isError: true } : {}) };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const motor = new DispatchMcpReader(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mcp`);
  assert.deepEqual(await motor.read('fake', 'get_project'), { ok: true });
  for (const [next, code] of [['tool-error', 'dependency_unavailable'], ['invalid-json', 'invalid_upstream_response'], ['redirect', 'dependency_unavailable'], ['oversize', 'invalid_upstream_response'], ['timeout', 'dependency_unavailable']]) {
    mode = next!;
    await assert.rejects(() => motor.read('fake', 'get_project'), { code });
  }
});
