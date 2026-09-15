import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Endereço de email inválido'),
  password: z.string().min(6, 'A password deve ter pelo menos 6 caracteres'),
  rememberMe: z.boolean().optional().default(true),
});

export const bootstrapSchema = z.object({
  secret: z.string().min(1, 'O secret de bootstrap é obrigatório'),
  adminEmail: z.string().trim().email('Email de administrador inválido'),
  adminPassword: z.string().min(8, 'A password de administrador deve ter no mínimo 8 caracteres'),
  adminName: z.string().trim().min(2, 'O nome de administrador deve ter no mínimo 2 caracteres').optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter no mínimo 2 caracteres'),
  email: z.string().trim().email('Endereço de email inválido'),
  password: z.string().min(6, 'A password deve ter pelo menos 6 caracteres'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('Endereço de email inválido'),
});

export const resetPasswordSchema = passwordResetRequestSchema;

export const passwordResetConfirmSchema = z.object({
  password: z.string().min(8, 'A nova password deve ter no mínimo 8 caracteres'),
});
