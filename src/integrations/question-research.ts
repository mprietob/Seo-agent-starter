import { createHash, randomUUID } from 'node:crypto';
import { validates, type Row } from '../gabi/contracts.js';
import { Fault } from '../gabi/service.js';

export interface QuestionSignal { sourceRef: string; question: string; capturedAt: string; }
export interface QuestionOpportunity { question: string; normalized: string; evidence: Row; }
const bad = () => new Fault('invalid_upstream_response');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function value(input: unknown, limit: number) {
  if (typeof input !== 'string') throw bad();
  const result = input.trim().replace(/\s+/g, ' ');
  if (!result || result.length > limit) throw bad();
  return result;
}
function when(input: unknown) {
  const result = value(input, 64);
  if (!result.endsWith('Z') || Number.isNaN(Date.parse(result))) throw bad();
  return result;
}
// The adapter for each repository belongs at the edge. This common projection
// treats its questions as untrusted observations and never turns them into a
// publication command.
export function projectQuestionResearch(siteId: string, signals: QuestionSignal[], capturedAt: string): QuestionOpportunity[] {
  if (!capturedAt.endsWith('Z') || Number.isNaN(Date.parse(capturedAt)) || !Array.isArray(signals) || signals.length > 100) throw bad();
  const seen = new Set<string>();
  return signals.map(signal => {
    const question = value(signal.question, 500), sourceRef = value(signal.sourceRef, 256), observedAt = when(signal.capturedAt);
    const normalized = question.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(normalized)) throw bad();
    seen.add(normalized);
    const evidence: Row = {
      record_type: 'Evidence', schema_version: '1.0.0', site_id: siteId, evidence_id: randomUUID(), source: 'question_repository', classification: 'observation',
      summary: `Pregunta de investigación externa (dato no confiable): ${question}`, source_ref: sourceRef, observed_at: observedAt, captured_at: capturedAt,
      fresh_until: null, freshness: 'unknown', payload_digest: `sha256:${digest({ question, sourceRef, observedAt })}`
    };
    if (!validates('Evidence', evidence)) throw bad();
    return { question, normalized, evidence };
  });
}

export function proposeQuestionContent(siteId: string, opportunity: QuestionOpportunity, createdAt: string): Row {
  if (!validates('Evidence', opportunity.evidence) || opportunity.evidence.site_id !== siteId || opportunity.evidence.source !== 'question_repository' || !createdAt.endsWith('Z') || Number.isNaN(Date.parse(createdAt))) throw bad();
  const idea: Row = {
    record_type: 'Idea', schema_version: '1.0.0', site_id: siteId, idea_id: randomUUID(), revision: 1, type: 'guide',
    title: `Comprobar oportunidad: ${opportunity.question}`.slice(0, 200),
    rationale: 'La pregunta procede de una fuente externa de investigación. Antes de redactar, confirmar que la clínica presta el servicio, que no duplica contenido existente y que la respuesta puede revisarse médicamente. No autoriza publicación.',
    status: 'pending', evidence_refs: [String(opportunity.evidence.evidence_id)], approval_ref: null, pr_ref: null, created_at: createdAt
  };
  if (!validates('Idea', idea)) throw bad();
  return idea;
}
