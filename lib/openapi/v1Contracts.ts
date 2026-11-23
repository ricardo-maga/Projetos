import { z, type ZodType } from 'zod';
import { createClientSchema, queryClientSchema, updateClientSchema } from '@/domains/clients/contracts/client';
import { createProjectSchema, projectListSchema, updateProjectSchema } from '@/domains/projects/contracts/project';
import { ruleInput } from '@/domains/communication/data/automationRuleRepository';
import { riskInput } from '@/domains/projects/data/riskRepository';
import { createDesignSchema, manageDesignSchema } from '@/lib/mechanicalDesign';
import { createPresalesSchema, presalesActionSchema } from '@/lib/presales';
import { presalesRegistrySchema } from '@/lib/presalesRegistry';
import { createProjectMaterialSchema, updateProjectMaterialSchema } from '@/lib/validations/operational';
import { createTaskSchema, queryTaskSchema, updateTaskSchema } from '@/lib/validations/task';
import {
  createAbsenceSchema, createProjectCommentSchema, createReferenceSchema, importProjectCsvSchema,
  reorderReferenceSchema, updateConfigurationSchema, updatePresalesOriginSchema,
  updatePresalesTemplateSchema, updateReferenceSchema,
} from '@/lib/validations/apiInputs';

type Paths = Record<string, Record<string, any>>;
const version = z.object({ syncVersion: z.number().int().positive() });
const bodySchema = (schema: ZodType) => {
  const { $schema, ...document } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return document;
};
const binaryUpload = { required: true, content: { 'multipart/form-data': { schema: {
  type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } },
} } } };

function operation(summary: string, status = 200) {
  return { summary, responses: { [status]: { description: summary } } };
}

export function addV1Contracts(paths: Paths) {
  paths['/openapi.json'] = { get: { ...operation('Consultar a especificação OpenAPI'), security: [] } };
  paths['/mechanical-design/{id}'].delete = operation('Arquivar pedido de desenho');
  paths['/project-materials/{id}'].get = operation('Consultar material do projeto');

  const versionInQuery = { name: 'version', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } };
  paths['/mechanical-design/{id}'].delete.parameters = [versionInQuery];
  paths['/presales'] = { get: operation('Listar pedidos Presales'), post: operation('Criar pedido Presales', 201) };
  paths['/presales/{id}'] = {
    get: operation('Consultar pedido Presales'),
    patch: operation('Atualizar pedido Presales'),
    delete: { ...operation('Arquivar pedido Presales'), parameters: [versionInQuery] },
  };
  paths['/presales/registry'] = { post: operation('Criar processo Presales no registo', 201) };
  paths['/presales/registry/{id}'] = { patch: operation('Editar processo Presales no registo') };
  paths['/presales/origins'] = { get: operation('Listar origens Presales'), patch: operation('Atualizar origem Presales') };
  paths['/presales/templates'] = { get: operation('Listar modelos Presales'), patch: operation('Atualizar modelo Presales') };
  paths['/presales/{id}/assets'] = { post: { ...operation('Carregar imagem Presales', 201), requestBody: binaryUpload } };
  paths['/presales/{id}/assets/{assetId}'] = { get: { summary: 'Obter imagem Presales', responses: {
    200: { description: 'Imagem', content: Object.fromEntries(['image/png', 'image/jpeg', 'image/webp'].map(type =>
      [type, { schema: { type: 'string', format: 'binary' } }])) },
  } } };
  paths['/projects/comments'] = { post: operation('Criar comentário de projeto', 201) };
  paths['/projects/risks'] = { post: operation('Criar risco de projeto', 201) };
  paths['/projects/risks/{id}'] = { patch: operation('Atualizar risco de projeto'), delete: operation('Eliminar risco de projeto') };
  paths['/configuration'] = { patch: operation('Atualizar configuração') };
  paths['/reference-data'] = {
    post: operation('Criar dado de referência', 201), patch: operation('Atualizar dado de referência'),
    delete: operation('Eliminar dado de referência'),
  };
  paths['/reference-data/reorder'] = { post: operation('Reordenar dados de referência') };
  paths['/automation-rules'] = { post: operation('Criar regra de automação', 201) };
  paths['/automation-rules/{id}'] = { patch: operation('Atualizar regra de automação'), delete: operation('Eliminar regra de automação') };
  paths['/absences'] = { post: operation('Registar ausência', 201) };
  paths['/jobs/{id}'] = { get: { ...operation('Consultar um processamento ou descarregar o resultado'),
    parameters: [{ name: 'download', in: 'query', schema: { type: 'string', enum: ['1'] } }] } };
  paths['/projects/import'].post.parameters = [{ name: 'Prefer', in: 'header', schema: { type: 'string', enum: ['respond-async'] } }];
  paths['/projects/import'].post.responses['202'] = { description: 'Lotes com mais de 100 linhas e Prefer respond-async devolvem jobId' };

  const bodies: Record<string, Record<string, ZodType>> = {
    '/absences': { post: createAbsenceSchema },
    '/automation-rules': { post: ruleInput },
    '/automation-rules/{id}': { patch: ruleInput.extend(version.shape), delete: version },
    '/clients': { post: createClientSchema },
    '/clients/{id}': { put: updateClientSchema, patch: updateClientSchema },
    '/configuration': { patch: updateConfigurationSchema },
    '/mechanical-design': { post: createDesignSchema },
    '/mechanical-design/{id}': { patch: manageDesignSchema },
    '/presales': { post: createPresalesSchema },
    '/presales/templates': { patch: updatePresalesTemplateSchema },
    '/presales/origins': { patch: updatePresalesOriginSchema },
    '/presales/registry': { post: presalesRegistrySchema },
    '/presales/registry/{id}': { patch: presalesRegistrySchema },
    '/presales/{id}': { patch: presalesActionSchema },
    '/project-materials': { post: createProjectMaterialSchema },
    '/project-materials/{id}': { put: updateProjectMaterialSchema },
    '/projects': { post: createProjectSchema },
    '/projects/{id}': { put: updateProjectSchema, patch: updateProjectSchema },
    '/projects/comments': { post: createProjectCommentSchema },
    '/projects/import': { post: importProjectCsvSchema },
    '/projects/risks': { post: riskInput },
    '/projects/risks/{id}': { patch: riskInput.extend(version.shape), delete: version },
    '/reference-data': { post: createReferenceSchema, patch: updateReferenceSchema,
      delete: updateReferenceSchema.pick({ collection: true, id: true, syncVersion: true }) },
    '/reference-data/reorder': { post: reorderReferenceSchema },
    '/tasks': { post: createTaskSchema },
    '/tasks/{id}': { put: updateTaskSchema, patch: updateTaskSchema },
  };
  for (const [path, operations] of Object.entries(bodies)) {
    for (const [method, schema] of Object.entries(operations)) {
      paths[path][method].requestBody = {
        required: true, content: { 'application/json': { schema: bodySchema(schema) } },
      };
    }
  }
  for (const [path, schema] of Object.entries({
    '/projects': projectListSchema, '/clients': queryClientSchema, '/tasks': queryTaskSchema,
  })) {
    const document = z.toJSONSchema(schema, { unrepresentable: 'any' });
    paths[path].get.parameters = Object.entries(document.properties || {}).map(([name, value]) =>
      ({ name, in: 'query', schema: value }));
  }
  for (const path of ['/presales', '/presales/registry']) {
    paths[path].post.parameters = [{ name: 'Idempotency-Key', in: 'header', required: true,
      schema: { type: 'string', minLength: 8, maxLength: 128 } }];
  }
  for (const [path, methods] of [['/projects/{id}', ['put', 'patch']], ['/project-materials/{id}', ['put']]] as const) {
    for (const method of methods) {
      const entry = paths[path][method];
      entry.parameters = [...(entry.parameters || []), { name: 'If-Match', in: 'header', schema: { type: 'string' } }];
      entry.responses['412'] = { description: 'O ETag deixou de corresponder ao recurso' };
      entry.responses['428'] = { description: 'A configuração exige If-Match ou a versão no corpo' };
    }
  }
  for (const path of ['/projects', '/projects/{id}', '/project-materials/{id}']) {
    const entry = paths[path].get;
    entry.parameters = [...(entry.parameters || []), { name: 'If-None-Match', in: 'header', schema: { type: 'string' } }];
    entry.responses['304'] = { description: 'Recurso inalterado' };
  }
  for (const [path, methods] of Object.entries(paths)) {
    for (const entry of Object.values(methods)) {
      entry.parameters ||= [];
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
        if (!entry.parameters.some((parameter: { name: string; in: string }) => parameter.in === 'path' && parameter.name === name)) {
          entry.parameters.push({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
        }
      }
    }
  }
}
