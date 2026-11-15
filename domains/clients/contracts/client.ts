import { z } from 'zod';

export const createClientSchema = z.object({
  id: z.guid().optional(),
  clientName: z.string().trim().min(2, 'O nome do cliente deve ter no mínimo 2 caracteres').max(200),
  shortName: z.string().max(100).optional().default(''),
  location: z.string().max(300).optional().default(''),
  taxId: z.string().max(50).optional().default(''),
  contactPerson: z.string().max(200).optional().default(''),
  contactEmail: z.string().max(254).email('Email inválido').optional().or(z.literal('')).default(''),
  contactPhone: z.string().max(50).optional().default(''),
  notes: z.string().max(10000).optional().default(''),
  color: z.string().max(32).optional().default('#3b82f6'),
});

export const updateClientSchema = z.object({
  clientName: z.string().trim().min(2, 'O nome do cliente deve ter no mínimo 2 caracteres').max(200).optional(),
  shortName: z.string().max(100).optional(),
  location: z.string().max(300).optional(),
  taxId: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  contactEmail: z.string().max(254).email('Email inválido').optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  notes: z.string().max(10000).optional(),
  color: z.string().max(32).optional(),
  version: z.number().int().min(1, 'Número de versão obrigatório para controlo de concorrência'),
});

export const queryClientSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).regex(/^[^\u0000-\u001f\u007f]*$/).optional().default(''),
});
