// Executed only inside the existing lab app by facade-check.mjs.
// The injected action is trusted harness data, never a Gabi request.
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.env.POSTGREST_URL, 'http://postgrest:3000');
async function db(path, method = 'GET', body) {
  const response = await fetch(`http://postgrest:3000/${path}`, {
    method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  assert.ok(response.ok, `Fixture HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const projects = await db('projects?select=id,domain');
assert.ok(projects.every(p => ['', 'site-a.example', 'site-b.example'].includes(p.domain)), 'Non-laboratory data: refusing');
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
if (action.kind === 'seed') {
  const output = [];
  for (const [index, id] of ids.entries()) {
    const letter = ['a', 'b'][index];
    const token = randomBytes(32).toString('hex');
    const rows = await db('projects?on_conflict=id', 'POST', {
      id, slug: `lab-${letter}`, name: `Lab ${letter.toUpperCase()}`, domain: `site-${letter}.example`, mcp_token: token,
      mode: 'custom', auto_approve: false, auto_approve_tools: false, auto_build_guides: false, auto_build_tools: false,
      auto_merge: false, publish_target: 'manual', gsc_site_url: null, github_repo: null
    });
    await db('suggestions?on_conflict=id', 'POST', {
      id: `20000000-0000-4000-8000-00000000000${index + 1}`, project_id: id, type: 'guide',
      title: `Synthetic idea ${letter}`, rationale: `Synthetic rationale ${letter}`, status: 'pending', source: 'research'
    });
    await db(`gsc_stats?project_id=eq.${id}`, 'DELETE');
    await db('gsc_stats?on_conflict=project_id,date', 'POST', {
      project_id: id, date: new Date().toISOString().slice(0, 10), clicks: (index + 1) * 111,
      impressions: (index + 1) * 1110, top_queries: [], top_pages: []
    });
    output.push({ id, token, slug: rows[0].slug, name: rows[0].name, domain: rows[0].domain, created_at: rows[0].created_at });
  }
  // Captured by the parent in memory; must never be printed by the tool runner.
  process.stdout.write(JSON.stringify(output));
} else if (action.kind === 'revoke') {
  assert.ok(ids.includes(action.id));
  await db(`projects?id=eq.${action.id}`, 'PATCH', { mcp_token: randomBytes(32).toString('hex') });
  process.stdout.write('{}');
} else if (action.kind === 'inspect') {
  const states = await db('suggestions?select=id,project_id,status,title&order=id');
  const config = await db('projects?select=id,domain,auto_approve,auto_approve_tools,auto_build_guides,auto_build_tools,auto_merge,gsc_site_url,github_repo&order=id');
  process.stdout.write(JSON.stringify({ states, config }));
} else throw new Error('Unknown fixture action');
