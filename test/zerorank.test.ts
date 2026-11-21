import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ZeroRankReader } from '../src/integrations/zerorank.js';

test('ZeroRank reader accepts only the fixed REST base and read-only prompt resource', async () => {
  assert.throws(() => new ZeroRankReader('https://example.org/api/v1/'));
  const reader = new ZeroRankReader();
  await assert.rejects(() => reader.read('', 'prompts'), { code: 'not_found_or_forbidden' });
  await assert.rejects(() => reader.read('key', 'answers' as 'prompts'), { code: 'not_found_or_forbidden' });
});

test('ZeroRank reader redacts failed, oversized and malformed provider replies', async t => {
  let mode = 'ok';
  const server = createServer((_request, response) => {
    if (mode === 'failure') return response.writeHead(503).end('provider-secret-sentinel');
    if (mode === 'oversized') return response.writeHead(200, { 'content-length': String(1024 * 1024 + 1) }).end('{}');
    if (mode === 'invalid') return response.writeHead(200, { 'content-length': '4' }).end('nope');
    response.writeHead(200, { 'content-length': '14', 'content-type': 'application/json' }).end('{"prompts":[]}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/`;
  // A test-only subclass keeps the production constructor's fixed HTTPS endpoint intact.
  const reader = Object.create(ZeroRankReader.prototype) as ZeroRankReader;
  Object.defineProperty(reader as object, 'endpoint', { value: new URL(endpoint) });
  assert.deepEqual(await reader.read('key', 'prompts'), { prompts: [] });
  for (const next of ['failure', 'oversized', 'invalid']) {
    mode = next;
    await assert.rejects(() => reader.read('key', 'prompts'), error => {
      assert.equal((error as { code?: string }).code, next === 'failure' ? 'dependency_unavailable' : 'invalid_upstream_response');
      assert.equal(String(error).includes('provider-secret-sentinel'), false);
      return true;
    });
  }
});
