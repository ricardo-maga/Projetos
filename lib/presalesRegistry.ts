import { z } from 'zod';
const guid = z.guid();
const optionalDate = z.union([z.iso.date(),z.literal('')]).default('');
const optionalMoney = z.number().min(0).max(999999999999).nullable().default(null);
export const presalesRegistrySchema = z.object({
  title:z.string().trim().min(2).max(200),clientId:guid,
  description:z.string().max(10000).default(''),
  originCode:z.enum(['email','phone','whatsapp','in_person','other']).nullable().default(null),
  startedOn:optionalDate,completedOn:optionalDate,
  status:z.enum(['accepted','suspended','won','lost']).default('accepted'),
  priorityId:guid.nullable().default(null),commercialManagerId:guid.nullable().default(null),
  projectManagerId:guid.nullable().default(null),potentialValue:optionalMoney,
  saleDate:optionalDate,saleValue:optionalMoney,
}).refine(value => !value.completedOn || !value.startedOn || value.completedOn>=value.startedOn,
  {path:['completedOn'],message:'A conclusão não pode anteceder o início.'});
