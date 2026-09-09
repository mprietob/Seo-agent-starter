// Characterization of the pinned, process-instrumented upstream. Not a Gabi adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const report = { upstream_commit: 'fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26', captured_at: new Date().toISOString(), selected_case: process.env.LAB_CASE ?? 'all', instrumentation: 'HTTP provider doubles and database transport faults; no upstream file changes', tests: [] };
const { legacyToken } = JSON.parse(readFileSync('/tmp/gabi-fault-context.json', 'utf8'));
let counter = 0;
async function db(path, method = 'GET', body) {
  const r = await fetch(`http://postgrest:3000/${path}`, { method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  assert.ok(r.ok, `Fixture database failed: ${r.status}`);
  return r.status === 204 ? null : r.json();
}
async function control(mode) {
  const r = await fetch('http://faults:8080/control', mode ? { method: 'POST', body: JSON.stringify({ mode }) } : {});
  assert.equal(r.status, 200); return r.json();
}
async function call(token, name, args = {}) {
  const id = ++counter;
  const res = await fetch('http://127.0.0.1:3000/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }), signal: AbortSignal.timeout(35000) });
  const raw = await res.text();
  if (res.status !== 200) return { status: res.status, data: null };
  const body = res.headers.get('content-type')?.includes('text/event-stream') ? raw.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => JSON.parse(x.slice(5))).find(x => x.id === id) : JSON.parse(raw);
  const result = body?.result;
  if (body?.error || result?.isError) return { status: 200, failed: true };
  return { status: 200, failed: false, data: JSON.parse(result.content.find(x => x.type === 'text').text) };
}
async function data(token, name, args) { const r = await call(token, name, args); assert.equal(r.status, 200); assert.equal(r.failed, false, `${name} failed`); return r.data; }
async function test(id, label, fn) {
  if (process.env.LAB_CASE && process.env.LAB_CASE !== id) return;
  console.error(`Laboratory case: ${id}`);
  try { report.tests.push({ id, label, status: 'pass', detail: await fn() }); }
  catch (e) { report.tests.push({ id, label, status: 'fail', error: e instanceof assert.AssertionError ? e.message.split('\n')[0] : e.name }); }
  finally { await control('normal'); }
}
let originals = [];
let metricBackup = [];
try {
  assert.equal(process.env.POSTGREST_URL, 'http://faults:8080/db');
  const domains = await db('projects?select=domain');
  assert.ok(domains.every(x => ['', 'site-a.example', 'site-b.example'].includes(x.domain)));
  originals = await db('projects?slug=in.(lab-a,lab-b)&select=id,slug,domain,mcp_token,gsc_site_url,github_repo');
  const a = originals.find(x => x.slug === 'lab-a'); const b = originals.find(x => x.slug === 'lab-b');
  assert.ok(a && b, 'Run the baseline probe first');
  await control('normal');
  await test('C06-baseline', 'Both project bearers resolve before faults', async () => {
    for (const site of [a,b]) assert.equal((await data(site.mcp_token, 'get_project')).domain, site.domain);
    return 'Normal proxy path matches both fixture sites';
  });
  for (const mode of ['db-503','db-disconnect','missing-table']) {
    await test(`C06-${mode}`, 'Project bearers rejected during injected database failure', async () => {
      await control(mode);
      const statuses = []; for (const site of [a,b]) { const r = await call(site.mcp_token, 'get_project'); statuses.push(r.status); assert.equal(r.status, 401); assert.equal(r.data, null); }
      const health = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(35000) }); assert.equal(health.status, 503);
      return { project_statuses: statuses, health_status: health.status, limitation: '401 conflates unavailable database with invalid credentials' };
    });
  }
  await test('C06-missing-column', 'Migration compatibility fallback keeps the site', async () => {
    await control('missing-column');
    for (const site of [a,b]) { const p = await data(site.mcp_token, 'get_project'); assert.equal(p.domain, site.domain); assert.equal(p.auto_approve, false); }
    return 'Injected absent ai_choice column; older-column selection remains site scoped';
  });
  await test('C06-legacy-fallback', 'Legacy bearer resolves synthetic automatic project during outage', async () => {
    await control('db-503');
    const p = await data(legacyToken, 'get_project');
    assert.equal(p.domain, ''); assert.equal(p.mode, 'auto'); assert.equal(p.auto_approve, true); assert.equal(p.merge_enabled, true);
    return { gabi_requirement: 'not_met', observed: { domain: p.domain, mode: p.mode, auto_approve: p.auto_approve, merge_enabled: p.merge_enabled }, limitation: 'Flags only; no builder, merge or publication executed' };
  });
  await test('C06-recovery', 'Site identities recover after transport restoration', async () => {
    for (const site of [a,b]) assert.equal((await data(site.mcp_token, 'get_project')).domain, site.domain);
    return 'No process restart required for these reads';
  });
  await test('C13-github-shared-token', 'Site A can select B repository using the instance credential', async () => {
    await data(b.mcp_token, 'set_github_repo', { repo: 'gabi-lab-fixture/site-b' });
    await data(a.mcp_token, 'set_github_repo', { repo: 'gabi-lab-fixture/site-b' });
    const actions = await data(a.mcp_token, 'get_next_actions');
    assert.ok(actions.open_seo_prs.some(x => x.title === 'Synthetic B PR'));
    const events = (await control()).events.filter(x => x.provider === 'github');
    assert.ok(events.length >= 5); assert.equal(new Set(events.map(x => x.credential)).size, 1); assert.notEqual(events[0].credential, 'none');
    return { gabi_requirement: 'not_met', events, observation: 'Instance credential used for validation and B PR read through A; mock grants access to B' };
  });
  await test('C13-gsc-shared-account', 'Site A can probe B property using the instance service account', async () => {
    // Clear only these synthetic metric fixtures and restore them in finally.
    metricBackup = await db(`gsc_stats?project_id=in.(${a.id},${b.id})`);
    await db(`gsc_stats?project_id=in.(${a.id},${b.id})`, 'DELETE');
    for (const site of [a,b]) await data(site.mcp_token, 'set_gsc_property', { site_url: 'sc-domain:site-b.gabi-lab.example.org' });
    const markers = [];
    for (const site of [a,b]) {
      const r = await data(site.mcp_token, 'get_site_stats', { days: 1 });
      assert.equal(r.snapshots.length, 0, 'Synthetic stats must be temporarily removed for access probe');
      assert.match(r.note, /access is granted/); markers.push(r.note.includes('site-b.gabi-lab.example.org'));
    }
    const events = (await control()).events.filter(x => x.provider === 'google');
    const queries = events.filter(x => x.path.includes('/searchAnalytics/query'));
    assert.equal(queries.length, 2); assert.ok(queries.every(x => x.path.includes('site-b.gabi-lab.example.org')));
    assert.equal(new Set(queries.map(x => x.credential)).size, 1); assert.notEqual(queries[0].credential, 'none');
    return { gabi_requirement: 'not_met', events, observation: 'Successful property access probe, not bulk GSC extraction; simulator accepts issued token' };
  });
} catch (e) { report.fatal = e instanceof assert.AssertionError ? e.message.split('\n')[0] : e.name; }
finally {
  await control('normal');
  for (const p of originals) await db(`projects?id=eq.${p.id}`, 'PATCH', { gsc_site_url: p.gsc_site_url, github_repo: p.github_repo });
  if (metricBackup.length) await db('gsc_stats', 'POST', metricBackup);
}
report.summary = { passed: report.tests.filter(t => t.status === 'pass').length, failed: report.tests.filter(t => t.status === 'fail').length, confirmed_gabi_gaps: report.tests.filter(t => t.detail?.gabi_requirement === 'not_met').length };
console.log(JSON.stringify(report, null, 2));
if (report.fatal || report.summary.failed) process.exitCode = 1;
