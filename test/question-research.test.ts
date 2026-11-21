import test from 'node:test';
import assert from 'node:assert/strict';
import { validates } from '../src/gabi/contracts.js';
import { projectQuestionResearch, proposeQuestionContent } from '../src/integrations/question-research.js';
const siteId = '00000000-0000-4000-8000-000000000001', now = '2026-09-20T12:00:00.000Z';
test('question research remains evidence and creates only a pending proposal', () => {
  const [opportunity] = projectQuestionResearch(siteId, [{ sourceRef: 'provider:question:1', question: '¿Qué dermatóloga trata la rosácea en Ferrol?', capturedAt: now }], now);
  assert.equal(validates('Evidence', opportunity!.evidence), true);
  const idea = proposeQuestionContent(siteId, opportunity!, now);
  assert.equal(validates('Idea', idea), true); assert.equal(idea.status, 'pending'); assert.equal(idea.approval_ref, null);
});
test('duplicate or malformed external research fails closed', () => {
  const signal = { sourceRef: 'provider:question:1', question: 'Rosácea en Ferrol', capturedAt: now };
  assert.throws(() => projectQuestionResearch(siteId, [signal, { ...signal, question: 'rosacea  en ferrol' }], now), { code: 'invalid_upstream_response' });
  assert.throws(() => projectQuestionResearch(siteId, [{ ...signal, capturedAt: 'tomorrow' }], now), { code: 'invalid_upstream_response' });
});
