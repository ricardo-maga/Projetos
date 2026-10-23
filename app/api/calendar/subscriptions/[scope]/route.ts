import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requirePermission } from '@/lib/auth/requireAuth';
import { calendarFeedDb, hashFeedToken, validFeedScope } from '@/lib/calendarFeedServer';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ scope: string }> };
const privateHeaders = { 'Cache-Control': 'private, no-store' };

function failure(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 503;
  return NextResponse.json({ error: error instanceof AuthError ? error.message : 'Serviço de calendário indisponível.' },
    { status, headers: privateHeaders });
}

export async function GET(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404 });
  try {
    const user = await requirePermission(req, 'calendar_read');
    const { data, error } = await calendarFeedDb().from('calendar_feed_tokens')
      .select('rotated_at').eq('user_id', user.id).eq('scope', scope).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ configured: Boolean(data), rotatedAt: data?.rotated_at || null }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404 });
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin)
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  try {
    const user = await requirePermission(req, 'calendar_read');
    if (!(await checkRateLimit(`calendar-feed-rotate:${user.id}`, { limit: 10, windowSeconds: 3600 })).success)
      return NextResponse.json({ error: 'Limite de renovações atingido.' }, { status: 429, headers: privateHeaders });
    const token = randomBytes(32).toString('base64url');
    const { error } = await calendarFeedDb().from('calendar_feed_tokens').upsert({
      user_id: user.id, scope, token_hash: hashFeedToken(token), rotated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,scope' });
    if (error) throw error;
    return NextResponse.json({ path: `/api/calendar/feeds/${scope}/${token}.ics`, configured: true }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  const { scope } = await context.params;
  if (!validFeedScope(scope)) return NextResponse.json({ error: 'Calendário desconhecido.' }, { status: 404 });
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin)
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  try {
    const user = await requirePermission(req, 'calendar_read');
    const { error } = await calendarFeedDb().from('calendar_feed_tokens')
      .delete().eq('user_id', user.id).eq('scope', scope);
    if (error) throw error;
    return NextResponse.json({ configured: false }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
