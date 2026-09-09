import { randomUUID } from 'node:crypto';
import { validates, type Row, type Command } from './contracts.js';

export interface Principal { siteId: string; actorId: string; }
export interface Authenticator { authenticate(token: string | undefined): Promise<Principal | undefined>; }
export interface Repository {
  site(siteId: string): Promise<unknown>;
  ideas(siteId: string, status?: string): Promise<unknown>;
  evidence(siteId: string, evidenceId: string): Promise<unknown>;
}
export type ErrorCode = 'invalid_request' | 'unauthenticated' | 'not_found_or_forbidden' | 'dependency_unavailable' | 'invalid_upstream_response';
export class Fault extends Error {
  constructor(public readonly code: ErrorCode) { super(code); }
}
export function errorResult(code: ErrorCode, requestId: string = randomUUID()) {
  const statuses = { invalid_request: 400, unauthenticated: 401, not_found_or_forbidden: 404, dependency_unavailable: 503, invalid_upstream_response: 502 };
  return { status: statuses[code], body: { record_type: 'Error', schema_version: '1.0.0', request_id: requestId, code, retry_hint: code === 'dependency_unavailable' ? 'bounded_read_retry' : 'none' } };
}
function checked(name: string, value: unknown, siteId: string): Row {
  if (!validates(name, value) || (value as Row).site_id !== siteId) throw new Fault('invalid_upstream_response');
  return value as Row;
}
export function createService(auth: Authenticator, repo: Repository) {
  return async (token: string | undefined, input: unknown) => {
    let requestId: string = randomUUID();
    try {
      const principal = await auth.authenticate(token);
      if (!principal) throw new Fault('unauthenticated');
      if (!validates('Command', input)) throw new Fault('invalid_request');
      const command = input as Command;
      requestId = command.request_id;
      if (!['site.read', 'ideas.list', 'evidence.read'].includes(command.operation)) throw new Fault('not_found_or_forbidden');
      // Pagination is deliberately unavailable in this first bounded slice.
      if (command.payload.cursor !== undefined) throw new Fault('invalid_request');
      const site = await repo.site(principal.siteId);
      if (!site) throw new Fault('not_found_or_forbidden');
      const validatedSite = checked('Site', site, principal.siteId);
      if (validatedSite.status !== 'active') throw new Fault('not_found_or_forbidden');
      let result: unknown = validatedSite;
      if (command.operation === 'ideas.list') {
        const ideas = await repo.ideas(principal.siteId, command.payload.status);
        if (!Array.isArray(ideas) || ideas.length > 1000) throw new Fault('invalid_upstream_response');
        const rows = ideas.map(item => checked('Idea', item, principal.siteId));
        if (command.payload.status && rows.some(item => item.status !== command.payload.status)) throw new Fault('invalid_upstream_response');
        result = rows.slice(0, command.payload.limit ?? 20);
      }
      if (command.operation === 'evidence.read') {
        const evidence = await repo.evidence(principal.siteId, command.payload.evidence_id!);
        if (!evidence) throw new Fault('not_found_or_forbidden');
        result = checked('Evidence', evidence, principal.siteId);
        if ((result as Row).evidence_id !== command.payload.evidence_id) throw new Fault('invalid_upstream_response');
      }
      // Recheck revocation after asynchronous reads, before returning tenant data.
      const current = await auth.authenticate(token);
      if (!current || current.siteId !== principal.siteId || current.actorId !== principal.actorId) throw new Fault('unauthenticated');
      return { status: 200, body: result };
    } catch (error) {
      return errorResult(error instanceof Fault ? error.code : 'dependency_unavailable', requestId);
    }
  };
}
