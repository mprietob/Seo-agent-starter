import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { validates, type Row } from '../gabi/contracts.js';
import { Fault } from '../gabi/service.js';
const bad = () => new Fault('invalid_upstream_response');
export interface ContentDraft { ideaId: string; title: string; description: string; body: string; updatedAt: string; }
interface State { siteId: string; ideas: Row[]; approvals: Row[]; drafts?: ContentDraft[]; }
export class ClinicQueue {
  constructor(private siteId: string, private file: string) {}
  private load(): State {
    if (!existsSync(this.file)) return { siteId: this.siteId, ideas: [], approvals: [] };
    const state = JSON.parse(readFileSync(this.file, 'utf8')) as State;
    if (state.siteId !== this.siteId || !Array.isArray(state.ideas) || !Array.isArray(state.approvals) || state.ideas.some(row => !validates('Idea', row) || row.site_id !== this.siteId) || state.approvals.some(row => !validates('Approval', row) || row.site_id !== this.siteId)) throw bad();
    if (state.drafts && (!Array.isArray(state.drafts) || state.drafts.some(draft => !draft || typeof draft.ideaId !== 'string' || typeof draft.title !== 'string' || typeof draft.description !== 'string' || typeof draft.body !== 'string'))) throw bad();
    return state;
  }
  private save(state: State) { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(`${this.file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 }); renameSync(`${this.file}.tmp`, this.file); }
  list() { return structuredClone(this.load().ideas); }
  draft(ideaId: string) { return structuredClone(this.load().drafts?.find(draft => draft.ideaId === ideaId) ?? null); }
  saveDraft(draft: ContentDraft) {
    if (!/^[0-9a-f-]{36}$/i.test(draft.ideaId) || [draft.title, draft.description, draft.body].some(value => value.length > 20_000) || !draft.updatedAt.endsWith('Z')) throw bad();
    const state = this.load(), idea = state.ideas.find(row => row.idea_id === draft.ideaId);
    if (!idea || idea.status !== 'pending') throw bad();
    const drafts = state.drafts ?? []; const index = drafts.findIndex(item => item.ideaId === draft.ideaId);
    if (index >= 0) drafts[index] = structuredClone(draft); else drafts.push(structuredClone(draft));
    state.drafts = drafts; this.save(state); return structuredClone(draft);
  }
  propose(idea: Row) {
    if (!validates('Idea', idea) || idea.site_id !== this.siteId || idea.status !== 'pending' || idea.approval_ref !== null || idea.pr_ref !== null) throw bad();
    const state = this.load(); if (state.ideas.some(row => row.idea_id === idea.idea_id)) throw bad(); state.ideas.push(structuredClone(idea)); this.save(state); return structuredClone(idea);
  }
  approve(ideaId: string, actorId: string, decidedAt: string) {
    const state = this.load(), idea = state.ideas.find(row => row.idea_id === ideaId);
    if (!idea || idea.status !== 'pending' || !/^[0-9a-f-]{36}$/i.test(actorId) || !decidedAt.endsWith('Z') || Number.isNaN(Date.parse(decidedAt))) throw bad();
    const approval: Row = { record_type: 'Approval', schema_version: '1.0.0', site_id: this.siteId, approval_id: randomUUID(), actor: { actor_id: actorId, actor_type: 'human' }, action: 'idea.approve', target_id: ideaId, target_revision: idea.revision, decision: 'granted', decided_at: decidedAt, expires_at: '2099-12-31T23:59:59.000Z', policy_version: '1.0.0' };
    if (!validates('Approval', approval)) throw bad(); idea.status = 'approved'; idea.approval_ref = approval.approval_id; state.approvals.push(approval); this.save(state); return { idea: structuredClone(idea), approval: structuredClone(approval) };
  }
}
