import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Authenticator, Principal, Repository } from '../gabi/service.js';
import type { Row } from '../gabi/contracts.js';

const fixture = (name: string): Row => JSON.parse(readFileSync(new URL(`../../../contracts/v1/examples/${name}.json`, import.meta.url), 'utf8'));
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class LocalAuthenticator implements Authenticator {
  private grants = new Map<string, Principal>();
  issue(siteId: string) {
    const token = randomBytes(32).toString('hex');
    this.grants.set(hash(token), { siteId, actorId: randomUUID() });
    return token;
  }
  revoke(token: string) { this.grants.delete(hash(token)); }
  async authenticate(token: string | undefined) { return token ? this.grants.get(hash(token)) : undefined; }
}
export class SyntheticRepository implements Repository {
  readonly sites = new Map<string, Row>();
  readonly ideaRows = new Map<string, Row[]>();
  readonly evidenceRows = new Map<string, Row[]>();
  constructor() {
    for (const suffix of ['a', 'b']) {
      const site = fixture('site');
      const siteId = randomUUID();
      const evidence = { ...fixture('evidence'), site_id: siteId, evidence_id: randomUUID(), source_ref: `fixture-${suffix}` };
      this.sites.set(siteId, { ...site, site_id: siteId, name: `Sitio sintético ${suffix.toUpperCase()}`, domain: `site-${suffix}.example.org` });
      this.evidenceRows.set(siteId, [evidence]);
      this.ideaRows.set(siteId, [{ ...fixture('idea'), site_id: siteId, idea_id: randomUUID(), evidence_refs: [evidence.evidence_id] }]);
    }
  }
  async site(siteId: string) { return structuredClone(this.sites.get(siteId)); }
  async ideas(siteId: string, status?: string) { return structuredClone((this.ideaRows.get(siteId) ?? []).filter(row => !status || row.status === status)); }
  async evidence(siteId: string, evidenceId: string) { return structuredClone((this.evidenceRows.get(siteId) ?? []).find(row => row.evidence_id === evidenceId)); }
}
