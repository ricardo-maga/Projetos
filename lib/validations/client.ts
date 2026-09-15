import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'O nome do cliente deve ter no mínimo 2 caracteres'),
  code: z.string().optional().default(''),
  contactPerson: z.string().optional().default(''),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  postalCode: z.string().optional().default(''),
  country: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  color: z.string().optional().default('#3b82f6'),
});

export const updateClientSchema = createClientSchema.partial().extend({
  version: z.number().int().min(1, 'Número de versão obrigatório para controlo de concorrência'),
});

export const queryClientSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
});
