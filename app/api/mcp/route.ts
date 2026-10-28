import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { GET as getProjects } from '@/app/api/integrations/v1/projects/route';
import { GET as getTasks } from '@/app/api/integrations/v1/tasks/route';
import { mcpConfig, verifyMcpBearer } from '@/lib/integrations/mcpAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function readIntegration(path: 'projects' | 'tasks', params: Record<string, string>) {
  const config = mcpConfig();
  if (!config) throw new Error('MCP indisponível.');
  const url = new URL(`/api/integrations/v1/${path}`, config.publicUrl);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  const request = new NextRequest(url, { headers: { authorization: `Bearer ${config.integrationKey}` } });
  const response = path === 'projects' ? await getProjects(request) : await getTasks(request);
  const body = await response.json();
  if (!response.ok) return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ status: response.status, error: body.error }) }] };
  return { content: [{ type: 'text' as const, text: JSON.stringify(body) }] };
}

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'projetos-readonly', version: '1.0.0' });
  server.registerTool('list_projects', {
    description: 'Lista projetos autorizados, com paginação. Usa o âmbito de leitura configurado no servidor.',
    inputSchema: z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(25), search: z.string().max(100).optional() }),
  }, async ({ page, pageSize, search }) => readIntegration('projects', { page: String(page), pageSize: String(pageSize), search: search || '' }));
  server.registerTool('list_project_tasks', {
    description: 'Lista tarefas de um projeto autorizado, com paginação.',
    inputSchema: z.object({ projectId: z.string().uuid(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(25) }),
  }, async ({ projectId, page, pageSize }) => readIntegration('tasks', { projectId, page: String(page), pageSize: String(pageSize) }));
  return server;
}, { responseMode: 'json' });

async function serve(request: NextRequest) {
  const config = mcpConfig();
  if (!config) return Response.json({ error: 'MCP não configurado.' }, { status: 503 });
  const publicUrl = new URL(config.publicUrl);
  const requestUrl = new URL(request.url);
  if (requestUrl.host !== publicUrl.host || requestUrl.pathname !== publicUrl.pathname ||
    (request.headers.get('origin') && request.headers.get('origin') !== publicUrl.origin))
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const identity = await verifyMcpBearer(request.headers.get('authorization'), config);
  if (!identity) return Response.json({ error: 'Não autorizado.' }, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer realm="Projetos MCP"', 'Cache-Control': 'no-store' },
  });
  return handler.fetch(request, { authInfo: { clientId: identity.userId, token: '', scopes: ['access_as_user'] } });
}

export async function POST(request: NextRequest) { return serve(request); }
export async function GET(request: NextRequest) { return serve(request); }
export async function DELETE(request: NextRequest) { return serve(request); }
