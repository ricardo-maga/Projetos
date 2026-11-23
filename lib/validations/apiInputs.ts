import { z } from 'zod';

import { referenceCollection, referenceFields } from '@/domains/administration/data/referenceData';

export const createAbsenceSchema = z.object({
  userId: z.guid(),
  absenceStartDate: z.iso.date(),
  absenceEndDate: z.iso.date(),
  reason: z.enum(['Vacation', 'Sick leave', 'Other']).default('Other'),
}).refine(value => value.absenceEndDate >= value.absenceStartDate);

export const configurationChanges = z.object({
  appName: z.string().max(200).optional(), appDescription: z.string().max(2000).optional(),
  footerText: z.string().max(2000).optional(), footerCopyrightText: z.string().max(2000).optional(),
  logo: z.string().max(524288).optional(), logoImagePath: z.string().max(524288).optional(), theme: z.string().max(100).optional(),
  salesRepGroupIds: z.array(z.guid()).optional(), projManagerGroupIds: z.array(z.guid()).optional(),
  fieldManagerGroupIds: z.array(z.guid()).optional(), taskAssigneeGroupIds: z.array(z.guid()).optional(),
  salesRepGroupId: z.string().optional(), projManagerGroupId: z.string().optional(),
  fieldManagerGroupId: z.string().optional(), taskAssigneeGroupId: z.string().optional(),
}).strict();
export const updateConfigurationSchema = z.object({ syncVersion: z.number().int().positive(), updates: configurationChanges });

export const createProjectCommentSchema = z.object({ projectId: z.guid(), comment: z.string().trim().min(1).max(20000) });

export const importProjectCsvSchema = z.object({ csv: z.string().trim().min(1).max(256_000) });

export const createReferenceSchema = z.object({ collection: referenceCollection, fields: referenceFields.extend({ name: z.string().trim().min(1).max(200) }) });
export const updateReferenceSchema = z.object({ collection: referenceCollection, id: z.guid(), syncVersion: z.number().int().positive(), fields: referenceFields });

export const reorderReferenceSchema = z.object({
  collection: referenceCollection,
  rows: z.array(z.object({ id: z.guid(), syncVersion: z.number().int().positive(), sortOrder: z.number().int().nonnegative() })).min(1).max(100),
});

export const updatePresalesTemplateSchema = z.object({ code: z.enum(['basic','normal','advanced']), title: z.string().trim().min(1).max(120),
  markdown: z.string().max(50000), version: z.number().int().positive() });

export const updatePresalesOriginSchema = z.object({ code:z.enum(['email','phone','whatsapp','in_person','other']),
  label:z.string().trim().min(1).max(80),active:z.boolean() });
