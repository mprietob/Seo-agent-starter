import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http.js';
import { registerPilotRefresh } from '../src/pilot-control.js';
import { LocalAuthenticator, SyntheticRepository } from '../src/integrations/synthetic.js';
import { PILOT_ID } from '../src/integrations/pilot.js';

test('manual pilot refresh requires the local pilot credential and never exposes the failure', async t => {
  const auth = new LocalAuthenticator();
  const app = createApp(auth, new SyntheticRepository());
  let refreshes = 0;
  registerPilotRefresh(app, auth, { async refresh() { refreshes += 1; } });
  t.after(() => app.close());
  const token = auth.issue(PILOT_ID);
  assert.equal((await app.inject({ method: 'POST', url: '/pilot/refresh' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/pilot/refresh', headers: { authorization: `Bearer ${token}` } })).statusCode, 204);
  assert.equal(refreshes, 1);
});

test('manual pilot refresh fails closed when the upstream cannot synchronize', async t => {
  const auth = new LocalAuthenticator();
  const app = createApp(auth, new SyntheticRepository());
  registerPilotRefresh(app, auth, { async refresh() { throw new Error('upstream-secret-sentinel'); } });
  t.after(() => app.close());
  const token = auth.issue(PILOT_ID);
  const response = await app.inject({ method: 'POST', url: '/pilot/refresh', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.includes('upstream-secret-sentinel'), false);
});
