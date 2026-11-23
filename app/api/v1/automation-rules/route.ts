export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { mapRule, ruleInput, rulePayload, validateAgainstStatuses } from '@/domains/communication/data/automationRuleRepository';
import { getIdempotentEntityId, withUserIdempotency } from '@/lib/apiIdempotency';
import { createApiHandler } from '@/lib/apiErrors';

async function createRule(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = ruleInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Regra inválida.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const problem = await validateAgainstStatuses(db, parsed.data);
    if (problem) return NextResponse.json({ success: false, message: problem }, { status: 400 });
    const id = getIdempotentEntityId(req);
    const { data, error } = await db.from('automation_rules')
      .insert({ ...rulePayload(parsed.data), ...(id ? { id } : {}) }).select('*').single();
    if (error || !data) throw error || new Error('Missing rule');
    return NextResponse.json({ success: true, data: mapRule(data) }, { status: 201 });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível criar a regra.' }, { status: 503 }); }
}

export const POST = createApiHandler(withUserIdempotency(createRule, 'automation_rules:create', 'config_write'));
