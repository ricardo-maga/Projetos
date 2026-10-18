import { NextRequest, NextResponse } from 'next/server';
import { authenticateIntegration } from '@/lib/integrations/auth';
import { queryTaskSchema } from '@/lib/validations/task';
import { listTasksServer } from '@/lib/tasks/taskService';
import { projectInIntegrationScope } from '@/lib/integrations/scope';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateIntegration(req, 'tasks:read');
  if ('response' in auth) return auth.response;
  const parsed = queryTaskSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success || !parsed.data.projectId)
    return NextResponse.json({ error: 'Indique um projectId válido.' }, { status: 422 });
  try {
    const { data: project, error } = await auth.db.from('projects').select('id,client_id')
      .eq('id', parsed.data.projectId).eq('deleted', false).maybeSingle();
    if (error) throw error;
    if (!project || !projectInIntegrationScope(auth.integration, project))
      return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
    const result = await listTasksServer(auth.db, parsed.data);
    if (!result.success) throw new Error(result.error);
    return NextResponse.json({ ...result, count: result.data?.length || 0 });
  } catch {
    return NextResponse.json({ error: 'Falha ao consultar tarefas.' }, { status: 500 });
  }
}
