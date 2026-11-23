import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().max(254).email('Endereço de email inválido'),
  password: z.string().min(1, 'A password é obrigatória').max(1024),
  rememberMe: z.boolean().optional().default(false),
});

export const bootstrapSchema = z.object({
  secret: z.string().min(1, 'O secret de bootstrap é obrigatório').max(256),
  adminEmail: z.string().trim().max(254).email('Email de administrador inválido'),
  adminPassword: z.string().min(8, 'A password de administrador deve ter no mínimo 8 caracteres').max(1024),
  adminName: z.string().trim().min(2, 'O nome de administrador deve ter no mínimo 2 caracteres').max(200).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter no mínimo 2 caracteres').max(200),
  email: z.string().trim().max(254).email('Endereço de email inválido'),
  password: z.string().min(12, 'A password deve ter pelo menos 12 caracteres').max(1024),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().max(254).email('Endereço de email inválido'),
});

export const resetPasswordSchema = passwordResetRequestSchema;

export const passwordResetConfirmSchema = z.object({
  password: z.string().min(12, 'A nova password deve ter no mínimo 12 caracteres').max(1024),
});

export const passwordChangeSchema = passwordResetConfirmSchema.extend({
  currentPassword: z.string().min(1).max(1024),
});
