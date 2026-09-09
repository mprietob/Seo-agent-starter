import { createHash, randomUUID } from 'node:crypto';
import { validates, type Row } from '../gabi/contracts.js';
import { Fault, type Repository } from '../gabi/service.js';
import type { MotorReader } from './dispatch-mcp.js';

export interface LaboratoryConnection {
  site: Row;
  projectId: string;
  slug: string;
  token: () => Promise<string>;
}
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Fault('invalid_upstream_response');
  return value as Row;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Fault('invalid_upstream_response');
  return value;
}
function utc(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Fault('invalid_upstream_response');
  return new Date(value).toISOString();
}
export class DispatchRepository implements Repository {
  private readonly connections = new Map<string, LaboratoryConnection>();
  private readonly evidenceCache = new Map<string, Row>();
  private readonly revisions = new Map<string, { digest: string; revision: number }>();
  constructor(private readonly motor: MotorReader, connections: LaboratoryConnection[]) {
    for (const connection of connections) {
      if (!validates('Site', connection.site) || this.connections.has(String(connection.site.site_id))) throw new Error('Invalid site configuration');
      this.connections.set(String(connection.site.site_id), { ...connection, site: structuredClone(connection.site) });
    }
  }
  private connection(siteId: string) {
    const connection = this.connections.get(siteId);
    if (!connection) throw new Fault('not_found_or_forbidden');
    return connection;
  }
  private async verify(siteId: string) {
    const connection = this.connection(siteId);
    const token = await connection.token();
    const project = object(await this.motor.read(token, 'get_project'));
    if (project.domain !== connection.site.domain || project.slug !== connection.slug) throw new Fault('invalid_upstream_response');
    // These constraints are deliberately narrower than a production connection.
    if (project.gsc_property !== null || project.github_repo !== null || project.auto_approve !== false || project.auto_approve_tools !== false || project.publish_target !== 'manual') throw new Fault('not_found_or_forbidden');
    return { connection, token, project };
  }
  async site(siteId: string) {
    const { connection, project } = await this.verify(siteId);
    return { ...connection.site, name: text(project.name, 120) };
  }
  async ideas(siteId: string, status = 'pending') {
    if (!['pending', 'rejected'].includes(status)) throw new Fault('invalid_request');
    const { connection, token } = await this.verify(siteId);
    const rows = await this.motor.read(token, 'get_suggestions', { status });
    if (!Array.isArray(rows) || rows.length > 1000) throw new Fault('invalid_upstream_response');
    return rows.map(value => {
      const row = object(value);
      if (row.project_id !== connection.projectId || row.status !== status) throw new Fault('invalid_upstream_response');
      const normalized = {
        record_type: 'Idea', schema_version: '1.0.0', site_id: siteId,
        idea_id: row.id, revision: 1, type: row.type, title: text(row.title, 200),
        rationale: row.rationale === null ? 'Sin justificación registrada en el motor.' : text(row.rationale, 4000),
        status, evidence_refs: [], approval_ref: null, pr_ref: null, created_at: utc(row.created_at)
      };
      if (!validates('Idea', normalized)) throw new Fault('invalid_upstream_response');
      const key = `${siteId}:${normalized.idea_id}`;
      const digest = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      const previous = this.revisions.get(key);
      if (!previous && this.revisions.size >= 1000) throw new Fault('dependency_unavailable');
      normalized.revision = previous ? previous.revision + Number(previous.digest !== digest) : 1;
      this.revisions.set(key, { digest, revision: normalized.revision });
      return normalized;
    });
  }
  // Explicit operator-side capture; not exposed as a client Command or agent tool.
  async captureEvidence(siteId: string): Promise<Row> {
    const { connection, token } = await this.verify(siteId);
    const result = object(await this.motor.read(token, 'get_site_stats', { days: 1 }));
    if (!Array.isArray(result.snapshots) || result.snapshots.length > 2) throw new Fault('invalid_upstream_response');
    if (!result.snapshots.length) throw new Fault('dependency_unavailable');
    const snapshots = result.snapshots.map(value => {
      const row = object(value);
      if (row.project_id !== connection.projectId || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Fault('invalid_upstream_response');
      for (const field of ['clicks', 'impressions']) if (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0) throw new Fault('invalid_upstream_response');
      return { date: row.date, clicks: Number(row.clicks), impressions: Number(row.impressions) };
    });
    const evidence: Row = {
      record_type: 'Evidence', schema_version: '1.0.0', site_id: siteId, evidence_id: randomUUID(),
      source: 'dispatchseo', classification: 'observation',
      summary: `Datos sintéticos del laboratorio: ${snapshots.reduce((n, row) => n + row.clicks, 0)} clics y ${snapshots.reduce((n, row) => n + row.impressions, 0)} impresiones en ${snapshots.length} snapshots.`,
      source_ref: randomUUID(), observed_at: null, captured_at: new Date().toISOString(),
      fresh_until: null, freshness: 'unknown', payload_digest: `sha256:${createHash('sha256').update(JSON.stringify(snapshots)).digest('hex')}`
    };
    if (!validates('Evidence', evidence)) throw new Fault('invalid_upstream_response');
    if (this.evidenceCache.size >= 100) throw new Fault('dependency_unavailable');
    this.evidenceCache.set(`${siteId}:${evidence.evidence_id}`, evidence);
    return structuredClone(evidence);
  }
  async evidence(siteId: string, evidenceId: string) {
    this.connection(siteId);
    return structuredClone(this.evidenceCache.get(`${siteId}:${evidenceId}`));
  }
}
