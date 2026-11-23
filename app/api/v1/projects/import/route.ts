import { createApiHandler } from '@/lib/apiErrors';
import { importProjectCsvSchema } from '@/lib/validations/apiInputs';
import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { forbidden, rateLimitExceeded, serviceUnavailable } from '@/lib/apiErrors';
import { consumeEdgeQuotas } from '@/lib/security/edgeRateLimit';
import { enqueueApiJob, wantsAsyncResponse } from '@/lib/apiJobs';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

export const dynamic = 'force-dynamic';

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

async function handlePost(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;
  const parsed = importProjectCsvSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: 'CSV inválido ou demasiado grande.' }, { status: 400 });

  const csv = Papa.parse<Record<string, string>>(parsed.data.csv, { header: true, skipEmptyLines: 'greedy' });
  if (csv.errors.length || !csv.data.length || csv.data.length > 250) {
    return NextResponse.json({ success: false, message: 'O CSV deve conter entre 1 e 250 linhas válidas.' }, { status: 400 });
  }
  const fields = Object.fromEntries(Object.entries(columns).map(([key, names]) =>
    [key, csv.meta.fields?.find(header => names.includes(normalize(header)))]));
  const missing = Object.entries(fields).filter(([, header]) => !header).map(([key]) => key);
  if (missing.length) return NextResponse.json({ success: false, message: `Colunas em falta: ${missing.join(', ')}.` }, { status: 400 });

  const rows = csv.data.map((row, index) => {
    const get = (key: keyof typeof columns) => String(row[fields[key]!] || '').trim();
    try {
      const title = get('title');
      const client = get('client');
      const ip = get('ip');
      const sf = get('sf');
      if (!title || !client) throw new Error('Nome de projeto e cliente são obrigatórios.');
      if ([title, client, ip, sf].some(value => value.length > 255))
        throw new Error('Nome ou identificador excede 255 caracteres.');
      return { line: index + 2, title, client, client_key: normalize(client), starts_on: startDate(get('start')), ip, sf };
    } catch (error) {
      return { line: index + 2, error: error instanceof Error ? error.message : 'Linha inválida.' };
    }
  });

  const { user, requestId } = auth;
  try {
    const [quota] = await consumeEdgeQuotas([{ identifier: `project-import:${user.id}`, limit: 500, cost: rows.length }]);
    if (!quota.success) return rateLimitExceeded(requestId, 'Limite de linhas CSV excedido.', Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000)));
    const db = requireServerDbClient(user);
    if (rows.length > 100 && wantsAsyncResponse(req))
      return await enqueueApiJob(db, user, 'project_import', rows);
    const { data, error } = await db.rpc('import_project_csv_rows', {
      p_actor: user.id, p_rows: rows, p_batch: crypto.randomUUID(),
    });
    if (error?.code === '42501') return forbidden('Sem permissão para importar projetos.', requestId);
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[PROJECT IMPORT]', error);
    return serviceUnavailable('Não foi possível processar o CSV.', requestId);
  }
}

export const POST = createApiHandler(handlePost);
