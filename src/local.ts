import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from './http.js';
import { LocalAuthenticator, SyntheticRepository } from './integrations/synthetic.js';

const repo = new SyntheticRepository();
const auth = new LocalAuthenticator();
const grants = [...repo.sites.keys()].map(siteId => ({ site_id: siteId, token: auth.issue(siteId) }));
const app = createApp(auth, repo);
await app.listen({ host: '127.0.0.1', port: 4406 });
mkdirSync('.local', { recursive: true });
writeFileSync('.local/synthetic-access.json', JSON.stringify(grants, null, 2), { mode: 0o600 });
console.log('Gabi sintético: HTTP /v1/commands y MCP /mcp en http://127.0.0.1:4406. Acceso efímero en .local/synthetic-access.json; sin proveedores conectados.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
