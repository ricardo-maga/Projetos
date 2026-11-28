import { z } from 'zod';
import { getProjectSharepointUrl, projectSharepointUrlError } from './sharepointUrl';

const forecastDate = z.string().refine(value => value === '' || /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value), 'O Forecast deve indicar mês e ano válidos.');
const description = z.string().max(10000);
const sharepointUrl = z.string().trim()
  .refine(value => value === '' || Boolean(getProjectSharepointUrl(value)), projectSharepointUrlError)
  .describe('Ligação HTTPS para o SharePoint. Um valor vazio remove a ligação e a omissão preserva-a numa atualização.');
const shortText = z.string().max(255);
const relationIds = z.array(z.string().trim().max(64)).max(100);
const documents = z.array(z.string().max(2048)).max(100);

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'O título do projeto é obrigatório').max(255, 'O título do projeto não pode ter mais de 255 caracteres'),
  clientId: z.string().trim().min(1, 'O cliente é obrigatório'),
  description: description.optional().default(''),
  sharepointUrl: sharepointUrl.optional(),
  installProjectNo: shortText.optional().default(''),
  sfOpportunityNo: shortText.optional().default(''),
  statusId: z.string().optional().default(''),
  categoryId: z.string().optional().default(''),
  categoryIds: relationIds.optional().default([]),
  priorityId: z.string().optional().default(''),
  riskId: z.string().optional().default(''),
  projectManagerId: z.string().trim().min(1, 'O Project Leader é obrigatório'),
  fieldManagerId: z.string().optional().nullable().default(''),
  salesRepId: z.string().optional().nullable().default(''),
  teamIds: relationIds.optional().default([]),
  teamsInvolvedIds: relationIds.optional().default([]),
  partnerIds: relationIds.optional().default([]),
  partnersIds: relationIds.optional().default([]),
  startDate: z.string().optional().default(''),
  deliveryDate: z.string().optional().default(''),
  estimatedDate: z.string().optional().default(''),
  scheduledDate: z.string().optional().default(''),
  forecastDate: forecastDate.optional().default(''),
  completedDate: z.string().optional().default(''),
  budgetValue: z.coerce.number().min(0, 'O orçamento do projeto não pode ser negativo').optional().default(0),
  isUrgent: z.boolean().optional().default(false),
  demo: z.boolean().optional().default(false),
  documents: documents.optional().default([]),
  clientContactName: shortText.optional().default(''),
  clientContactEmail: z.string().max(254).optional().default(''),
  clientContactPhone: z.string().max(50).optional().default(''),
  color: z.string().max(32).optional(),
  notes: description.optional(),
  createdById: z.string().optional(),
  version: z.number().int().min(1).optional().default(1),
}).refine(
  (project) => project.categoryIds.some((id) => id.length > 0) || project.categoryId.trim().length > 0,
  { path: ['categoryIds'], message: 'Selecione pelo menos uma categoria.' }
);

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1, 'O título do projeto é obrigatório').max(255, 'O título do projeto não pode ter mais de 255 caracteres').optional(),
  clientId: z.string().optional(),
  description: description.optional(),
  sharepointUrl: sharepointUrl.optional(),
  installProjectNo: shortText.optional(),
  sfOpportunityNo: shortText.optional(),
  statusId: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: relationIds.optional(),
  priorityId: z.string().optional(),
  riskId: z.string().optional(),
  projectManagerId: z.string().optional().nullable(),
  fieldManagerId: z.string().optional().nullable(),
  salesRepId: z.string().optional().nullable(),
  teamIds: relationIds.optional(),
  teamsInvolvedIds: relationIds.optional(),
  partnerIds: relationIds.optional(),
  partnersIds: relationIds.optional(),
  startDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  estimatedDate: z.string().optional(),
  scheduledDate: z.string().optional(),
  forecastDate: forecastDate.optional(),
  completedDate: z.string().optional(),
  budgetValue: z.coerce.number().min(0, 'O orçamento do projeto não pode ser negativo').optional(),
  isUrgent: z.boolean().optional(),
  demo: z.boolean().optional(),
  documents: documents.optional(),
  clientContactName: shortText.optional(),
  clientContactEmail: z.string().max(254).optional(),
  clientContactPhone: z.string().max(50).optional(),
  color: z.string().max(32).optional(),
  notes: description.optional(),
  createdById: z.string().optional(),
  version: z.number().int().min(1, 'A versão do projeto deve ser um número inteiro superior a 0').optional(),
});

export const queryProjectSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).regex(/^[^\u0000-\u001f\u007f]*$/).optional().default(''),
  statusId: z.preprocess(value => value === '' ? undefined : value, z.guid().optional()),
  categoryId: z.preprocess(value => value === '' ? undefined : value, z.guid().optional()),
  managerId: z.preprocess(value => value === '' ? undefined : value, z.guid().optional()),
  clientId: z.preprocess(value => value === '' ? undefined : value, z.guid().optional()),
  statusGroup: z.enum(['active', 'implementation', 'all', 'completed']).optional(),
});

export const projectSort = z.enum(['createdAt', '-createdAt']);
export const projectFields = z.enum([
  'id', 'title', 'description', 'sharepointUrl', 'clientId', 'statusId', 'categoryId', 'projectManagerId', 'fieldManagerId',
  'salesRepId', 'startDate', 'deliveryDate', 'estimatedDate', 'scheduledDate', 'forecastDate', 'completedDate',
  'installProjectNo', 'sfOpportunityNo', 'budgetValue', 'isUrgent', 'createdAt', 'updatedAt', 'version',
]);
export const projectIncludes = z.enum(['teams', 'partners', 'categories', 'priority', 'risk']);
export const projectListSchema = queryProjectSchema.extend({
  cursor: z.string().max(160).regex(/^[A-Za-z0-9_-]+$/).optional(),
  pagination: z.enum(['offset', 'cursor']).optional(),
  sort: projectSort.optional(),
  fields: z.string().max(512).refine(value => value.split(',').every(field => projectFields.safeParse(field).success)).optional(),
  include: z.string().max(100).refine(value => value.split(',').every(name => projectIncludes.safeParse(name).success)).optional(),
});
