import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from './http.js';
import { Fault } from './gabi/service.js';
import { DispatchMcpReader } from './integrations/dispatch-mcp.js';
import { PilotRepository, PILOT_ID } from './integrations/pilot.js';
import { LocalAuthenticator } from './integrations/synthetic.js';
import { registerPilotRefresh } from './pilot-control.js';

function required(name: string) {
  const value = process.env[name];
  if (!value || value.length > 16_384) throw new Error(`${name} must be configured locally`);
  return value;
}

const auth = new LocalAuthenticator();
const token = auth.issue(PILOT_ID);
const upstreamToken = required('PILOT_DISPATCH_TOKEN');
const syncSecret = required('PILOT_SYNC_SECRET');
const repo = new PilotRepository(
  new DispatchMcpReader('http://127.0.0.1:4407/api/mcp'),
  upstreamToken,
  async () => {
    const response = await fetch('http://127.0.0.1:4407/api/gabi-sync', {
      method: 'POST', headers: { Authorization: `Bearer ${syncSecret}` }, signal: AbortSignal.timeout(130_000)
    });
    await response.body?.cancel();
    if (!response.ok) throw new Fault('dependency_unavailable');
  },
  '.local/pilot-state.json'
);
const app = createApp(auth, repo);
registerPilotRefresh(app, auth, repo);

await app.listen({ host: '127.0.0.1', port: 4406 });
mkdirSync('.local', { recursive: true });
writeFileSync('.local/pilot-access.json', JSON.stringify([{ site_id: PILOT_ID, token }], null, 2), { mode: 0o600 });
console.log('Gabi SEO pilot: http://127.0.0.1:4406 — solo lectura; sincronización manual disponible.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
