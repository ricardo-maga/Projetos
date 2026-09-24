import { z } from 'zod';

export const createClientSchema = z.object({
  id: z.string().uuid().optional(),
  clientName: z.string().trim().min(2, 'O nome do cliente deve ter no mínimo 2 caracteres'),
  shortName: z.string().optional().default(''),
  location: z.string().optional().default(''),
  taxId: z.string().optional().default(''),
  contactPerson: z.string().optional().default(''),
  contactEmail: z.string().email('Email inválido').optional().or(z.literal('')).default(''),
  contactPhone: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  color: z.string().optional().default('#3b82f6'),
});

export const updateClientSchema = z.object({
  clientName: z.string().trim().min(2, 'O nome do cliente deve ter no mínimo 2 caracteres').optional(),
  shortName: z.string().optional(),
  location: z.string().optional(),
  taxId: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
  version: z.number().int().min(1, 'Número de versão obrigatório para controlo de concorrência'),
});

export const queryClientSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
});

