import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicAuthorized, clinicBindHost, clinicSameOrigin } from '../src/clinic-access.js';
test('clinic panel is loopback by default and refuses an external bind without a password', () => {
  assert.equal(clinicBindHost({}), '127.0.0.1');
  assert.throws(() => clinicBindHost({ GABI_BIND_HOST: '0.0.0.0' }), /GABI_DASHBOARD_PASSWORD/);
  assert.equal(clinicBindHost({ GABI_BIND_HOST: '0.0.0.0', GABI_DASHBOARD_PASSWORD: 'secret' }), '0.0.0.0');
});
test('clinic panel accepts only the configured private Basic credential', () => {
  const valid = `Basic ${Buffer.from('gabi:secret').toString('base64')}`;
  assert.equal(clinicAuthorized(valid, 'secret'), true);
  assert.equal(clinicAuthorized(`Basic ${Buffer.from('gabi:other').toString('base64')}`, 'secret'), false);
  assert.equal(clinicAuthorized(undefined, 'secret'), false);
});

test('approval form must originate from the same private panel', () => {
  assert.equal(clinicSameOrigin('https://seo.inimamed.com', 'seo.inimamed.com'), true);
  assert.equal(clinicSameOrigin('https://other.example', 'seo.inimamed.com'), false);
  assert.equal(clinicSameOrigin(undefined, 'seo.inimamed.com'), false);
});
