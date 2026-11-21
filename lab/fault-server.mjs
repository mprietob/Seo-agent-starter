// Test-only database fault injector and provider doubles. No credential logs.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
let mode = 'normal';
let events = [];
const credentials = new Map();
const accessToken = randomBytes(32).toString('hex');
function credentialLabel(value) {
  if (!value) return 'none';
  if (!credentials.has(value)) credentials.set(value, `synthetic-${credentials.size + 1}`);
  return credentials.get(value);
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://faults:8080');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (url.pathname === '/control') {
      if (req.method === 'POST') {
        const command = JSON.parse(body.toString());
        if (!['normal','db-503','db-disconnect','missing-column','missing-table'].includes(command.mode)) return json(res, 400, {});
        mode = command.mode; events = [];
      }
      return json(res, 200, { mode, events });
    }
    if (url.pathname.startsWith('/db/')) {
      if (mode === 'db-disconnect') return req.socket.destroy();
      if (mode === 'db-503') return json(res, 503, { code: 'LAB503', message: 'Synthetic database unavailable' });
      if (url.pathname === '/db/projects') {
        if (mode === 'missing-table') return json(res, 404, { code: '42P01', message: 'relation projects does not exist' });
        if (mode === 'missing-column' && url.searchParams.get('select')?.includes('ai_choice')) {
          return json(res, 400, { code: '42703', message: 'column projects.ai_choice does not exist' });
        }
      }
      const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.connection;
      const upstream = await fetch(`http://postgrest:3000${url.pathname.slice(3)}${url.search}`, { method: req.method, headers, ...(body.length ? { body } : {}), signal: AbortSignal.timeout(8000) });
      const outHeaders = {}; for (const k of ['content-type','content-range','preference-applied']) if (upstream.headers.has(k)) outHeaders[k] = upstream.headers.get(k);
      res.writeHead(upstream.status, outHeaders); return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    if (url.pathname.startsWith('/provider/')) {
      const path = url.pathname.replace(/^\/provider\/(github|google)/, '');
      const provider = url.pathname.includes('/github/') ? 'github' : 'google';
      // Retain only fixture resource paths and opaque equality labels.
      events.push({ provider, method: req.method, path: decodeURIComponent(path), credential: credentialLabel(req.headers.authorization) });
      if (provider === 'google') {
        if (path.endsWith('/token')) return json(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
        if (req.headers.authorization !== `Bearer ${accessToken}`) return json(res, 403, { error: { code: 403, message: 'Synthetic token rejected' } });
        if (path.includes('/searchAnalytics/query')) return json(res, 200, { rows: [{ keys: ['synthetic-query'], clicks: 17, impressions: 170, ctr: 0.1, position: 1 }] });
      } else {
        if (!req.headers.authorization) return json(res, 403, { message: 'Synthetic token required' });
        const match = path.match(/^\/repos\/(gabi-lab-fixture\/site-[ab])/);
        if (match && path.endsWith('/pulls')) return json(res, 200, [{ number: 7, title: 'Synthetic B PR', html_url: 'https://site-b.example/pr/7', created_at: '2026-09-09T00:00:00Z', labels: [{ name: 'seo' }] }]);
        if (match && path.endsWith('/contents')) return json(res, 200, []);
        if (match && path.endsWith('/commits')) return json(res, 200, [{ sha: '0000000000000000000000000000000000000000' }]);
        if (match && path === `/repos/${match[1]}`) return json(res, 200, { full_name: match[1], default_branch: 'main', permissions: { pull: true, push: true } });
      }
      return json(res, 404, { error: 'Unimplemented fixture endpoint' });
    }
    json(res, 404, {});
  } catch { if (!res.headersSent) json(res, 502, { error: 'Laboratory proxy error' }); else res.end(); }
}).listen(8080, '0.0.0.0');
