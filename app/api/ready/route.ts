import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = createAdminClient();
  let ready = false;
  if (db) {
    try {
      const { data, error } = await db.rpc('api_actor_context', {
        p_auth_user_id: null, p_permission: null, p_include_permissions: false,
      }).abortSignal(AbortSignal.timeout(3000));
      ready = !error && data?.profile === null;
    } catch {
      // Readiness stays closed when the dependency cannot be reached.
    }
  }
  return Response.json({ success: ready }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
