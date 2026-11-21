import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { auditCsvCell, auditFilters, decodeAuditCursor, queryAudit } from '@/domains/administration/modules/auditQuery';

export async function handleAudit(req: NextRequest, exportCsv: boolean) {
  try {
    const user = await requireAuth(req);
    const client = requireServerDbClient(user);
    const { data: permitted, error: permissionError } = await client.rpc('has_permission', {
      p_permission_code: 'admin:access', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (permitted !== true) throw new ForbiddenError();

    const params = req.nextUrl.searchParams;
    const parsed = auditFilters.safeParse(Object.fromEntries(params));
    if (!parsed.success || (parsed.data.cursor && !decodeAuditCursor(parsed.data.cursor))) {
      return NextResponse.json({ success: false, message: 'Filtros de auditoria inválidos.' }, { status: 400 });
    }
    const options = { headers: { 'Cache-Control': 'private, no-store' } };
    if (!exportCsv) {
      return NextResponse.json({ success: true, ...await queryAudit(client, parsed.data) }, options);
    }

    const filters = { ...parsed.data, limit: 200, cursor: undefined, to: parsed.data.to ?? new Date().toISOString() };
    const rows: Awaited<ReturnType<typeof queryAudit>>['data'] = [];
    let cursor: string | undefined;
    do {
      const page = await queryAudit(client, { ...filters, cursor });
      rows.push(...page.data);
      if (rows.length > 10_000 || (rows.length === 10_000 && page.nextCursor)) {
        return NextResponse.json({ success: false, message: 'Selecione um período com até 10 000 eventos.' }, { status: 422 });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const { search, ...recordedFilters } = filters;
    const { error: writeError } = await client.from('audit_logs').insert({
      audit_version: 1, user_id: user.id, actor_id: user.id, user_name: user.name,
      action: 'audit.export_prepared', entity_type: 'audit',
      source: 'application', outcome: 'succeeded', request_id: crypto.randomUUID(),
      changes: { filters: { after: { ...recordedFilters, searchApplied: Boolean(search) } }, row_count: { after: rows.length } },
    });
    if (writeError) throw writeError;

    const csv = [
      ['Data/hora UTC', 'Autor', 'Ação', 'Origem', 'Resultado', 'Entidade', 'ID', 'Projeto', 'Alterações', 'Pedido'],
      ...rows.map(row => [row.timestamp, row.userName, row.action, row.source, row.outcome,
        row.entityName || row.entityType, row.entityId, row.projectId, row.changes, row.requestId]),
    ].map(row => row.map(auditCsvCell).join(';')).join('\r\n');
    return new NextResponse('\uFEFF' + csv, { headers: {
      ...options.headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="registo-de-auditoria.csv"',
    } });
  } catch (error) {
    if (!(error instanceof AuthError)) console.error('[AUDIT QUERY]', error);
    return NextResponse.json({ success: false, message: error instanceof AuthError ? error.message : 'Erro no serviço de auditoria.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}

