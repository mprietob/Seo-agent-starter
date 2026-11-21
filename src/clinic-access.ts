import { timingSafeEqual } from 'node:crypto';

export function clinicBindHost(env: NodeJS.ProcessEnv = process.env) {
  const host = env.GABI_BIND_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(host)) throw new Error('GABI_BIND_HOST inválido');
  if (host === '0.0.0.0' && !env.GABI_DASHBOARD_PASSWORD) throw new Error('El panel público requiere GABI_DASHBOARD_PASSWORD');
  return host;
}
export function clinicAuthorized(header: string | undefined, password: string | undefined) {
  if (!password) return true;
  if (!header?.startsWith('Basic ')) return false;
  let decoded: string;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const expected = `gabi:${password}`, received = Buffer.from(decoded), wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

// A local approval changes only the private queue, but it is still protected
// against cross-site form submissions. Reverse proxies preserve Host for this.
export function clinicSameOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
  } catch { return false; }
}
