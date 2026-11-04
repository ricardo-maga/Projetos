import {describe,expect,it} from 'bun:test';
import {presalesRegistrySchema} from '../lib/presalesRegistry';

const id='11111111-1111-4111-8111-111111111111';
describe('Registo Presales',()=>{
 it('aceita o processo básico sem tarefa ou dados de documento',()=>{
   const parsed=presalesRegistrySchema.safeParse({title:'Nova oportunidade',clientId:id,projectManagerId:id,
     description:'Pedido do cliente',status:'accepted',potentialValue:120.5});
   expect(parsed.success).toBe(true);
 });
 it('recusa conclusão anterior ao início e valores negativos',()=>{
   const base={title:'Nova oportunidade',clientId:id,startedOn:'2026-11-04',completedOn:'2026-11-03'};
   expect(presalesRegistrySchema.safeParse(base).success).toBe(false);
   expect(presalesRegistrySchema.safeParse({...base,completedOn:'2026-11-05',saleValue:-1}).success).toBe(false);
 });
});
