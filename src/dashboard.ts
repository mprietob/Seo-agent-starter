import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createService, errorResult } from './gabi/service.js';
import { localOriginAllowed } from './mcp.js';
import { LocalAuthenticator, SyntheticRepository } from './integrations/synthetic.js';

const cookieName = 'gabi_demo';
function token(request: FastifyRequest) {
  return request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
// Deliberately tied to the synthetic repository; this is not a login for real sites.
export function registerDemoDashboard(app: FastifyInstance, auth: LocalAuthenticator, repo: SyntheticRepository) {
  if (!(auth instanceof LocalAuthenticator) || !(repo instanceof SyntheticRepository)) throw new Error('Dashboard demo requires synthetic data');
  const execute = createService(auth, repo);
  const sites = [...repo.sites.keys()].map((id, index) => ({ key: String(index), id, label: `Sitio de ejemplo ${String.fromCharCode(65 + index)}` }));
  const assets = [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/dashboard.css', 'style.css', 'text/css; charset=utf-8'],
    ['/dashboard.js', 'app.js', 'application/javascript; charset=utf-8']
  ];
  const securityHeaders = (reply: import('fastify').FastifyReply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  };
  app.register(async dashboard => {
    dashboard.addHook('onRequest', async (request, reply) => {
      securityHeaders(reply);
      if (!localOriginAllowed(app, request) || (request.method === 'POST' && !request.headers.origin)) return reply.code(403).send({ error: 'local_origin_required' });
    });
    for (const [url, file, type] of assets) {
      const body = readFileSync(new URL(`../../src/dashboard/${file}`, import.meta.url), 'utf8');
      dashboard.get(url!, async (_request, reply) => reply.type(type!).send(body));
    }
    dashboard.get('/dashboard/config', async () => ({ mode: 'synthetic', sites: sites.map(({ key, label }) => ({ key, label })) }));
    dashboard.post('/dashboard/session', async (request, reply) => {
      const body = request.body as { site?: unknown } | null;
      if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || typeof body.site !== 'string') return reply.code(400).send({ error: 'invalid_selection' });
      const site = sites.find(site => site.key === body.site);
      if (!site) return reply.code(400).send({ error: 'invalid_selection' });
      const previous = token(request);
      if (previous) auth.revoke(previous);
      const grant = auth.issue(site.id);
      reply.header('Set-Cookie', `${cookieName}=${grant}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=3600`);
      return { ok: true };
    });
    dashboard.post('/dashboard/read', async (request, reply) => {
      const result = await execute(token(request), request.body);
      return reply.code(result.status).send(result.body);
    });
    dashboard.post('/dashboard/logout', async (request, reply) => {
      const previous = token(request);
      if (previous) auth.revoke(previous);
      reply.header('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=0`);
      return { ok: true };
    });
    dashboard.setErrorHandler((_error, _request, reply) => {
      const result = errorResult('invalid_request');
      return reply.code(result.status).send(result.body);
    });
  });
}
