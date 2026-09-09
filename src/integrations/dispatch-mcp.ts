import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Fault } from '../gabi/service.js';

export type ReadTool = 'get_project' | 'get_suggestions' | 'get_site_stats';
export interface MotorReader { read(token: string, tool: ReadTool, args?: Record<string, unknown>): Promise<unknown>; }
const allowed = new Set<ReadTool>(['get_project', 'get_suggestions', 'get_site_stats']);

// Laboratory transport only: remote hosts and redirects are intentionally unavailable.
export class DispatchMcpReader implements MotorReader {
  private readonly endpoint: URL;
  constructor(endpoint = 'http://127.0.0.1:4405/api/mcp') {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/api/mcp' || url.search || url.hash || url.username || url.password) throw new Error('Only the fixed loopback laboratory endpoint is supported');
    this.endpoint = url;
  }
  async read(token: string, tool: ReadTool, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!allowed.has(tool)) throw new Fault('not_found_or_forbidden');
    const deadline = AbortSignal.timeout(10_000);
    const client = new Client({ name: 'gabi-read-lab', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(this.endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: async (input, init) => {
        if (String(input) !== this.endpoint.href) throw new Fault('invalid_upstream_response');
        // No unsolicited server stream is needed for these finite, request/response reads.
        if (init?.method === 'GET') return new Response(null, { status: 405 });
        if (init?.method !== 'POST') throw new Fault('invalid_upstream_response');
        const signal = AbortSignal.any([deadline, ...(init.signal ? [init.signal] : [])]);
        const response = await fetch(input, { ...init, signal, redirect: 'error' });
        if (!response.ok) {
          await response.body?.cancel();
          // Upstream 401 can also mean database outage. Never label the Gabi user invalid.
          throw new Fault('dependency_unavailable');
        }
        if (!response.body) return response;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 1024 * 1024) throw new Fault('invalid_upstream_response');
            chunks.push(part.value);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
      }
    });
    try {
      await client.connect(transport, { signal: deadline, timeout: 10_000 });
      const result = await client.callTool({ name: tool, arguments: args }, undefined, { signal: deadline, timeout: 10_000 });
      if (result.isError) throw new Fault('dependency_unavailable');
      const content = result.content;
      if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text' || typeof content[0].text !== 'string') throw new Fault('invalid_upstream_response');
      try { return JSON.parse(content[0].text); }
      catch { throw new Fault('invalid_upstream_response'); }
    } catch (error) {
      throw error instanceof Fault ? error : new Fault('dependency_unavailable');
    } finally { await client.close().catch(() => undefined); }
  }
}
