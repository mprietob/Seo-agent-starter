import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ClinicGoogleOAuth, GoogleConfig } from './clinic-google-oauth.js';

const property = 'https://clinicamartaprieto.com/';
export interface SearchMetric { clicks: number; impressions: number; ctr: number; position: number; }
export interface SearchRow extends SearchMetric { key: string; }
export interface SearchSnapshot { capturedAt: string; startDate: string; endDate: string; totals: SearchMetric; previous: SearchMetric; dates: SearchRow[]; queries: SearchRow[]; pages: SearchRow[]; }
const metric = (row?: { clicks?: number; impressions?: number; ctr?: number; position?: number }): SearchMetric => ({ clicks: Number(row?.clicks ?? 0), impressions: Number(row?.impressions ?? 0), ctr: Number(row?.ctr ?? 0), position: Number(row?.position ?? 0) });
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function range(daysAgo: number, length: number) { const end = new Date(); end.setUTCDate(end.getUTCDate() - daysAgo); const start = new Date(end); start.setUTCDate(start.getUTCDate() - length + 1); return { startDate: iso(start), endDate: iso(end) }; }
async function query(accessToken: string, startDate: string, endDate: string, dimensions: string[], request: typeof fetch) {
  const response = await request(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: dimensions.length ? 1000 : 1 }), signal: AbortSignal.timeout(20_000) });
  const result = await response.json().catch(() => null) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> } | null;
  if (!response.ok || !result || !Array.isArray(result.rows)) throw new Error('search_console_read_failed');
  return result.rows;
}
const rows = (data: Awaited<ReturnType<typeof query>>) => data.map(row => ({ key: row.keys?.[0] ?? '', ...metric(row) })).filter(row => row.key);
export async function readSearchConsole(config: GoogleConfig, oauth: ClinicGoogleOAuth, request: typeof fetch = fetch): Promise<SearchSnapshot> {
  const current = range(3, 28), previous = range(31, 28), token = await oauth.accessToken(config, request);
  const [total, previousTotal, dates, queries, pages] = await Promise.all([query(token, current.startDate, current.endDate, [], request), query(token, previous.startDate, previous.endDate, [], request), query(token, current.startDate, current.endDate, ['date'], request), query(token, current.startDate, current.endDate, ['query'], request), query(token, current.startDate, current.endDate, ['page'], request)]);
  return { capturedAt: new Date().toISOString(), ...current, totals: metric(total[0]), previous: metric(previousTotal[0]), dates: rows(dates), queries: rows(queries).sort((a,b) => b.clicks-a.clicks).slice(0, 20), pages: rows(pages).sort((a,b) => b.clicks-a.clicks).slice(0, 20) };
}
export class SearchConsoleStore {
  constructor(private file: string) {}
  read(): SearchSnapshot[] { try { const data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : []; return Array.isArray(data) ? data as SearchSnapshot[] : []; } catch { return []; } }
  async refresh(config: GoogleConfig, oauth: ClinicGoogleOAuth, request: typeof fetch = fetch) { const snapshot = await readSearchConsole(config, oauth, request); const history = [...this.read(), snapshot].slice(-90); mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(history, null, 2), { mode: 0o600 }); renameSync(`${this.file}.tmp`, this.file); return snapshot; }
}
