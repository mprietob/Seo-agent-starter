import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/http.js';
import { LocalAuthenticator } from '../dist/src/integrations/synthetic.js';
import { DispatchRepository } from '../dist/src/integrations/dispatch.js';
import { DispatchMcpReader } from '../dist/src/integrations/dispatch-mcp.js';
const docker = process.env.GABI_LAB_DOCKER ?? `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const compose = ['compose', '--env-file', '.env.lab', '-f', 'lab/compose.yaml'];
function fixtures(action) {
  const input = `const action = ${JSON.stringify(action)};\n${readFileSync('lab/facade-fixtures.mjs', 'utf8')}`;
  return JSON.parse(execFileSync(docker, [...compose, 'exec', '-T', 'app', 'node', '--input-type=module'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }));
}
function database(action) { execFileSync(docker, [...compose, action, 'postgrest'], { stdio: 'pipe', timeout: 30000 }); }
const report = { captured_at: new Date().toISOString(), upstream_commit: 'fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26', sdk: '1.30.0', tests: [] };
let app;
let stopped = false;
async function check(id, fn) {
  try { await fn(); report.tests.push({ id, status: 'pass' }); }
  catch (error) { report.tests.push({ id, status: 'fail', error_type: error.name }); throw error; }
}
try {
  const sha = execFileSync('git', ['-C', '../dispatchseo-lab-upstream', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sha, report.upstream_commit);
  assert.equal(execFileSync('git', ['-C', '../dispatchseo-lab-upstream', 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
  const sites = fixtures({ kind: 'seed' });
  const before = fixtures({ kind: 'inspect' });
  const connections = sites.map(site => ({
    projectId: site.id, slug: site.slug, token: async () => site.token,
    site: { record_type: 'Site', schema_version: '1.0.0', site_id: randomUUID(), revision: 1, name: site.name,
      domain: site.domain, timezone: 'Europe/Madrid', status: 'active', created_at: new Date(site.created_at).toISOString() }
  }));
  const motor = new DispatchMcpReader();
  const repo = new DispatchRepository(motor, connections);
  const auth = new LocalAuthenticator();
  const tokens = connections.map(connection => auth.issue(connection.site.site_id));
  app = createApp(auth, repo);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const call = async (index, operation, payload = {}, extra = {}) => {
    const response = await fetch(`${address}/v1/commands`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_type: 'Command', schema_version: '1.0.0', request_id: '00000000-0000-4000-8000-000000000099', operation, payload, ...extra }),
      signal: AbortSignal.timeout(25000)
    });
    const body = await response.json();
    for (const secret of [...tokens, ...sites.map(site => site.token)]) assert.equal(JSON.stringify(body).includes(secret), false);
    return { status: response.status, body };
  };
  await check('site-and-ideas-both-directions', async () => {
    for (const index of [0, 1]) {
      const site = await call(index, 'site.read');
      assert.equal(site.status, 200); assert.equal(site.body.domain, sites[index].domain);
      const ideas = await call(index, 'ideas.list', { status: 'pending' });
      assert.equal(ideas.status, 200); assert.ok(ideas.body.length > 0);
      assert.ok(ideas.body.every(idea => idea.site_id === connections[index].site.site_id));
      assert.ok(ideas.body.some(idea => idea.idea_id === `20000000-0000-4000-8000-00000000000${index + 1}`));
    }
  });
  await check('snapshot-evidence-and-cross-site-denial', async () => {
    const evidence = [];
    for (const index of [0, 1]) {
      const row = await repo.captureEvidence(connections[index].site.site_id);
      evidence.push(row);
      assert.ok(row.summary.includes(`${(index + 1) * 111} clics`));
      const result = await call(index, 'evidence.read', { evidence_id: row.evidence_id });
      assert.equal(result.status, 200); assert.deepEqual(result.body, row);
    }
    for (const index of [0, 1]) {
      const other = await call(index, 'evidence.read', { evidence_id: evidence[1 - index].evidence_id });
      const missing = await call(index, 'evidence.read', { evidence_id: randomUUID() });
      assert.equal(other.status, 404); assert.deepEqual(other, missing);
    }
  });
  await check('concurrent-contexts', async () => {
    await Promise.all(Array.from({ length: 10 }, async (_, i) => {
      const index = i % 2; const result = await call(index, 'site.read');
      assert.equal(result.status, 200); assert.equal(result.body.domain, sites[index].domain);
    }));
  });
  await check('injected-site-and-proposal-denied', async () => {
    assert.equal((await call(0, 'site.read', {}, { site_id: connections[1].site.site_id })).status, 400);
    const proposal = JSON.parse(readFileSync('contracts/v1/examples/command_propose.json', 'utf8'));
    assert.equal((await call(0, proposal.operation, proposal.payload, { idempotency_key: proposal.idempotency_key })).status, 404);
    assert.equal((await call(0, 'ideas.list', { status: 'approved' })).status, 400);
  });
  await check('misbound-upstream-token-denied', async () => {
    const wrong = new DispatchRepository(motor, [{ ...connections[0], token: connections[1].token }]);
    await assert.rejects(() => wrong.site(connections[0].site.site_id), error => error.code === 'invalid_upstream_response');
  });
  await check('database-outage-fails-closed-and-recovers', async () => {
    database('stop'); stopped = true;
    const failed = await call(0, 'site.read');
    assert.equal(failed.status, 503); assert.equal(failed.body.code, 'dependency_unavailable');
    database('start'); stopped = false;
    // A single bounded readiness check, not retries of a business operation.
    for (let attempt = 0; attempt < 10; attempt++) {
      try { fixtures({ kind: 'inspect' }); break; } catch { if (attempt === 9) throw new Error('Database recovery failed'); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.equal((await call(0, 'site.read')).status, 200);
  });
  await check('upstream-token-revocation-is-not-user-auth-failure', async () => {
    fixtures({ kind: 'revoke', id: sites[0].id });
    const result = await call(0, 'site.read');
    assert.equal(result.status, 503); assert.equal(result.body.code, 'dependency_unavailable');
    assert.equal((await call(1, 'site.read')).status, 200);
  });
  await check('gabi-token-revocation', async () => {
    auth.revoke(tokens[1]); assert.equal((await call(1, 'site.read')).status, 401);
  });
  await check('no-idea-or-provider-configuration-mutations', async () => {
    assert.deepEqual(fixtures({ kind: 'inspect' }), before);
  });
} catch (error) {
  report.fatal = error.name;
  process.exitCode = 1;
} finally {
  if (stopped) { try { database('start'); } catch { report.cleanup_error = 'database-restart'; process.exitCode = 1; } }
  await app?.close();
  writeFileSync('docs/spikes/gabi-dispatch-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
