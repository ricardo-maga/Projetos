import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { z } from 'zod';
import { POST as createProject } from '@/app/api/v1/projects/route';
import { POST as createClient } from '@/app/api/v1/clients/route';
import { requirePermission } from '@/lib/auth/authorization';
import { AuthError, requirePermission as requireDatabasePermission } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { runWithAuditOperation } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ csv: z.string().trim().min(1).max(256_000) });
const columns = {
  title: ['nomedeprojeto', 'nomedoprojeto', 'titulodoprojeto', 'titulo', 'projeto'],
  client: ['cliente'],
  ip: ['nip', 'numeroip', 'noip', 'ip'],
  sf: ['nsf', 'numerosf', 'nosf', 'sf'],
  start: ['datainicio', 'datadeinicio', 'inicio'],
};
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function startDate(value: string) {
  const pt = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = pt ? `${pt[3]}-${pt[2]}-${pt[1]}` : value;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error('Data início inválida. Use AAAA-MM-DD ou DD/MM/AAAA.');
  }
  return iso;
}

function internalPost(req: NextRequest, path: string, data: unknown) {
  const headers = new Headers();
  for (const key of ['authorization', 'cookie']) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('content-type', 'application/json');
  return new NextRequest(new URL(path, req.url), { method: 'POST', headers, body: JSON.stringify(data) });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: 'CSV inválido ou demasiado grande.' }, { status: 400 });

  const csv = Papa.parse<Record<string, string>>(parsed.data.csv, { header: true, skipEmptyLines: 'greedy' });
  if (csv.errors.length || !csv.data.length || csv.data.length > 250) {
    return NextResponse.json({ success: false, message: 'O CSV deve conter entre 1 e 250 linhas válidas.' }, { status: 400 });
  }
  const fields = Object.fromEntries(Object.entries(columns).map(([key, names]) =>
    [key, csv.meta.fields?.find(header => names.includes(normalize(header)))]));
  const missing = Object.entries(fields).filter(([, header]) => !header).map(([key]) => key);
  if (missing.length) return NextResponse.json({ success: false, message: `Colunas em falta: ${missing.join(', ')}.` }, { status: 400 });

  const { user } = auth;
  const batchId = crypto.randomUUID();
  try {
    const db = requireServerDbClient(user);
    const principal = await requireDatabasePermission(req, 'projects:write');
    const grants = await Promise.all(['clients:read', 'clients:write'].map(code =>
      db.rpc('has_permission', { p_permission_code: code, p_user_id: principal.auth_user_id })));
    if (grants.some(grant => grant.error)) throw new Error('Falha a consultar permissões de clientes.');
    const [canReadClients, canWriteClients] = grants.map(grant => grant.data === true);
    const [statuses, categories, clients] = await Promise.all([
      db.from('project_status').select('id').eq('deleted', false).order('sort_order').limit(1),
      db.from('project_category').select('id').eq('deleted', false).order('sort_order').limit(1),
      canReadClients
        ? db.from('clients').select('id,client_name,short_name').eq('deleted', false)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (statuses.error || categories.error || clients.error) throw new Error('Falha a consultar dados de referência.');
    const knownClients = new Map((clients.data || []).flatMap(client => [client.client_name, client.short_name]
      .filter(Boolean).map((name: string) => [normalize(name), client.id] as const)));
    const statusId = statuses.data?.[0]?.id;
    const categoryId = categories.data?.[0]?.id;
    const errors: string[] = [];
    let imported = 0;
    let createdClients = 0;

    // A failed project can leave its newly created client. Count and audit
    // that committed write separately, matching the previous import behavior.
    await runWithAuditOperation(batchId, async () => {
      for (const [index, row] of csv.data.entries()) {
        try {
          const get = (key: keyof typeof columns) => String(row[fields[key]!] || '').trim();
          const title = get('title');
          const clientName = get('client');
          if (!title || !clientName) throw new Error('Nome de projeto e cliente são obrigatórios.');
          if (title.length > 255) throw new Error('Nome de projeto excede 255 caracteres.');
          const date = startDate(get('start'));
          let clientId = knownClients.get(normalize(clientName));
          if (!clientId) {
            if (!canWriteClients) throw new Error('Cliente inexistente e sem permissão para o criar.');
            const response = await createClient(internalPost(req, '/api/v1/clients', { clientName, shortName: clientName }));
            if (!response.ok) throw new Error('Não foi possível criar o cliente.');
            clientId = (await response.json()).data?.id;
            if (!clientId) throw new Error('Não foi possível confirmar a criação do cliente.');
            knownClients.set(normalize(clientName), clientId);
            createdClients++;
          }
          const response = await createProject(internalPost(req, '/api/v1/projects', {
            title, clientId, description: 'Importado por CSV', categoryIds: categoryId ? [categoryId] : [],
            statusId, projectManagerId: user.id, startDate: date, installProjectNo: get('ip'), sfOpportunityNo: get('sf'),
          }));
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error?.message || result.message || 'Não foi possível criar o projeto.');
          }
          imported++;
        } catch (error) {
          errors.push(`Linha ${index + 2}: ${error instanceof Error ? error.message : 'Não foi possível importar o projeto.'}`);
        }
      }
    });

    const { error: auditError } = await db.from('audit_logs').insert({
      audit_version: 1, actor_id: user.id, user_id: user.id, user_name: user.name,
      action: 'project_import.completed', entity_type: 'project_import', entity_id: batchId,
      source: 'application', outcome: errors.length ? (imported || createdClients ? 'partial' : 'failed') : 'succeeded',
      request_id: batchId, changes: {
        imported: { after: imported }, failed: { after: errors.length }, clients_created: { after: createdClients },
      },
    });
    if (auditError) console.error('[PROJECT IMPORT AUDIT]', auditError.code);
    return NextResponse.json({ success: true, data: { success: imported, failed: errors.length, errors, batchId },
      ...(auditError ? { message: 'A importação foi processada, mas faltou registar o resumo de auditoria.' } : {}) });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
    console.error('[PROJECT IMPORT]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível processar o CSV.' }, { status: 503 });
  }
}
