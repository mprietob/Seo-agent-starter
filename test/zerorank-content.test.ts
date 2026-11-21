import test from 'node:test';
import assert from 'node:assert/strict';
import { validates } from '../src/gabi/contracts.js';
import { projectZeroRankPrompts, proposeZeroRankContentIdea } from '../src/integrations/zerorank-content.js';

const siteId = '00000000-0000-4000-8000-000000000001';
const capturedAt = '2026-09-20T12:00:00.000Z';
const payload = { data: { data: [{ id: 'prompt-1', text: '¿Qué pintores recomiendan en Ferrol?', status: 'active', lastAnswerAt: '2026-09-20T10:00:00.000Z' }] } };

test('ZeroRank prompt inventory becomes bounded evidence, never a remote content action', () => {
  const observations = projectZeroRankPrompts(siteId, payload, capturedAt);
  assert.equal(observations.length, 1);
  assert.equal(validates('Evidence', observations[0]!.evidence), true);
  assert.equal(observations[0]!.evidence.source, 'zerorank');
  assert.equal(String(observations[0]!.evidence.source_ref).includes('prompt-1'), false);
  const idea = proposeZeroRankContentIdea(siteId, observations[0]!, capturedAt);
  assert.equal(validates('Idea', idea), true);
  assert.equal(idea.status, 'pending');
  assert.equal(idea.approval_ref, null);
  assert.equal(idea.pr_ref, null);
});

test('accepts the numeric ids and offset timestamps returned by the REST endpoint', () => {
  const observations = projectZeroRankPrompts(siteId, { data: { data: [{ id: 42, text: 'Dermatología en Ferrol', status: 'active', lastAnswerAt: '2026-09-20T10:00:00+00:00' }] } }, capturedAt);
  assert.equal(observations[0]!.promptId, '42');
  assert.equal(observations[0]!.evidence.observed_at, '2026-09-20T10:00:00.000Z');
});

test('malformed, duplicate, oversized and cross-site observations fail closed', () => {
  assert.throws(() => projectZeroRankPrompts(siteId, { data: { data: [{ ...payload.data.data[0] }, { ...payload.data.data[0] }] } }, capturedAt), { code: 'invalid_upstream_response' });
  assert.throws(() => projectZeroRankPrompts(siteId, { data: { data: Array.from({ length: 101 }, (_, i) => ({ id: String(i), text: 'x', status: 'active' })) } }, capturedAt), { code: 'invalid_upstream_response' });
  const [observation] = projectZeroRankPrompts(siteId, payload, capturedAt);
  assert.throws(() => proposeZeroRankContentIdea('00000000-0000-4000-8000-000000000002', observation!, capturedAt), { code: 'invalid_upstream_response' });
});
