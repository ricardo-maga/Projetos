import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, forbidden, notFound, badRequest } from '@/lib/apiErrors';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { requireAuth, requirePermission } from '@/lib/auth/requireAuth';
import { isUuid } from '@/lib/security/identifiers';
import { auditCsvCell, auditCsvColumns } from '@/domains/administration/modules/auditQuery';
import type { SupabaseClient } from '@supabase/supabase-js';

function auditDownload(db: SupabaseClient, jobId: string, count: number) {
  const encoder = new TextEncoder();
  let ordinal = 0;
  return new NextResponse(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('\uFEFF' + auditCsvColumns.map(auditCsvCell).join(';') + '\r\n'));
    },
    async pull(controller) {
      if (ordinal >= count) { controller.close(); return; }
      const { data, error } = await db.from('api_job_chunks').select('ordinal,rows')
        .eq('job_id', jobId).gt('ordinal', ordinal).order('ordinal').limit(25);
      if (error || !data?.length) { controller.error(new Error('Exportação indisponível.')); return; }
      for (const { rows: row, ordinal: offset } of data) {
        controller.enqueue(encoder.encode([
          row.created_at, row.user_name, row.action, row.source || 'legacy', row.outcome,
          row.entity_name || row.entity_type, row.entity_id, row.project_id, row.changes, row.request_id,
        ].map(auditCsvCell).join(';') + '\r\n'));
        ordinal = offset;
      }
    },
  }), { headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="registo-de-auditoria.csv"' } });
}

export const GET = createApiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req, { includePermissions: false });
  const requestId = user.requestId || crypto.randomUUID();
  const { id } = await params;
  if (!isUuid(id)) return badRequest('Identificador inválido.', requestId);
  const db = requireServerDbClient(user);
  const { data: job, error } = await db.from('api_jobs').select('kind,status,result,error_code')
    .eq('id', id).eq('actor_id', user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!job) return notFound('Processamento indisponível ou expirado.', requestId);
  await requirePermission(req, job.kind === 'audit_export' ? 'admin.access' : 'projects.write');

  if (req.nextUrl.searchParams.get('download') === '1') {
    if (job.kind !== 'audit_export' || job.status !== 'succeeded')
      return forbidden('A exportação ainda não está disponível.', requestId);
    return auditDownload(db, id, job.result.count);
  }
  const message = job.error_code === 'AUDIT_ROW_LIMIT' ? 'Selecione um período com até 10 000 eventos.'
    : job.status === 'failed' ? 'Não foi possível concluir o processamento.' : undefined;
  return NextResponse.json({ success: true, data: { status: job.status, result: job.result, message } }, {
    headers: { 'Cache-Control': 'private, no-store', ...(job.status === 'queued' ? { 'Retry-After': '2' } : {}) },
  });
});
