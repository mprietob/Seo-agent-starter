import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { SyntheticRepository, LocalAuthenticator } from '../src/integrations/synthetic.js';
import { validates, type Row } from '../src/gabi/contracts.js';

async function setup(t: TestContext) {
  const repo = new SyntheticRepository(), auth = new LocalAuthenticator();
  const [a, b] = [...repo.sites.keys()] as [string, string];
  const tokenA = auth.issue(a), tokenB = auth.issue(b);
  const app = createApp(auth, repo);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const clients: Client[] = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); await app.close(); });
  async function connect(token: string) {
    const client = new Client({ name: 'gabi-test', version: '1' });
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(new URL(`${address}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    await client.connect(transport);
    assert.equal(transport.sessionId, undefined);
    return client;
  }
  return { repo, auth, a, b, tokenA, tokenB, app, address, connect };
}
async function call(client: Client, name: string, args: Row = {}) {
  const response = await client.callTool({ name, arguments: args });
  const text = (response.content as { type: string; text: string }[])[0]!.text;
  const body = JSON.parse(text);
  assert.deepEqual(response.structuredContent, { result: body });
  return { body, failed: response.isError };
}

test('official MCP client discovers exactly three schema-backed read tools', async t => {
  const { connect, tokenA } = await setup(t);
  const client = await connect(tokenA);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['gabi_site_read', 'gabi_ideas_list', 'gabi_evidence_read']);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(JSON.stringify(tool).includes('#/$defs/'), false);
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(JSON.stringify(tool).includes(tokenA), false);
  }
});

test('MCP and HTTP return identical site, ideas and evidence for the same credential', async t => {
  const { app, connect, tokenA, a, repo } = await setup(t);
  const client = await connect(tokenA);
  const cases: [string, string, Row][] = [
    ['gabi_site_read', 'site.read', {}],
    ['gabi_ideas_list', 'ideas.list', { status: 'pending', limit: 1 }],
    ['gabi_evidence_read', 'evidence.read', { evidence_id: repo.evidenceRows.get(a)![0]!.evidence_id }]
  ];
  for (const [name, operation, payload] of cases) {
    const result = await call(client, name, payload);
    const http = await app.inject({ method: 'POST', url: '/v1/commands', headers: { Authorization: `Bearer ${tokenA}` }, payload: {
      record_type: 'Command', schema_version: '1.0.0', request_id: randomUUID(), operation, payload
    } });
    assert.equal(result.failed, false);
    assert.equal(http.statusCode, 200);
    assert.deepEqual(result.body, http.json());
  }
});

test('concurrent MCP clients retain separate sites and cannot read foreign evidence', async t => {
  const { connect, tokenA, tokenB, a, b, repo } = await setup(t);
  const clients = await Promise.all([connect(tokenA), connect(tokenB)]);
  const sites = [a, b];
  await Promise.all(Array.from({ length: 10 }, async (_, i) => {
    const index = i % 2;
    const result = await call(clients[index]!, 'gabi_site_read');
    assert.equal(result.body.site_id, sites[index]);
  }));
  for (const index of [0, 1]) {
    const result = await call(clients[index]!, 'gabi_evidence_read', { evidence_id: repo.evidenceRows.get(sites[1 - index]!)![0]!.evidence_id });
    assert.equal(result.failed, true);
    assert.equal(result.body.code, 'not_found_or_forbidden');
    assert.equal(validates('Error', result.body), true);
  }
});

test('MCP rejects site injection, coercion, cursors and unknown write tools', async t => {
  const { connect, tokenA, b } = await setup(t);
  const client = await connect(tokenA);
  for (const [name, args] of [
    ['gabi_site_read', { site_id: b }], ['gabi_site_read', { actor: { actor_type: 'human' } }],
    ['gabi_ideas_list', { limit: '1' }], ['gabi_ideas_list', { cursor: 'fake' }],
    ['merge_pr', {}], ['gabi_idea_propose', {}]
  ] as [string, Row][]) {
    const result = await call(client, name, args);
    assert.equal(result.failed, true);
    assert.equal(validates('Error', result.body), true);
    assert.equal(JSON.stringify(result).includes(tokenA), false);
  }
});

test('revocation blocks discovery and calls from an already initialized MCP client', async t => {
  const { connect, tokenA, auth } = await setup(t);
  const client = await connect(tokenA);
  auth.revoke(tokenA);
  await assert.rejects(() => client.listTools());
  await assert.rejects(() => call(client, 'gabi_site_read'));
});

test('MCP preserves suspension and fail-closed dependency policy', async t => {
  const { connect, tokenA, repo, a } = await setup(t);
  const client = await connect(tokenA);
  repo.sites.get(a)!.status = 'suspended';
  assert.equal((await call(client, 'gabi_site_read')).body.code, 'not_found_or_forbidden');
  repo.site = async () => { throw new Error('secret-sentinel'); };
  const error = await call(client, 'gabi_site_read');
  assert.equal(error.failed, true);
  assert.equal(error.body.code, 'dependency_unavailable');
  assert.equal(JSON.stringify(error).includes('secret-sentinel'), false);
});

test('MCP transport authenticates discovery and restricts origins, hosts, bodies and methods', async t => {
  const { address, tokenA } = await setup(t);
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  async function raw(options: { method?: string; token?: string; headers?: Record<string, string>; body?: string; query?: string } = {}) {
    const method = options.method ?? 'POST';
    return fetch(`${address}/mcp${options.query ?? ''}`, {
      method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...options.headers },
      body: method === 'POST' ? options.body ?? JSON.stringify(message) : undefined,
      signal: AbortSignal.timeout(5000)
    });
  }
  assert.equal((await raw()).status, 401);
  assert.equal((await raw({ token: '0'.repeat(64) })).status, 401);
  assert.equal((await raw({ token: tokenA, query: '?key=fake' })).status, 400);
  assert.equal((await raw({ token: tokenA, headers: { origin: 'https://untrusted.example' } })).status, 403);
  // Node fetch rewrites Host; use raw HTTP to actually exercise this guard.
  const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${address}/mcp`, { method: 'POST', headers: {
      host: 'untrusted.example', Authorization: `Bearer ${tokenA}`, 'content-type': 'application/json'
    } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end(JSON.stringify(message));
  });
  assert.equal(hostileHost, 403);
  for (const method of ['GET', 'DELETE']) assert.equal((await raw({ token: tokenA, method })).status, 405);
  for (const body of ['{"secret-sentinel":', JSON.stringify([message]), JSON.stringify({ padding: 'x'.repeat(17000) })]) {
    const reply = await raw({ token: tokenA, body });
    assert.equal(reply.status, 400);
    assert.equal((await reply.text()).includes('secret-sentinel'), false);
  }
  const reply = await raw({ token: tokenA });
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.equal(reply.headers.get('mcp-session-id'), null);
});
