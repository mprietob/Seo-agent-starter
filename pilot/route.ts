// Gabi overlay for DispatchSEO fbf28b2 (AGPL-3.0-only). No Google client here.
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { getFreshSnapshots } from '@/lib/gsc';

export const maxDuration = 120;
let running = false;
export async function POST(request: Request) {
  const expected = process.env.GABI_SYNC_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!expected || !supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (running) return Response.json({ error: 'busy' }, { status: 409 });
  running = true;
  try {
    const { data: projects, error } = await db().from('projects').select('*');
    if (error || !projects || projects.length !== 1) throw new Error('configuration');
    const p = projects[0];
    if (p.id !== process.env.GABI_PROJECT_ID || p.gsc_site_url !== process.env.GSC_SITE_URL || !p.gsc_site_url || p.github_repo || p.publish_target !== 'manual' || p.auto_approve || p.auto_approve_tools || p.auto_build_guides || p.auto_build_tools || p.auto_merge) throw new Error('configuration');
    // Existing upstream function: last seven days, top 100 queries/pages per day,
    // provisional data included. No cron, indexing sweep, research or builders.
    const snapshots = await getFreshSnapshots(p.gsc_site_url, 7);
    if (snapshots.length) {
      const result = await db().from('gsc_stats').upsert(snapshots.map(s => ({ ...s, project_id: p.id })), { onConflict: 'project_id,date' });
      if (result.error) throw new Error('storage');
    }
    return Response.json({ ok: true, dates: snapshots.map(s => s.date), captured_at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'gsc_sync_failed' }, { status: 503 });
  } finally { running = false; }
}
