import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Fault, type Repository } from '../gabi/service.js';
import { validates, type Row } from '../gabi/contracts.js';
import type { MotorReader } from './dispatch-mcp.js';

export const PILOT_ID = '00000000-0000-4000-8000-000000000001';
export const PILOT_DOMAIN = 'pinturasgabrielferrol.netlify.app';
export const PILOT_PROPERTY = `https://${PILOT_DOMAIN}/`;
export const pilotSite: Row = { record_type: 'Site', schema_version: '1.0.0', site_id: PILOT_ID, revision: 1, name: 'Pinturas Gabriel Ferrol', domain: PILOT_DOMAIN, timezone: 'Europe/Madrid', status: 'active', created_at: '2026-09-09T00:00:00Z' };
export interface Metric { kind: 'query' | 'page'; key: string; clicks: number; impressions: number; position: number; ctr: number; evidenceId: string; }
export interface Projection { capturedAt: string; dates: string[]; clicks: number; impressions: number; metrics: Metric[]; ideas: Row[]; evidence: Row[]; }
const bad = () => new Fault('invalid_upstream_response');
function obj(value: unknown): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(); return value as Row; }
function number(value: unknown, integer = false): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw bad(); return value; }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function projectionIsValid(value: unknown): value is Projection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Projection;
  return typeof p.capturedAt === 'string' && Array.isArray(p.dates) && p.dates.every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) &&
    Number.isSafeInteger(p.clicks) && p.clicks >= 0 && Number.isSafeInteger(p.impressions) && p.impressions >= 0 &&
    Array.isArray(p.metrics) && p.metrics.every(row => (row.kind === 'query' || row.kind === 'page') && typeof row.key === 'string' && typeof row.evidenceId === 'string' && [row.clicks, row.impressions, row.position, row.ctr].every(Number.isFinite)) &&
    Array.isArray(p.ideas) && p.ideas.every(row => validates('Idea', row) && row.site_id === PILOT_ID) &&
    Array.isArray(p.evidence) && p.evidence.every(row => validates('Evidence', row) && row.site_id === PILOT_ID);
}

// Pure projection of upstream observations. Query/page tables are independent,
// never joined into a query-to-URL relationship that Google did not return.
export function projectStats(input: unknown, capturedAt = new Date().toISOString()): Projection {
  const raw = obj(input);
  if (!Array.isArray(raw.snapshots) || raw.snapshots.length > 8) throw bad();
  const dates: string[] = [], metrics = new Map<string, Metric>();
  let clicks = 0, impressions = 0;
  for (const value of raw.snapshots) {
    const s = obj(value), date = String(s.date);
    if (s.project_id !== PILOT_ID || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date || date > capturedAt.slice(0, 10) || dates.includes(date)) throw bad();
    dates.push(date);
    const c = number(s.clicks, true), i = number(s.impressions, true);
    if (c > i) throw bad(); clicks += c; impressions += i;
    for (const kind of ['query', 'page'] as const) {
      const rows = s[kind === 'query' ? 'top_queries' : 'top_pages'];
      if (!Array.isArray(rows) || rows.length > 100) throw bad();
      const seen = new Set<string>();
      for (const value of rows) {
        const r = obj(value), key = r[kind];
        if (typeof key !== 'string' || !key.length || key.length > 2000 || seen.has(key)) throw bad();
        seen.add(key);
        if (kind === 'page') { const url = new URL(key); if (url.origin !== `https://${PILOT_DOMAIN}` || url.username || url.password) throw bad(); }
        const c = number(r.clicks, true), i = number(r.impressions, true), p = number(r.position);
        if (c > i || (i > 0 && p < 1)) throw bad();
        const id = `${kind}:${key}`, prior = metrics.get(id);
        metrics.set(id, { kind, key, clicks: (prior?.clicks ?? 0) + c, impressions: (prior?.impressions ?? 0) + i, position: (prior?.position ?? 0) + p * i, ctr: 0, evidenceId: '' });
      }
    }
  }
  dates.sort();
  const rows = [...metrics.values()].filter(r => r.impressions > 0).map(r => ({ ...r, position: r.position / r.impressions, ctr: r.clicks / r.impressions })).sort((a, b) => b.impressions - a.impressions || a.key.localeCompare(b.key)).slice(0, 200);
  const evidence: Row[] = rows.map(r => {
    r.evidenceId = randomUUID();
    const result: Row = { record_type: 'Evidence', schema_version: '1.0.0', site_id: PILOT_ID, evidence_id: r.evidenceId, source: 'gsc', classification: 'observation', summary: `${r.kind === 'query' ? 'Consulta' : 'Página'}: ${r.key}. ${r.clicks} clics, ${r.impressions} impresiones, CTR ${(r.ctr * 100).toFixed(2)} %, posición media ${r.position.toFixed(1)}. Días con datos: ${dates.join(', ')} (Search Console, horario del Pacífico). Muestra de los top 100 diarios; incluye cifras provisionales.`, source_ref: PILOT_PROPERTY, observed_at: null, captured_at: capturedAt, fresh_until: null, freshness: 'unknown', payload_digest: `sha256:${digest({ dates, metric: r })}` };
    if (!validates('Evidence', result)) throw bad(); return result;
  });
  // Transparent heuristic, not a forecast: impressions with average position
  // 4–20 first, then other observations. Never manufacture five actions.
  const ranked = [...rows].sort((a, b) => score(b) - score(a) || b.impressions - a.impressions || a.key.localeCompare(b.key));
  const ideas = ranked.slice(0, 5).map((r, index) => {
    const idea: Row = { record_type: 'Idea', schema_version: '1.0.0', site_id: PILOT_ID, idea_id: randomUUID(), revision: 1, type: 'update', title: `${index + 1}. ${r.kind === 'page' ? 'Revisar título y contenido de' : 'Comprobar si el contenido responde a'} ${r.key}`.slice(0, 200), rationale: `Prioridad orientativa por impresiones observadas${r.position >= 4 && r.position <= 20 ? ' y posición media entre 4 y 20' : ''}. ${r.impressions} impresiones, ${r.clicks} clics, posición ${r.position.toFixed(1)}. ${r.kind === 'query' ? 'Localiza manualmente la página adecuada; estos datos no vinculan la consulta con una URL.' : 'Comprueba intención, título y descripción antes de proponer una edición.'} Es una recomendación para revisión humana, no una mejora garantizada ni una aprobación.`, status: 'pending', evidence_refs: [r.evidenceId], approval_ref: null, pr_ref: null, created_at: capturedAt };
    if (!validates('Idea', idea)) throw bad(); return idea;
  });
  return { capturedAt, dates, clicks, impressions, metrics: rows, ideas, evidence };
}
function score(r: Metric) { return r.impressions * (r.position >= 4 && r.position <= 20 ? 2 : 1); }

export class PilotRepository implements Repository {
  private projection: Projection | null = null;
  private archivedEvidence: Row[] = [];
  private syncing = false;
  lastError = false;
  constructor(private motor: MotorReader, private token: string, private sync: () => Promise<void>, private file?: string) {
    if (file && existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.siteId !== PILOT_ID || !projectionIsValid(saved.projection) || !Array.isArray(saved.evidence) || saved.evidence.some((r: Row) => !validates('Evidence', r) || r.site_id !== PILOT_ID)) throw new Error('Invalid local pilot state');
      this.projection = saved.projection; this.archivedEvidence = saved.evidence;
    }
  }
  async site(id: string) { return id === PILOT_ID ? structuredClone(pilotSite) : undefined; }
  async ideas(id: string, status = 'pending') { return id === PILOT_ID && status === 'pending' ? structuredClone(this.projection?.ideas ?? []) : []; }
  async evidence(id: string, evidenceId: string) { return id === PILOT_ID ? structuredClone(this.archivedEvidence.find(r => r.evidence_id === evidenceId)) : undefined; }
  view() { return structuredClone({ ...this.projection, state: this.lastError ? 'error' : this.projection ? (this.projection.dates.length ? 'ready' : 'empty') : 'not_connected', site: pilotSite, property: PILOT_PROPERTY }); }
  async refresh() {
    if (this.syncing) throw new Fault('dependency_unavailable');
    this.syncing = true;
    try {
      const p = obj(await this.motor.read(this.token, 'get_project'));
      if (p.domain !== PILOT_DOMAIN || p.slug !== 'pinturas-gabriel' || p.gsc_property !== PILOT_PROPERTY || p.github_repo !== null || p.auto_approve !== false || p.auto_approve_tools !== false || p.publish_target !== 'manual') throw bad();
      await this.sync();
      const projection = projectStats(await this.motor.read(this.token, 'get_site_stats', { days: 7 }));
      const evidence = [...this.archivedEvidence, ...projection.evidence];
      if (evidence.length > 5000) throw new Fault('dependency_unavailable');
      if (this.file) {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(`${this.file}.tmp`, JSON.stringify({ siteId: PILOT_ID, projection, evidence }), { mode: 0o600 });
        renameSync(`${this.file}.tmp`, this.file);
      }
      this.projection = projection; this.archivedEvidence = evidence; this.lastError = false;
    } catch { this.lastError = true; throw new Fault('dependency_unavailable'); }
    finally { this.syncing = false; }
  }
}
