import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ClinicQueue } from '../src/integrations/clinic-queue.js';
import { validates, type Row } from '../src/gabi/contracts.js';
const siteId='00000000-0000-4000-8000-000000000002', now='2026-09-20T12:00:00.000Z';
function idea(): Row { return { record_type:'Idea',schema_version:'1.0.0',site_id:siteId,idea_id:randomUUID(),revision:1,type:'guide',title:'Revisar contenido de rosácea',rationale:'Propuesta pendiente de revisión médica.',status:'pending',evidence_refs:[],approval_ref:null,pr_ref:null,created_at:now }; }
test('clinic queue persists a pending idea and requires a human approval before it advances', () => {
  const queue = new ClinicQueue(siteId, join(mkdtempSync(join(tmpdir(),'gabi-queue-')),'queue.json')), pending=queue.propose(idea());
  assert.equal(queue.list()[0]!.status,'pending'); const result=queue.approve(String(pending.idea_id),randomUUID(),now);
  assert.equal(result.idea.status,'approved'); assert.equal(validates('Approval',result.approval),true); assert.equal(result.idea.approval_ref,result.approval.approval_id);
});
test('clinic queue rejects foreign or already-approved proposals', () => {
  const queue = new ClinicQueue(siteId, join(mkdtempSync(join(tmpdir(),'gabi-queue-')),'queue.json')), pending=queue.propose(idea());
  assert.throws(() => queue.approve(String(pending.idea_id),'not-a-uuid',now),{code:'invalid_upstream_response'});
  queue.approve(String(pending.idea_id),randomUUID(),now);
  assert.throws(() => queue.approve(String(pending.idea_id),randomUUID(),now),{code:'invalid_upstream_response'});
});
