export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "ERP Gestão de Projetos & Encomendas API",
      version: "1.0.0",
      description: "API de projetos, tarefas, clientes e materiais. O planeamento por alocações foi descontinuado.",
      contact: {
        name: "Suporte Técnico",
        email: "suporte@erp-gestao.pt"
      }
    },
    servers: [
      {
        url: "/api/v1",
        description: "Servidor Principal API v1"
      }
    ],
    security: [{ BearerAuth: [] }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token de sessão gerado no Login do sistema"
        }
      },
      schemas: {
        PaginatedResult: {
          type: "object",
          required: ["success", "data", "count", "total", "page", "pageSize", "totalPages"],
          properties: {
            success: { type: "boolean" }, data: { type: "array", items: { type: "object" } },
            count: { type: "integer" }, total: { type: "integer" }, page: { type: "integer" },
            pageSize: { type: "integer" }, totalPages: { type: "integer" },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string", example: "Instalação de Linha de Produção 3" },
            clientId: { type: "string", format: "uuid" },
            projectManagerId: { type: "string", format: "uuid", description: "Project Leader" },
            categoryIds: { type: "array", minItems: 1, items: { type: "string", format: "uuid" } },
            description: { type: "string" },
            statusId: { type: "string", example: "ps-1" },
            categoryId: { type: "string", minLength: 1, example: "pc-1" },
            riskId: { type: "string", example: "pr-1" },
            priorityId: { type: "string", example: "pp-1" },
            demo: { type: "boolean", default: false },
            scheduledDate: { type: "string", format: "date" },
            forecastDate: { type: "string", format: "date", description: "Mês de início da instalação, representado pelo primeiro dia do mês; vazio quando não definido" },
            createdAt: { type: "string", format: "date-time" }
          },
          required: ["title", "clientId", "projectManagerId"],
          anyOf: [{ required: ["categoryId"] }, { required: ["categoryIds"] }]
        },
        ProjectMaterial: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            projectId: { type: "string", format: "uuid" },
            description: { type: "string", example: "Sensor Indutivo IFM M12 24V" },
            supplier: { type: "string", example: "ElectraLda / Siemens" },
            quantity: { type: "number", example: 4 },
            reference: { type: "string", example: "REF-88231" },
            budget: { oneOf: [{ type: "string" }, { type: "number" }], example: "ORC-2026-150" },
            costPrice: { type: "number", example: 120.00 },
            salePrice: { type: "number", example: 180.00 },
            expectedDeliveryDate: { type: "string", format: "date" },
            status: { type: "string", description: "Estado da linha, incluindo encomendado e em_armazem", example: "encomendado" },
            deleted: { type: "boolean", default: false }
          },
          required: ["projectId", "description", "supplier"]
        },
        Task: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string", example: "Montagem do Quadro Elétrico" },
            projectId: { type: "string", format: "uuid" },
            statusId: { type: "string", example: "ts-1" },
            taskTypeId: { type: "string", format: "uuid", example: "33333333-3333-3333-3333-333333333304", description: "ID do Tipo de Tarefa (configurável em Campos Auxiliares)" },
            isMilestone: { type: "boolean", default: false, description: "Retrocompatibilidade (Indica se é um Lembrete)" },
            estimatedHours: { type: "number", example: 8 },
            estimatedDate: { type: "string", format: "date" }
          },
          required: ["title", "taskTypeId", "statusId"]
        },
        Client: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            clientName: { type: "string", example: "Empresa Metalúrgica do Norte" },
            shortName: { type: "string" },
            taxId: { type: "string" },
            contactEmail: { type: "string", format: "email" },
            contactPhone: { type: "string" }
          },
          required: ["clientName"]
        },
        ApiError: {
          type: "object",
          properties: {
            error: { type: "object", properties: {
              code: { type: "string" }, message: { type: "string" }, requestId: { type: "string" }
            }, required: ["code", "message", "requestId"] }
          },
          required: ["error"]
        }
      }
    },
    paths: {
      "/projects": {
        get: {
          summary: "Listar todos os projetos ativos",
          tags: ["Projetos"],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "clientId", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Lista de projetos devolvida com sucesso",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResult" } } }
            }
          }
        },
        post: {
          summary: "Criar um novo projeto",
          tags: ["Projetos"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Project" }
              }
            }
          },
          responses: {
            "201": { description: "Projeto criado com sucesso" }
          }
        }
      },
      "/projects/{id}": {
        get: {
          summary: "Obter detalhes de um projeto específico",
          tags: ["Projetos"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Detalhes do projeto" },
            "404": { description: "Projeto não encontrado" }
          }
        },
        put: {
          summary: "Atualizar dados de um projeto",
          tags: ["Projetos"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Project" } }
            }
          },
          responses: {
            "200": { description: "Projeto atualizado" }
          }
        },
        delete: {
          summary: "Marcar projeto como eliminado",
          tags: ["Projetos"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Projeto removido" }
          }
        }
      },
      "/project-materials": {
        get: {
          summary: "Listar materiais/encomendas de projetos por página",
          tags: ["Materiais & Encomendas"],
          parameters: [
            { name: "projectId", in: "query", required: false, schema: { type: "string", format: "uuid" }, description: "Filtrar por projeto" },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } }
          ],
          responses: {
            "200": { description: "Página de linhas de material com count, total, page, pageSize, totalPages e data" },
            "400": { description: "Parâmetros inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }
          }
        },
        post: {
          summary: "Adicionar linha de material/encomenda a um projeto",
          tags: ["Materiais & Encomendas"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProjectMaterial" } }
            }
          },
          responses: {
            "201": { description: "Linha de material criada" },
            "400": { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
            "409": { description: "Conflito de concorrência", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }
          }
        }
      },
      "/project-materials/{id}": {
        put: {
          summary: "Atualizar material (ex: alterar estado para em_stock)",
          tags: ["Materiais & Encomendas"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProjectMaterial" } }
            }
          },
          responses: {
            "200": { description: "Linha de material atualizada" }
          }
        },
        delete: {
          summary: "Eliminar linha de material",
          tags: ["Materiais & Encomendas"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Linha de material eliminada" }
          }
        }
      },
      "/tasks": {
        get: {
          summary: "Listar tarefas de projetos",
          tags: ["Tarefas & Lembretes"],
          parameters: [
            { name: "projectId", in: "query", required: false, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }
          ],
          responses: {
            "200": { description: "Lista de tarefas", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResult" } } } }
          }
        },
        post: {
          summary: "Criar uma nova tarefa ou lembrete de projeto",
          tags: ["Tarefas & Lembretes"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Task" } }
            }
          },
          responses: {
            "201": { description: "Tarefa/Lembrete criado com sucesso" }
          }
        }
      },
      "/clients": {
        get: {
          summary: "Listar clientes registados",
          tags: ["Clientes"],
          responses: {
            "200": { description: "Lista de clientes" }
          }
        },
        post: {
          summary: "Adicionar novo cliente",
          tags: ["Clientes"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Client" } }
            }
          },
          responses: {
            "201": { description: "Cliente criado" }
          }
        }
      }
    }
  };

  const paths = openApiSpec.paths as Record<string, Record<string, any>>;
  paths['/clients/{id}'] = {
    get: { summary: 'Consultar cliente', tags: ['Clientes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cliente' } } },
    patch: { summary: 'Atualizar cliente', tags: ['Clientes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cliente atualizado' } } },
    put: { summary: 'Atualizar cliente', tags: ['Clientes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cliente atualizado' } } },
    delete: { summary: 'Eliminar cliente', tags: ['Clientes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cliente eliminado' } } },
  };
  paths['/tasks/{id}'] = {
    get: { summary: 'Consultar tarefa', tags: ['Tarefas & Lembretes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Tarefa' } } },
    patch: { summary: 'Atualizar tarefa', tags: ['Tarefas & Lembretes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Tarefa atualizada' } } },
    put: { summary: 'Atualizar tarefa', tags: ['Tarefas & Lembretes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Tarefa atualizada' } } },
    delete: { summary: 'Eliminar tarefa', tags: ['Tarefas & Lembretes'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Tarefa eliminada' } } },
  };
  paths['/projects/{id}'].patch = { ...paths['/projects/{id}'].put, summary: 'Atualizar parcialmente um projeto' };
  paths['/projects/ip-duplicate'] = { get: { summary: 'Verificar duplicação de identificador IP ou SF', tags: ['Projetos'],
    parameters: [
      { name: 'field', in: 'query', required: true, schema: { type: 'string', enum: ['ip', 'sf'] } },
      { name: 'value', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'excludeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
    ], responses: { '200': { description: 'Resultado da verificação' } } } };
  for (const [path, methods] of [
    ['/planning-allocations', ['get', 'post']],
    ['/planning-allocations/{id}', ['get', 'patch', 'delete']],
    ['/planning/availability', ['get']],
    ['/planning/capacity', ['get']],
    ['/planning/resource-load', ['get']],
  ] as const) {
    paths[path] = {};
    for (const method of methods) paths[path][method] = {
      summary: 'Endpoint de planeamento descontinuado', deprecated: true, tags: ['Planeamento'],
      responses: { '410': { description: 'PLANNING_RETIRED: utilizar datas e horas previstas da tarefa' } },
    };
  }
  for (const path of ['/projects', '/tasks']) {
    paths[path].post.parameters = [
      ...(paths[path].post.parameters || []),
      { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 8, maxLength: 128 },
        description: 'Repetir o mesmo pedido devolve a resposta guardada; conteúdo diferente devolve 409.' },
    ];
    paths[path].post.responses['409'] ||= { description: 'Chave em utilização ou reutilizada com conteúdo diferente.' };
  }
  for (const path of Object.values(paths)) {
    for (const operation of Object.values(path)) {
      operation.responses ||= {};
      for (const [status, description] of [['401', 'Autenticação necessária'], ['403', 'Permissão insuficiente'], ['429', 'Limite de pedidos excedido']]) {
        operation.responses[status] ||= { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } };
      }
    }
  }
  return NextResponse.json(openApiSpec);
}
