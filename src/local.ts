import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from './http.js';
import { LocalAuthenticator, SyntheticRepository } from './integrations/synthetic.js';
import { registerDemoDashboard } from './dashboard.js';

const repo = new SyntheticRepository();
const auth = new LocalAuthenticator();
const grants = [...repo.sites.keys()].map(siteId => ({ site_id: siteId, token: auth.issue(siteId) }));
const app = createApp(auth, repo);
registerDemoDashboard(app, auth, repo);
await app.listen({ host: '127.0.0.1', port: 4406 });
mkdirSync('.local', { recursive: true });
writeFileSync('.local/synthetic-access.json', JSON.stringify(grants, null, 2), { mode: 0o600 });
console.log('Gabi SEO: http://127.0.0.1:4406 — panel de demostración, HTTP y MCP. Sin proveedores conectados.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
