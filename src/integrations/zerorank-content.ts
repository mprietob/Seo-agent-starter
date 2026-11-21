import { createHash, randomUUID } from 'node:crypto';
import { validates, type Row } from '../gabi/contracts.js';
import { Fault } from '../gabi/service.js';

const MAX_PROMPTS = 100;
const bad = () => new Fault('invalid_upstream_response');
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  return value as Row;
};
const text = (value: unknown, limit: number): string => {
  if (typeof value !== 'string') throw bad();
  const result = value.trim();
  if (!result || result.length > limit) throw bad();
  return result;
};
// The documented endpoint currently returns numeric prompt IDs, while older
// exports used strings. Both identify the same read-only observation.
const promptIdentifier = (value: unknown): string => {
  if (typeof value === 'string') return text(value, 128);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw bad();
};
const timestamp = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const result = text(value, 64);
  const parsed = Date.parse(result);
  if (Number.isNaN(parsed)) throw bad();
  return new Date(parsed).toISOString();
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reference = (promptId: string) => `zerorank:prompt:${digest(promptId)}`;

export interface ZeroRankPromptObservation {
  promptId: string;
  prompt: string;
  status: string;
  evidence: Row;
}

// This projection is deliberately data-only. A prompt is an observation, not an
// instruction for the agent, and it never creates a draft or calls ZeroRank.
export function projectZeroRankPrompts(siteId: string, payload: unknown, capturedAt: string): ZeroRankPromptObservation[] {
  if (!capturedAt.endsWith('Z') || Number.isNaN(Date.parse(capturedAt))) throw bad();
  const envelope = object(payload);
  const page = object(envelope.data);
  if (!Array.isArray(page.data) || page.data.length > MAX_PROMPTS) throw bad();
  const seen = new Set<string>();
  return page.data.map(value => {
    const row = object(value);
    const promptId = promptIdentifier(row.id);
    const prompt = text(row.text, 2_000);
    const status = text(row.status, 64);
    const observedAt = timestamp(row.lastAnswerAt);
    if (seen.has(promptId)) throw bad();
    seen.add(promptId);
    const evidence: Row = {
      record_type: 'Evidence', schema_version: '1.0.0', site_id: siteId, evidence_id: randomUUID(),
      source: 'zerorank', classification: 'observation',
      summary: `Consulta monitorizada por ZeroRank (dato no confiable): ${prompt.slice(0, 500)}. Estado: ${status}.`,
      source_ref: reference(promptId), observed_at: observedAt, captured_at: capturedAt,
      fresh_until: null, freshness: 'unknown', payload_digest: `sha256:${digest({ promptId, prompt, status, observedAt })}`
    };
    if (!validates('Evidence', evidence)) throw bad();
    return { promptId, prompt, status, evidence };
  });
}

// A caller must explicitly select one observed prompt. The result is a pending
// proposal only: it cannot authorize drafting, publishing, or a remote write.
export function proposeZeroRankContentIdea(siteId: string, observation: ZeroRankPromptObservation, createdAt: string): Row {
  if (observation.evidence.site_id !== siteId || observation.evidence.source !== 'zerorank' || !validates('Evidence', observation.evidence)) throw bad();
  if (!createdAt.endsWith('Z') || Number.isNaN(Date.parse(createdAt))) throw bad();
  const idea: Row = {
    record_type: 'Idea', schema_version: '1.0.0', site_id: siteId, idea_id: randomUUID(), revision: 1,
    type: 'guide', title: `Borrador pendiente: ${observation.prompt}`.slice(0, 200),
    rationale: `Propuesta basada en una consulta monitorizada por ZeroRank. Antes de solicitar un borrador, una persona debe confirmar intención, alcance del servicio, datos verificables y cumplimiento aplicable. No es una autorización de publicación.`,
    status: 'pending', evidence_refs: [String(observation.evidence.evidence_id)], approval_ref: null, pr_ref: null, created_at: createdAt
  };
  if (!validates('Idea', idea)) throw bad();
  return idea;
}
