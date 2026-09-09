import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { payloadSchema } from './gabi/contracts.js';
import { createService, errorResult, type Authenticator, type Repository } from './gabi/service.js';

export function bearerToken(header: string | undefined) { return /^Bearer ([a-f0-9]{64})$/.exec(header ?? '')?.[1]; }
export function protocolError(message: string, code = -32000) { return { jsonrpc: '2.0', id: null, error: { code, message } }; }
const definitions = [
  { name: 'gabi_site_read', operation: 'site.read', description: 'Lee el sitio vinculado a tu credencial Gabi. No acepta otro sitio ni conexión.' },
  { name: 'gabi_ideas_list', operation: 'ideas.list', description: 'Lee ideas del sitio autorizado, hasta 100. Cursor no disponible. El adaptador DispatchSEO de laboratorio admite pending (por defecto) o rejected; otros estados se rechazan.' },
  { name: 'gabi_evidence_read', operation: 'evidence.read', description: 'Lee una evidencia existente del sitio autorizado por su ID. No inicia una captura ni consulta proveedores nuevos.' }
] as const;
const tools: Tool[] = definitions.map(({ name, operation, description }) => ({
  name, description, inputSchema: payloadSchema(operation) as Tool['inputSchema'],
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}));

function localOriginAllowed(app: FastifyInstance, request: FastifyRequest) {
  const address = app.server.address();
  if (!address || typeof address === 'string') return false;
  const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
  return hosts.includes(request.headers.host ?? '') &&
    (request.headers.origin === undefined || hosts.map(host => `http://${host}`).includes(request.headers.origin));
}

export function registerMcp(app: FastifyInstance, auth: Authenticator, repo: Repository) {
  const execute = createService(auth, repo);
  app.route({
    method: ['POST', 'GET', 'DELETE'], url: '/mcp',
    onRequest: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!localOriginAllowed(app, request)) return reply.code(403).send(protocolError('Origin or host not allowed'));
      if (request.url !== '/mcp') return reply.code(400).send(protocolError('Query parameters are not supported'));
      try {
        if (!await auth.authenticate(bearerToken(request.headers.authorization))) {
          return reply.header('WWW-Authenticate', 'Bearer realm="gabi-local"').code(401).send(protocolError('Authentication required', -32001));
        }
      } catch { return reply.code(503).send(protocolError('Authentication dependency unavailable')); }
      if (request.method !== 'POST') return reply.header('Allow', 'POST').code(405).send(protocolError('Method not allowed'));
    },
    handler: async (request, reply) => {
      // No batches or retained sessions: every request gets an authenticated closure.
      if (Array.isArray(request.body)) return reply.code(400).send(protocolError('Batch requests are not supported', -32600));
      const token = bearerToken(request.headers.authorization);
      const server = new Server({ name: 'gabi-seo', version: '0.1.0' }, { capabilities: { tools: {} } });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
      server.setRequestHandler(CallToolRequestSchema, async request => {
        const definition = definitions.find(item => item.name === request.params.name);
        const result = definition ? await execute(token, {
          record_type: 'Command', schema_version: '1.0.0', request_id: randomUUID(),
          operation: definition.operation, payload: request.params.arguments ?? {}
        }) : errorResult('not_found_or_forbidden');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result.body) }],
          structuredContent: { result: result.body }, isError: result.status !== 200
        };
      });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await server.connect(transport);
        // The SDK writes the finite JSON-RPC response; Fastify has already bounded and parsed the body.
        reply.hijack();
        reply.raw.setHeader('Cache-Control', 'no-store');
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch {
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          reply.raw.end(JSON.stringify(protocolError('Internal server error', -32603)));
        } else if (!reply.raw.writableEnded) reply.raw.end();
      } finally { await server.close().catch(() => undefined); }
    }
  });
}
