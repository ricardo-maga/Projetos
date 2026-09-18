import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "ERP Gestão de Projetos & Encomendas API",
      version: "1.0.0",
      description: "API RESTful completa para a gestão de projetos, tarefas, clientes e materiais/encomendas com validação de stock.",
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
        Project: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string", example: "Instalação de Linha de Produção 3" },
            clientId: { type: "string", format: "uuid" },
            description: { type: "string" },
            statusId: { type: "string", example: "ps-1" },
            categoryId: { type: "string", example: "pc-1" },
            riskId: { type: "string", example: "pr-1" },
            priorityId: { type: "string", example: "pp-1" },
            demo: { type: "boolean", default: false },
            scheduledDate: { type: "string", format: "date" },
            createdAt: { type: "string", format: "date-time" }
          },
          required: ["title", "clientId"]
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
            budget: { type: "number", example: 150.00 },
            costPrice: { type: "number", example: 120.00 },
            salePrice: { type: "number", example: 180.00 },
            expectedDeliveryDate: { type: "string", format: "date" },
            status: { type: "string", enum: ["encomendado", "em_stock"], example: "encomendado" },
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
            isMilestone: { type: "boolean", default: false, description: "Retrocompatibilidade (Indica se é um Marco de Projeto)" },
            estimatedHours: { type: "number", example: 8 },
            estimatedDate: { type: "string", format: "date" }
          },
          required: ["title", "projectId"]
        },
        Client: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Empresa Metalúrgica do Norte" },
            email: { type: "string", format: "email" },
            phone: { type: "string" },
            nif: { type: "string" }
          },
          required: ["name"]
        }
      }
    },
    paths: {
      "/projects": {
        get: {
          summary: "Listar todos os projetos ativos",
          tags: ["Projetos"],
          responses: {
            "200": {
              description: "Lista de projetos devolvida com sucesso"
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
          summary: "Listar materiais/encomendas de projetos",
          tags: ["Materiais & Encomendas"],
          parameters: [
            { name: "projectId", in: "query", required: false, schema: { type: "string" }, description: "Filtrar por projeto" }
          ],
          responses: {
            "200": { description: "Lista de linhas de material" }
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
            "201": { description: "Linha de material criada" }
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
          tags: ["Tarefas & Marcos"],
          parameters: [
            { name: "projectId", in: "query", required: false, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Lista de tarefas" }
          }
        },
        post: {
          summary: "Criar uma nova tarefa ou marco de projeto",
          tags: ["Tarefas & Marcos"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Task" } }
            }
          },
          responses: {
            "201": { description: "Tarefa/Marco criado com sucesso" }
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

  return NextResponse.json(openApiSpec);
}
