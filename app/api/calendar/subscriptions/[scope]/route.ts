import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requirePermission } from '@/lib/auth/requireAuth';
import { calendarFeedDb, calendarFeedPath, deriveCalendarFeedToken, hashFeedToken, validFeedScope } from '@/domains/calendar/data/calendarFeedServer';
import { checkRateLimit } from '@/lib/rateLimit';
import { hasSameRequestOrigin } from '@/lib/security/requestOrigin';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ scope: string }> };
const privateHeaders = { 'Cache-Control': 'private, no-store' };

function failure(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 503;
  if (!(error instanceof AuthError)) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.error('[CALENDAR SUBSCRIPTION]', typeof code === 'string' ? code : 'UNAVAILABLE');
  }
  return NextResponse.json({ error: error instanceof AuthError ? error.message : 'Serviço de calendário indisponível.' },
    { status, headers: privateHeaders });
}

export async function GET(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404, headers: privateHeaders });
  try {
    const user = await requirePermission(req, 'calendar_read');
    const { data, error } = await calendarFeedDb().from('calendar_feed_tokens')
      .select('rotated_at,token_hash,token_nonce').eq('user_id', user.id).eq('scope', scope).maybeSingle();
    if (error) throw error;
    const token = data?.token_nonce ? deriveCalendarFeedToken(user.id, scope, data.token_nonce) : null;
    const path = token && hashFeedToken(token) === data?.token_hash ? calendarFeedPath(scope, token) : null;
    return NextResponse.json({ configured: Boolean(data), rotatedAt: data?.rotated_at || null, path }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404, headers: privateHeaders });
  if (!hasSameRequestOrigin(req))
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  try {
    const user = await requirePermission(req, 'calendar_read');
    if (!(await checkRateLimit(`calendar-feed-rotate:${user.id}`, { limit: 10, windowSeconds: 3600 })).success)
      return NextResponse.json({ error: 'Limite de renovações atingido.' }, { status: 429, headers: { ...privateHeaders, 'Retry-After': '3600' } });
    const nonce = randomUUID();
    const token = deriveCalendarFeedToken(user.id, scope, nonce);
    const { error } = await requireServerDbClient(user).from('calendar_feed_tokens').upsert({
      user_id: user.id, scope, token_hash: hashFeedToken(token), token_nonce: nonce, rotated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,scope' });
    if (error) throw error;
    return NextResponse.json({ path: calendarFeedPath(scope, token), configured: true }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404, headers: privateHeaders });
  if (!hasSameRequestOrigin(req))
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  try {
    const user = await requirePermission(req, 'calendar_read');
    const { error } = await requireServerDbClient(user).from('calendar_feed_tokens')
      .delete().eq('user_id', user.id).eq('scope', scope);
    if (error) throw error;
    return NextResponse.json({ configured: false }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
