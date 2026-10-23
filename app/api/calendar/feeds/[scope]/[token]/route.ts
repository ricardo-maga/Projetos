import { NextRequest, NextResponse } from 'next/server';
import { calendarFeedDb, hashFeedToken, loadCalendarFeedData, validFeedScope } from '@/lib/calendarFeedServer';
import { renderCalendarFeed } from '@/lib/calendarFeeds';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ scope: string; token: string }> };
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_req: NextRequest, context: Context) {
  const { scope, token: filename } = await context.params;
  if (!validFeedScope(scope) || !/^[A-Za-z0-9_-]{43}\.ics$/.test(filename))
    return new NextResponse(null, { status: 404, headers });
  const token = filename.slice(0, -4);
  try {
    const db = calendarFeedDb();
    const { data: subscription, error: tokenError } = await db.from('calendar_feed_tokens')
      .select('user_id').eq('scope', scope).eq('token_hash', hashFeedToken(token)).maybeSingle();
    if (tokenError) throw tokenError;
    if (!subscription) return new NextResponse(null, { status: 404, headers });

    const { data: user, error: userError } = await db.from('users')
      .select('id,auth_user_id,approved,deleted,type').eq('id', subscription.user_id).maybeSingle();
    if (userError) throw userError;
    if (!user || !user.auth_user_id || !user.approved || user.deleted || user.type === 'External')
      return new NextResponse(null, { status: 404, headers });

    const { data: permitted, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'calendar:read', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw permissionError;
    if (permitted !== true) return new NextResponse(null, { status: 404, headers });

    const data = await loadCalendarFeedData(scope, user.id);
    return new NextResponse(renderCalendarFeed(data), { status: 200, headers: {
      ...headers, 'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${scope === 'mine' ? 'minhas-tarefas' : 'todas-as-tarefas'}.ics"`,
    } });
  } catch (error) {
    console.error('[CALENDAR FEED] Falha ao gerar feed:', error);
    return new NextResponse(null, { status: 503, headers });
  }
}
