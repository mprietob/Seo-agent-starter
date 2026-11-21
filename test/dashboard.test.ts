import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http.js';
import { registerDemoDashboard } from '../src/dashboard.js';
import { LocalAuthenticator, SyntheticRepository } from '../src/integrations/synthetic.js';

async function setup(t: TestContext) {
  const auth = new LocalAuthenticator(), repo = new SyntheticRepository();
  const app = createApp(auth, repo);
  registerDemoDashboard(app, auth, repo);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  async function post(path: string, body: unknown, cookie = '', origin: string | null = address) {
    return fetch(`${address}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), Cookie: cookie },
      body: JSON.stringify(body)
    });
  }
  async function session(index: string, cookie = '') {
    const response = await post('/dashboard/session', { site: index }, cookie);
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie')!;
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/dashboard']) assert.equal(header.includes(flag), true);
    assert.deepEqual(await response.json(), { ok: true });
    return header.split(';')[0]!;
  }
  const command = (operation = 'site.read', payload = {}) => ({ record_type: 'Command', schema_version: '1.0.0', request_id: randomUUID(), operation, payload });
  return { auth, repo, app, address, post, session, command };
}

test('dashboard is opt-in and only accepts a synthetic backend', async () => {
  const auth = new LocalAuthenticator(), repo = new SyntheticRepository();
  const app = createApp(auth, repo);
  assert.throws(() => registerDemoDashboard(app, auth, {} as SyntheticRepository));
  assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/dashboard/config' })).statusCode, 404);
  await app.close();
});

test('dashboard serves local assets with CSP and no credential in configuration', async t => {
  const { address } = await setup(t);
  for (const path of ['/', '/dashboard.js', '/dashboard.css']) {
    const response = await fetch(`${address}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  const response = await fetch(`${address}/dashboard/config`);
  const config = await response.json() as { mode: string; sites: object[] };
  assert.equal(config.mode, 'synthetic');
  assert.deepEqual(config.sites.map(site => Object.keys(site).sort()), [['key', 'label'], ['key', 'label']]);
});

test('demo selection keeps reads scoped and revokes the previous browser grant', async t => {
  const { repo, session, post, command } = await setup(t);
  const [a, b] = [...repo.sites.keys()] as [string, string];
  const cookieA = await session('0');
  const aResponse = await post('/dashboard/read', command(), cookieA);
  assert.equal(aResponse.status, 200);
  assert.equal((await aResponse.json() as { site_id: string }).site_id, a);
  const foreign = await post('/dashboard/read', command('evidence.read', { evidence_id: repo.evidenceRows.get(b)![0]!.evidence_id }), cookieA);
  assert.equal(foreign.status, 404);
  const cookieB = await session('1', cookieA);
  assert.equal((await post('/dashboard/read', command(), cookieA)).status, 401);
  assert.equal((await (await post('/dashboard/read', command(), cookieB)).json() as { site_id: string }).site_id, b);
});

test('browser routes reject cross-origin requests, unknown selections and unauthenticated reads', async t => {
  const { repo, post, command } = await setup(t);
  assert.equal((await post('/dashboard/session', { site: '0' }, '', 'https://untrusted.example')).status, 403);
  assert.equal((await post('/dashboard/session', { site: '0' }, '', null)).status, 403);
  assert.equal((await post('/dashboard/session', { site: [...repo.sites.keys()][0] })).status, 400);
  assert.equal((await post('/dashboard/session', { site: '0', actor: 'owner' })).status, 400);
  assert.equal((await post('/dashboard/read', command())).status, 401);
});

test('browser reads use the existing validation, suspension and dependency policy', async t => {
  const { repo, post, session, command } = await setup(t);
  const cookie = await session('0');
  const siteId = [...repo.sites.keys()][0]!;
  assert.equal((await post('/dashboard/read', { ...command(), site_id: siteId }, cookie)).status, 400);
  repo.sites.get(siteId)!.status = 'suspended';
  assert.equal((await post('/dashboard/read', command(), cookie)).status, 404);
  repo.site = async () => { throw new Error('provider-secret-sentinel'); };
  const error = await post('/dashboard/read', command(), cookie);
  assert.equal(error.status, 503);
  assert.equal((await error.text()).includes('provider-secret-sentinel'), false);
});

test('closing the view revokes its cookie without revoking independent MCP access', async t => {
  const { auth, repo, post, session, command } = await setup(t);
  const token = auth.issue([...repo.sites.keys()][0]!);
  const cookie = await session('0');
  const response = await post('/dashboard/logout', {}, cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie')?.includes('Max-Age=0'), true);
  assert.equal((await post('/dashboard/read', command(), cookie)).status, 401);
  assert.notEqual(await auth.authenticate(token), undefined);
});
