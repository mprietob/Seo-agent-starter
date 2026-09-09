import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createApp } from '../src/http.js';
import { validates, type Row } from '../src/gabi/contracts.js';
import { LocalAuthenticator, SyntheticRepository } from '../src/integrations/synthetic.js';
import { createService } from '../src/gabi/service.js';

const base = new URL('../../contracts/v1/', import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, base), 'utf8'));
const command = (operation = 'site.read', payload: Row = {}) => ({ ...read('examples/command_site.json'), operation, payload });
function setup() {
  const repo = new SyntheticRepository();
  const auth = new LocalAuthenticator();
  const [a, b] = [...repo.sites.keys()] as [string, string];
  const tokenA = auth.issue(a), tokenB = auth.issue(b);
  return { repo, auth, a, b, tokenA, tokenB, app: createApp(auth, repo) };
}

test('Ajv agrees with the existing 14 valid examples and 27 invalid mutations', () => {
  for (const file of readdirSync(new URL('examples/', base))) {
    const row = read(`examples/${file}`);
    assert.equal(validates(row.record_type, row), true, file);
    assert.equal(validates('Command', row), row.record_type === 'Command', `ingress ${file}`);
  }
  for (const mutation of read('invalid-cases.json')) {
    const row = read(`examples/${mutation.base}.json`);
    let parent = row;
    for (const key of mutation.path.slice(0, -1)) parent = parent[key];
    if (mutation.remove) delete parent[mutation.path.at(-1)];
    else parent[mutation.path.at(-1)] = mutation.value;
    assert.equal(validates(row.record_type, row), false, mutation.name);
  }
});

test('both credentials read only their site and receive schema-valid outputs', async t => {
  const { app, a, b, tokenA, tokenB } = setup();
  t.after(() => app.close());
  for (const [token, site] of [[tokenA, a], [tokenB, b]]) {
    const response = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${token}` }, payload: command() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().site_id, site);
    assert.equal(validates('Site', response.json()), true);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.includes(token!), false);
  }
});

test('foreign and nonexistent evidence have the same public error', async t => {
  const { app, repo, b, tokenA } = setup();
  t.after(() => app.close());
  const foreign = repo.evidenceRows.get(b)![0]!.evidence_id;
  const replies = [];
  for (const id of [foreign, '00000000-0000-4000-8000-000000000099']) {
    const reply = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}` }, payload: command('evidence.read', { evidence_id: id }) });
    assert.equal(reply.statusCode, 404);
    assert.equal(validates('Error', reply.json()), true);
    replies.push(reply.json());
  }
  assert.deepEqual(replies[0], replies[1]);
});

test('missing, unknown and revoked credentials cannot access data', async t => {
  const { app, auth, tokenA } = setup();
  t.after(() => app.close());
  auth.revoke(tokenA);
  for (const authorization of ['', `Bearer ${'0'.repeat(64)}`, `Bearer ${tokenA}`]) {
    const reply = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization }, payload: command() });
    assert.equal(reply.statusCode, 401);
    assert.equal(reply.json().code, 'unauthenticated');
    assert.equal(reply.body.includes(tokenA), false);
  }
});

test('suspension blocks every supported read', async t => {
  const { app, repo, a, tokenA } = setup();
  t.after(() => app.close());
  repo.sites.get(a)!.status = 'suspended';
  for (const body of [command(), command('ideas.list'), command('evidence.read', { evidence_id: repo.evidenceRows.get(a)![0]!.evidence_id })]) {
    const reply = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}` }, payload: body });
    assert.equal(reply.statusCode, 404);
  }
});

test('proposal is denied and extra fields, coercion, cursors and merge are rejected', async t => {
  const { app, tokenA } = setup();
  t.after(() => app.close());
  const cases = [
    [read('examples/command_propose.json'), 404],
    [{ ...command(), site_id: 'other' }, 400],
    [{ ...command(), actor: { actor_type: 'human' } }, 400],
    [command('ideas.list', { limit: '1' }), 400],
    [command('ideas.list', { cursor: 'not-supported' }), 400],
    [command('publication.merge'), 400],
    [read('examples/approval.json'), 400]
  ] as const;
  for (const [payload, expected] of cases) {
    const reply = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}` }, payload });
    assert.equal(reply.statusCode, expected);
    assert.equal(validates('Error', reply.json()), true);
  }
});

test('ideas filter/limit and own evidence work without crossing tenants', async t => {
  const { app, repo, a, tokenA } = setup();
  t.after(() => app.close());
  for (const status of ['pending', 'rejected']) {
    const response = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}` }, payload: command('ideas.list', { status, limit: 1 }) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().length, status === 'pending' ? 1 : 0);
    for (const row of response.json()) assert.equal(row.site_id, a);
  }
  const response = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}` }, payload: command('evidence.read', { evidence_id: repo.evidenceRows.get(a)![0]!.evidence_id }) });
  assert.equal(response.statusCode, 200);
  assert.equal(validates('Evidence', response.json()), true);
});

test('dependency failure never falls back or discloses exception text', async () => {
  const { auth, repo, tokenA, app } = setup();
  await app.close();
  repo.site = async () => { throw new Error('fake-provider-secret'); };
  const result = await createService(auth, repo)(tokenA, command());
  assert.equal(result.status, 503);
  assert.equal((result.body as Row).code, 'dependency_unavailable');
  assert.equal(JSON.stringify(result).includes('fake-provider-secret'), false);
});

test('malformed or foreign repository outputs are blocked', async () => {
  const { auth, repo, a, b, tokenA, app } = setup();
  await app.close();
  const execute = createService(auth, repo);
  repo.ideaRows.set(a, repo.ideaRows.get(b)!);
  assert.equal((await execute(tokenA, command('ideas.list'))).status, 502);
  repo.sites.get(a)!.extra = 'secret-sentinel';
  const result = await execute(tokenA, command());
  assert.equal(result.status, 502);
  assert.equal(JSON.stringify(result).includes('secret-sentinel'), false);
});

test('revocation while a read is pending blocks the response', async () => {
  const { auth, repo, tokenA, app } = setup();
  await app.close();
  const original = repo.site.bind(repo);
  repo.site = async id => { const row = await original(id); auth.revoke(tokenA); return row; };
  assert.equal((await createService(auth, repo)(tokenA, command())).status, 401);
});

test('malformed and oversized HTTP bodies return redacted contract errors', async t => {
  const { app, tokenA } = setup();
  t.after(() => app.close());
  for (const payload of ['{"broken":', JSON.stringify({ padding: 'x'.repeat(17000) })]) {
    const reply = await app.inject({ method: 'POST', url: '/v1/commands', headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' }, payload });
    assert.equal(reply.statusCode, 400);
    assert.equal(validates('Error', reply.json()), true);
    assert.equal(reply.body.includes('broken'), false);
  }
});

test('real loopback HTTP serves authenticated synthetic data', async t => {
  const { app, tokenA, a } = setup();
  t.after(() => app.close());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(`${address}/v1/commands`, {
    method: 'POST', headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    body: JSON.stringify(command()), signal: AbortSignal.timeout(5000)
  });
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as Row).site_id, a);
});
