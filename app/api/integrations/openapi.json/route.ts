import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    openapi: '3.0.3',
    info: { title: 'API de integrações de leitura', version: '1.0.0' },
    servers: [{ url: '/api/integrations/v1' }],
    security: [{ IntegrationKey: [] }],
    components: {
      securitySchemes: { IntegrationKey: { type: 'http', scheme: 'bearer', description: 'Chave erp_int_ criada por um administrador.' } },
      schemas: { Page: { type: 'object', required: ['success', 'data', 'total', 'page', 'pageSize', 'totalPages'], properties: {
        success: { type: 'boolean' }, data: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' },
        page: { type: 'integer' }, pageSize: { type: 'integer' }, totalPages: { type: 'integer' },
      } } },
    },
    paths: {
      '/projects': { get: { summary: 'Projetos autorizados', description: 'O âmbito por cliente ou projeto é imposto no servidor.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
          { name: 'clientId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ], responses: { '200': { description: 'Página de projetos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Page' } } } },
          '401': { description: 'Credencial inválida' }, '403': { description: 'Sem permissão' }, '429': { description: 'Quota excedida' } } } },
      '/tasks': { get: { summary: 'Tarefas de um projeto autorizado',
        parameters: [
          { name: 'projectId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        ], responses: { '200': { description: 'Página de tarefas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Page' } } } },
          '401': { description: 'Credencial inválida' }, '403': { description: 'Sem permissão' }, '404': { description: 'Projeto fora do âmbito' }, '429': { description: 'Quota excedida' } } } },
      '/projects/changes': { get: { summary: 'Alterações de projetos e eliminações',
        parameters: [
          { name: 'since', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ], responses: { '200': { description: 'Alterações com hasMore e nextCursor; eliminações têm data=null' } } } },
      '/tasks/changes': { get: { summary: 'Alterações de tarefas num projeto autorizado',
        parameters: [
          { name: 'since', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'projectId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ], responses: { '200': { description: 'Alterações com hasMore e nextCursor; eliminações têm data=null' } } } },
    },
  });
}
