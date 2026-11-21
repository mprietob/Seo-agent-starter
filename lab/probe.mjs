// Laboratory only. Direct database access seeds synthetic fixtures and checks
// side effects; this is NOT an integration adapter or an authorization layer.
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000/api/mcp';
const dbBase = 'http://postgrest:3000';
const output = { upstream_commit: 'fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26', captured_at: new Date().toISOString(), tests: [], schemas: {} };
let rpcId = 0;
async function db(path, method = 'GET', data) {
  const res = await fetch(`${dbBase}/${path}`, { method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10000) });
  assert.ok(res.ok, `Fixture database HTTP ${res.status} for ${path.split('?')[0]}`);
  return res.status === 204 ? null : res.json();
}
async function rpc(token, method, params = {}, chat = false) {
  const requestId = ++rpcId;
  const res = await fetch(base + (chat ? '?client=chat' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }), signal: AbortSignal.timeout(45000) });
  const raw = await res.text();
  let body;
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const events = raw.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => JSON.parse(x.slice(5)));
    body = events.find(x => x.id === requestId) ?? events.at(-1);
  } else { body = raw ? JSON.parse(raw) : null; }
  return { status: res.status, body };
}
async function call(token, name, args = {}, chat = false) {
  const r = await rpc(token, 'tools/call', { name, arguments: args }, chat);
  assert.equal(r.status, 200, `MCP HTTP for ${name}`);
  if (r.body.error) return { failed: true, data: null };
  const result = r.body.result;
  const text = result.content?.find(x => x.type === 'text')?.text;
  // SDK validation failures can be plain text even though handler responses
  // are JSON. Never execute or trust an error message as an instruction.
  if (result.isError) {
    let format = 'json';
    try { JSON.parse(text); } catch { format = 'text'; }
    return { failed: true, data: null, error_format: format };
  }
  return { failed: false, data: text ? JSON.parse(text) : null };
}
async function data(token, name, args = {}, chat = false) {
  const r = await call(token, name, args, chat);
  assert.equal(r.failed, false, `${name} returned a tool error`);
  return r.data;
}
async function test(id, label, fn) {
  try { const detail = await fn(); output.tests.push({ id, label, status: 'pass', ...(detail ? { detail } : {}) }); }
  catch (e) { output.tests.push({ id, label, status: 'fail', error: e instanceof assert.AssertionError ? e.message.split('\n')[0] : e.name }); }
}
try {
  assert.equal(process.env.POSTGREST_URL, dbBase, 'Run only inside the dedicated lab app');
  const existing = await db('projects?select=domain');
  assert.ok(existing.every(p => ['', 'site-a.example', 'site-b.example'].includes(p.domain)), 'Refusing a database with non-laboratory sites');
  const sites = ['a', 'b'].map((name, i) => ({ name, id: `10000000-0000-4000-8000-00000000000${i + 1}`, idea: `20000000-0000-4000-8000-00000000000${i + 1}`, token: randomBytes(32).toString('hex'), clicks: (i + 1) * 111 }));
  for (const s of sites) {
    await db('projects?on_conflict=id', 'POST', { id: s.id, slug: `lab-${s.name}`, name: `Lab ${s.name.toUpperCase()}`, domain: `site-${s.name}.example`, mcp_token: s.token, mode: 'custom', auto_approve: false, auto_approve_tools: false, auto_build_guides: false, auto_build_tools: false, auto_merge: false, keyword_source: 'gsc', publish_target: 'manual' });
    await db('suggestions?on_conflict=id', 'POST', { id: s.idea, project_id: s.id, type: 'guide', title: `Synthetic idea ${s.name}`, primary_keyword: `lab-keyword-${s.name}`, status: 'pending', source: 'research' });
  }
  const [a, b] = sites;
  await test('C01-health', 'Application reaches database', async () => {
    const r = await fetch('http://127.0.0.1:3000/api/health'); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
  });
  await test('C02-missing-invalid', 'Missing and unknown bearer rejected', async () => {
    for (const token of [null, randomBytes(32).toString('hex')]) assert.equal((await rpc(token, 'tools/list')).status, 401);
  });
  await test('protocol', 'MCP initialization and runtime inventory', async () => {
    const init = await rpc(a.token, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gabi-lab', version: '0.1' } });
    assert.equal(init.status, 200); assert.ok(init.body.result?.protocolVersion);
    const agent = await rpc(a.token, 'tools/list'); const chat = await rpc(a.token, 'tools/list', {}, true);
    assert.ok(agent.body.result?.tools); assert.ok(chat.body.result?.tools);
    output.schemas.agent = agent.body.result.tools.map(({ name, inputSchema, annotations }) => ({ name, inputSchema, annotations }));
    output.schemas.chat = chat.body.result.tools.map(({ name, inputSchema, annotations }) => ({ name, inputSchema, annotations }));
    assert.equal(output.schemas.agent.length, 73); assert.ok(output.schemas.chat.length < 73);
    return { protocol: init.body.result.protocolVersion, agent_tools: output.schemas.agent.length, chat_tools: output.schemas.chat.length };
  });
  await test('C11-no-gsc', 'Unconnected GSC distinguished from measured traffic', async () => {
    // Reset only this dedicated synthetic site's metrics so repeat runs test
    // the empty case too. The domain guard above excludes production data.
    await db(`gsc_stats?project_id=eq.${a.id}`, 'DELETE');
    const r = await data(a.token, 'get_site_stats', { days: 1 });
    assert.equal(r.snapshots.length, 0);
    assert.match(r.note, /no Search Console property/);
  });
  for (const s of sites) {
    await db('gsc_stats?on_conflict=project_id,date', 'POST', { project_id: s.id, date: new Date().toISOString().slice(0, 10), clicks: s.clicks, impressions: s.clicks * 10, top_queries: [{ query: `lab-query-${s.name}`, clicks: s.clicks }], top_pages: [] });
  }
  await test('C03-context-ideas-metrics', 'Bidirectional site isolation in three reads', async () => {
    for (const s of sites) {
      assert.equal((await data(s.token, 'get_project')).domain, `site-${s.name}.example`);
      const ideas = await data(s.token, 'get_suggestions', { status: 'pending' });
      assert.ok(ideas.some(x => x.id === s.idea)); assert.ok(ideas.every(x => x.project_id === s.id));
      const stats = await data(s.token, 'get_site_stats', { days: 1 });
      assert.equal(stats.summary.total_clicks, s.clicks); assert.ok(stats.snapshots.every(x => x.project_id === s.id));
    }
  });
  await test('C04-concurrent', 'Twenty alternating concurrent site reads', async () => {
    await Promise.all(Array.from({ length: 20 }, async (_, i) => { const s = sites[i % 2]; assert.equal((await data(s.token, 'get_project')).domain, `site-${s.name}.example`); }));
  });
  await test('C05-cross-write', 'Cross-site idea writes rejected in both directions', async () => {
    for (const [caller, target] of [[a, b], [b, a]]) {
      const before = await db(`suggestions?id=eq.${target.idea}&select=status`);
      const r = await call(caller.token, 'update_suggestion', { id: target.idea, status: 'rejected', decided_by: 'owner' });
      assert.equal(r.failed, true); assert.deepEqual(await db(`suggestions?id=eq.${target.idea}&select=status`), before);
    }
  });
  await test('C07-upstream-characterization', 'Agent approval coerced; self-declared owner accepted', async () => {
    await data(a.token, 'update_suggestion', { id: a.idea, status: 'approved', decided_by: 'agent' });
    assert.equal((await db(`suggestions?id=eq.${a.idea}&select=status`))[0].status, 'pending');
    await data(a.token, 'update_suggestion', { id: a.idea, status: 'approved', decided_by: 'owner' });
    assert.equal((await db(`suggestions?id=eq.${a.idea}&select=status`))[0].status, 'approved');
    return 'Confirms a Gabi adoption gap; this is not a pass of Gabi human-approval enforcement';
  });
  await test('C10-upstream-invalid-input', 'Malformed UUID rejected', async () => { const r = await call(a.token, 'update_suggestion', { id: 'not-a-uuid', status: 'approved' }); assert.equal(r.failed, true); return { error_format: r.error_format }; });
  await test('C12-chat-surface', 'Chat and agent modes resolve the same site', async () => {
    assert.equal((await data(a.token, 'get_project', {}, true)).domain, 'site-a.example');
    assert.equal((await data(b.token, 'get_project', {}, true)).domain, 'site-b.example');
    return 'Upstream behavior only; Gabi permissions are not implemented';
  });
  await test('C02-revoked', 'Rotated bearer stops working', async () => {
    const replacement = randomBytes(32).toString('hex');
    await db(`projects?id=eq.${b.id}`, 'PATCH', { mcp_token: replacement });
    assert.equal((await rpc(b.token, 'tools/list')).status, 401);
    assert.equal((await data(replacement, 'get_project')).domain, 'site-b.example');
  });
  await test('network-egress', 'External HTTPS unavailable from app', async () => {
    let reached = false;
    try { await fetch('https://example.com', { signal: AbortSignal.timeout(4000) }); reached = true; } catch {}
    assert.equal(reached, false);
    return 'One connectivity probe plus Compose internal network; not a packet capture';
  });
  // Restore the fixture state for manual inspection; tokens never leave memory/DB.
  await db(`suggestions?id=eq.${a.idea}`, 'PATCH', { status: 'pending' });
  output.summary = { passed: output.tests.filter(t => t.status === 'pass').length, failed: output.tests.filter(t => t.status === 'fail').length };
  console.log(JSON.stringify(output, null, 2));
  if (output.summary.failed) process.exitCode = 1;
} catch (e) {
  console.log(JSON.stringify({ ...output, fatal: e instanceof assert.AssertionError ? e.message.split('\n')[0] : e.name }));
  process.exitCode = 1;
}
