import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ClinicGoogleOAuth, GoogleConfig } from './clinic-google-oauth.js';

export interface GaMetric { users: number; sessions: number; engaged: number; conversions: number; }
export interface GaSnapshot { capturedAt: string; property: string; range: { start: string; end: string }; totals: GaMetric; previous: GaMetric; events: Array<{ name: string; count: number }>; }
const zero = (): GaMetric => ({ users: 0, sessions: 0, engaged: 0, conversions: 0 });
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function range(daysAgo: number) { const end = new Date(); end.setUTCDate(end.getUTCDate() - daysAgo); const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27); return { start: iso(start), end: iso(end) }; }
async function json(request: typeof fetch, url: string, token: string, init: RequestInit = {}) { const response = await request(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) }); const body = await response.json().catch(() => null) as Record<string, unknown> | null; if (!response.ok || !body) throw new Error('ga4_read_failed'); return body; }
function asNumber(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
async function report(request: typeof fetch, token: string, property: string, period: { start: string; end: string }, events = false) {
  const body = await json(request, `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, token, { method: 'POST', body: JSON.stringify(events ? { dateRanges: [{ startDate: period.start, endDate: period.end }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: '20', orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] } : { dateRanges: [{ startDate: period.start, endDate: period.end }], metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'conversions' }] }) });
  return body;
}
function metric(report: Record<string, unknown>): GaMetric { const row = (report.rows as Array<{ metricValues?: Array<{ value?: string }> }> | undefined)?.[0]; const values = row?.metricValues ?? []; return { users: asNumber(values[0]?.value), sessions: asNumber(values[1]?.value), engaged: asNumber(values[2]?.value), conversions: asNumber(values[3]?.value) }; }
export async function readGa4(config: GoogleConfig, oauth: ClinicGoogleOAuth, request: typeof fetch = fetch): Promise<GaSnapshot> {
  const token = await oauth.accessToken(config, request);
  const accounts = await json(request, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries', token) as { accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string; displayName?: string }> }> };
  const properties = accounts.accountSummaries?.flatMap(account => account.propertySummaries ?? []) ?? [];
  const selected = properties.find(item => /marta|clinica/i.test(item.displayName ?? '')) ?? properties[0];
  if (!selected?.property) throw new Error('ga4_property_not_found');
  const current = range(1), previous = range(29);
  const [now, before, eventReport] = await Promise.all([report(request, token, selected.property, current), report(request, token, selected.property, previous), report(request, token, selected.property, current, true)]);
  const events = ((eventReport.rows as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> | undefined) ?? []).map(row => ({ name: row.dimensionValues?.[0]?.value ?? 'Sin nombre', count: asNumber(row.metricValues?.[0]?.value) }));
  return { capturedAt: new Date().toISOString(), property: selected.property, range: current, totals: metric(now), previous: metric(before), events };
}
export class GaStore { constructor(private file: string) {} read() { try { const saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : []; return Array.isArray(saved) ? saved as GaSnapshot[] : []; } catch { return []; } } async refresh(config: GoogleConfig, oauth: ClinicGoogleOAuth, request: typeof fetch = fetch) { const snapshot = await readGa4(config, oauth, request); const all = [...this.read(), snapshot].slice(-90); mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 }); renameSync(`${this.file}.tmp`, this.file); return snapshot; } }
