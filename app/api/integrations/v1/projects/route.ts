import { NextRequest, NextResponse } from 'next/server';
import { authenticateIntegration } from '@/lib/integrations/auth';
import { queryProjectSchema } from '@/lib/validations/project';
import { listProjects } from '@/lib/projects/projectService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateIntegration(req, 'projects:read');
  if ('response' in auth) return auth.response;
  const parsed = queryProjectSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 422 });
  try {
    const result = await listProjects(auth.db, {
      ...parsed.data,
      allowedClientIds: auth.integration.client_ids,
      allowedProjectIds: auth.integration.project_ids,
      includeDeleted: false,
    });
    return NextResponse.json({ success: true, ...result, count: result.data.length });
  } catch {
    return NextResponse.json({ error: 'Falha ao consultar projetos.' }, { status: 500 });
  }
}
