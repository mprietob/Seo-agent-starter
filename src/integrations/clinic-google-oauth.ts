import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const redirectUri = 'https://seo.inimamed.com/oauth/google/callback';
const scope = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly';
export interface GoogleConfig { clientId: string; clientSecret: string; }
export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const clientId = env.CLINIC_GOOGLE_OAUTH_CLIENT_ID, clientSecret = env.CLINIC_GOOGLE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret && clientId.length < 4096 && clientSecret.length < 4096 ? { clientId, clientSecret } : null;
}
const key = (secret: string) => createHash('sha256').update(secret).digest();
const signature = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');
export function authorizationUrl(config: GoogleConfig, secret: string) {
  const payload = `${Date.now()}.${randomBytes(16).toString('base64url')}`;
  const state = `${payload}.${signature(payload, secret)}`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', scope, access_type: 'offline', prompt: 'consent', state }).toString();
  return url.toString();
}
export function validState(state: string | undefined, secret: string) {
  if (!state) return false;
  const bits = state.split('.'); if (bits.length !== 3) return false;
  const payload = `${bits[0]}.${bits[1]}`, expected = Buffer.from(signature(payload, secret)), actual = Buffer.from(bits[2]!);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  const issued = Number(bits[0]); return Number.isSafeInteger(issued) && issued <= Date.now() && Date.now() - issued < 10 * 60_000;
}
interface Token { refresh_token?: string; access_token: string; expires_in?: number; scope?: string; }
interface Stored { iv: string; tag: string; data: string; }
export class ClinicGoogleOAuth {
  constructor(private file: string, private secret: string) {}
  connected() { return existsSync(this.file); }
  async exchange(config: GoogleConfig, code: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type':'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15_000) });
    const token = await response.json().catch(() => null) as Token | null;
    if (!response.ok || !token || typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string') throw new Error('google_oauth_failed');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(this.secret), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify({ refresh_token: token.refresh_token, scope: token.scope ?? scope, connected_at: new Date().toISOString() }), 'utf8'), cipher.final()]);
    const saved: Stored = { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') };
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(saved), { mode: 0o600 }); renameSync(`${this.file}.tmp`, this.file);
  }
  // Used only to reject corrupt encrypted state before future read-only GSC calls.
  verify() { if (!existsSync(this.file)) return false; try { const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Stored, decipher = createDecipheriv('aes-256-gcm', key(this.secret), Buffer.from(saved.iv, 'base64url')); decipher.setAuthTag(Buffer.from(saved.tag, 'base64url')); JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, 'base64url')), decipher.final()]).toString('utf8')); return true; } catch { return false; } }
  private stored() {
    if (!existsSync(this.file)) throw new Error('google_not_connected');
    const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Stored;
    const decipher = createDecipheriv('aes-256-gcm', key(this.secret), Buffer.from(saved.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(saved.tag, 'base64url'));
    const token = JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, 'base64url')), decipher.final()]).toString('utf8')) as { refresh_token?: string };
    if (typeof token.refresh_token !== 'string' || token.refresh_token.length < 20) throw new Error('google_not_connected');
    return token;
  }
  async accessToken(config: GoogleConfig, request: typeof fetch = fetch) {
    const token = this.stored();
    const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type':'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: token.refresh_token!, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15_000) });
    const result = await response.json().catch(() => null) as { access_token?: string } | null;
    if (!response.ok || !result || typeof result.access_token !== 'string') throw new Error('google_refresh_failed');
    return result.access_token;
  }
}
