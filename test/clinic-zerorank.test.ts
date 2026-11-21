import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicZeroRankStatus } from '../src/integrations/clinic-zerorank.js';
const siteId='00000000-0000-4000-8000-000000000002', now='2026-09-20T12:00:00.000Z';
const reader = { async read() { return { data: { data: [{ id:'1', text:'¿Qué dermatóloga recomiendan en Ferrol?', status:'active', lastAnswerAt:now }] } }; } };
test('clinic ZeroRank status does not accept a workspace without a clinic prompt marker', async () => {
  assert.deepEqual(await clinicZeroRankStatus(reader,'key',siteId,['clínica marta prieto'],now),{state:'wrong_workspace',prompts:0});
  assert.deepEqual(await clinicZeroRankStatus(reader,'key',siteId,['dermatóloga'],now),{state:'ready',prompts:1});
  assert.deepEqual(await clinicZeroRankStatus(reader,undefined,siteId,['dermatóloga'],now),{state:'not_configured',prompts:0});
});
