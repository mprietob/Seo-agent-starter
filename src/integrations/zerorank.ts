import { Fault } from '../gabi/service.js';

const base = 'https://api.zerorank.ai/api/v1/';
const allowed = new Set(['prompts']);

// REST is deliberately used instead of ZeroRank's MCP endpoint. Its MCP server
// can manage and execute prompts, while this adapter permits only documented GET reads.
export class ZeroRankReader {
  private readonly endpoint: URL;

  constructor(endpoint = base) {
    const url = new URL(endpoint);
    if (url.href !== base || url.username || url.password || url.search || url.hash) {
      throw new Error('Only the fixed ZeroRank REST API base is supported');
    }
    this.endpoint = url;
  }

  async read(apiKey: string, resource: 'prompts'): Promise<unknown> {
    if (!apiKey || apiKey.length > 16_384 || !allowed.has(resource)) throw new Fault('not_found_or_forbidden');
    const url = new URL(resource, this.endpoint);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(10_000)
    }).catch(() => { throw new Fault('dependency_unavailable'); });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Fault('dependency_unavailable');
    }
    const statedLength = response.headers.get('content-length');
    if (statedLength !== null && (!/^\d+$/.test(statedLength) || Number(statedLength) > 1024 * 1024)) {
      await response.body?.cancel();
      throw new Fault('invalid_upstream_response');
    }
    try {
      if (!response.body) throw new Error('missing body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 1024 * 1024) throw new Error('oversized body');
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const value = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
      if (!value || typeof value !== 'object') throw new Error('invalid JSON shape');
      return value;
    } catch {
      throw new Fault('invalid_upstream_response');
    }
  }
}
