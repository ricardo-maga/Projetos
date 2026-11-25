export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { SYNC_READ_PERMISSIONS, projectSyncRead } from '@/lib/supabase/syncReadProjection';
import { isSyncPartition, SYNC_PARTITIONS } from '@/lib/supabase/syncPartitions';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor.' 
    }, { status: 500 });
  }

  try {
    const user = await requireAuth(req);

    const clientToUse = requireServerDbClient(user);
    const requestedPartition = new URL(req.url).searchParams.get('partition');
    const partition = requestedPartition && isSyncPartition(requestedPartition) ? requestedPartition : null;
    if (!requestedPartition)
      return NextResponse.json({ success: false, message: 'Use uma partição de dados.' }, { status: 410 });
    if (!partition)
      return NextResponse.json({ success: false, message: 'Partição de dados inválida.' }, { status: 400 });
    const requested = new Set<string>(SYNC_PARTITIONS[partition].map(String));
    const codes = [...new Set([
      ...Object.entries(SYNC_READ_PERMISSIONS).filter(([field]) => requested.has(field)).map(([, code]) => code),
      ...(requested.has('users') ? ['users:read'] : []),
    ])];
    const decisions = await Promise.all(codes.map(async code => {
      const { data, error } = await clientToUse.rpc('has_permission', { p_permission_code: code, p_user_id: user.auth_user_id });
      if (error) throw new AuthError('Não foi possível validar permissões de leitura.', 503);
      return [code, data === true] as const;
    }));
    const permissions = new Map(decisions);
    const readableDomains = new Set(requested);
    for (const [field, code] of Object.entries(SYNC_READ_PERMISSIONS))
      if (permissions.get(code) !== true) readableDomains.delete(field);
    // Project materials have a paginated, permission-checked domain API.
    readableDomains.delete('projectMaterials');
    if (permissions.get('users:read') !== true) readableDomains.delete('users');
    const result = await getActiveStateFromSupabase(clientToUse,
      { readableDomains, userId: user.id, skipNotifications: true, skipConfigRuntime: true, skipDefaultTasks: true });
    if (!result.success || !result.data) {
      return NextResponse.json({
        success: false,
        message: result.message || 'Falha ao sincronizar com a base de dados.',
      }, { status: 500 });
    }
    result.data = projectSyncRead(result.data, user.id, permissions);
    if (requested.has('notifications')) {
      const { data: recipientNotices, error: noticesError } = await clientToUse.from('notifications')
        .select('id,user_id,title,message,is_read,created_at,link_url')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false }).limit(200);
      if (noticesError) throw noticesError;
      result.data.notifications = (recipientNotices || []).map(notice => ({
        id: notice.id, userId: notice.user_id || 'all', title: notice.title,
        message: notice.message || '', isRead: notice.is_read === true,
        createdDate: notice.created_at, linkUrl: notice.link_url || undefined,
      }));
      const visibleIds = result.data.notifications.map(notification => notification.id);
      if (visibleIds.length) {
        const { data: reads, error: readsError } = await clientToUse.from('notification_reads')
          .select('notification_id').eq('user_id', user.id).in('notification_id', visibleIds);
        if (readsError) throw readsError;
        const readIds = new Set((reads || []).map(read => read.notification_id));
        result.data.notifications = result.data.notifications.map(notification => ({
          ...notification,
          isRead: readIds.has(notification.id) || (notification.userId !== 'all' && notification.isRead),
        }));
      }
    }

    return NextResponse.json({ ...result, data: Object.fromEntries(SYNC_PARTITIONS[partition]
      .map(field => [field, result.data![field]])) });
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({
        success: false,
        message: error.message || 'Sem permissão para realizar esta operação.',
      }, { status: 403 });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ 
        success: false, 
        message: error.message || 'Sessão inválida ou expirada.' 
      }, { status: error.statusCode || 401 });
    }
    return NextResponse.json({ 
      success: false, 
      message: formatSupabaseError(error) 
    }, { status: 500 });
  }
}

// Retired after all UI mutations moved to domain APIs.
export async function POST(req: NextRequest) {
  try {
    // All legacy writes are retired, including the profile writes prohibited by main.
    await requireAuth(req);
    return NextResponse.json({ success: false, message: 'Use as APIs de domínio.' }, { status: 410 });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Sessão inválida.' },
      { status: error instanceof AuthError ? error.statusCode : 503 });
  }
}
