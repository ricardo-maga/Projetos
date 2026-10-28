export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { badRequest, internalServerError } from '@/lib/apiErrors';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const params = new URL(req.url).searchParams;
  const field = params.get('field');
  const value = params.get('value')?.trim();
  const excludeId = params.get('excludeId');
  if ((field !== 'ip' && field !== 'sf') || !value || value.length > 200) {
    return badRequest('Valor de projeto inválido.', auth.requestId);
  }

  try {
    const sb = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', auth.requestId);

    let query = sb.from('projects')
      .select('id, project_title, client_id, clients(client_name)')
      .eq('deleted', false)
      .eq(field === 'ip' ? 'install_project_no' : 'sf_opportunity_no', value);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    const row = data?.[0] as any;
    return NextResponse.json({
      success: true,
      duplicate: row ? {
        id: row.id,
        title: row.project_title,
        clientName: (Array.isArray(row.clients) ? row.clients[0] : row.clients)?.client_name || 'Cliente desconhecido',
      } : null,
    });
  } catch (error) {
    console.error('[API PROJECT IDENTIFIER DUPLICATE]', error);
    return internalServerError('Falha ao verificar o identificador do projeto.', auth.requestId);
  }
}

