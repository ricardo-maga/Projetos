export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = requireServerDbClient(user);
    const checks = await Promise.all(['config:read', 'admin:access'].map(async code => {
      const { data, error } = await db.rpc('has_permission', { p_permission_code: code, p_user_id: user.auth_user_id });
      if (error) throw new Error('permission lookup failed');
      return data === true;
    }));
    const [canReadSettings, canReadAutomations] = checks;
    if (!canReadSettings && !canReadAutomations) {
      return NextResponse.json({ success: false, message: 'Sem permissão para consultar configurações.' }, { status: 403, headers: noStore });
    }

    const [settingsResult, rulesResult] = await Promise.all([
      canReadSettings ? db.from('notification_settings').select('*').order('type') : Promise.resolve({ data: [], error: null }),
      canReadAutomations ? db.from('automation_rules').select('*').eq('deleted', false).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (settingsResult.error || rulesResult.error) throw new Error('config query failed');

    return NextResponse.json({ success: true, data: {
      notificationSettings: (settingsResult.data || []).map((row: any) => ({
        id: row.id, type: row.type, name: row.name, enabled: row.enabled === true,
        daysBefore: row.days_before ?? 0, targetGroup: row.target_group || 'allocated',
      })),
      automationRules: (rulesResult.data || []).map((row: any) => ({
        id: row.id, name: row.name || '', description: row.description || '',
        triggerType: row.trigger_type || 'manual', triggerCondition: row.trigger_condition || {},
        actions: row.actions || [], enabled: row.enabled !== false, deleted: row.deleted === true,
        createdDate: row.created_at || '', syncVersion: row.sync_version,
      })),
    } }, { headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível consultar as configurações.' }, { status: 503, headers: noStore });
  }
}
