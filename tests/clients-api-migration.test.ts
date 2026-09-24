import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClientSchema, updateClientSchema } from '../lib/validations/client';

describe('FASE 33-C1 — Verificação Estática de Contrato da API de Clients com o Schema Real da BD', () => {

  describe('1. Validações — lib/validations/client.ts', () => {
    it('Schema de CREATE aceita clientName, shortName, location, taxId e rejeita name/code/address como substitutos', () => {
      const valid = createClientSchema.safeParse({
        clientName: 'Cliente Teste Real',
        shortName: 'CLI-REAL',
        location: 'Lisboa, Portugal',
        taxId: '123456789',
        contactPerson: 'Manuel Silva',
        contactEmail: 'manuel@teste.pt',
        contactPhone: '+351910000000',
        notes: 'Notas de teste',
      });
      expect(valid.success).toBe(true);

      // Rejeita criação se clientName estiver ausente
      const invalidNoClientName = createClientSchema.safeParse({
        name: 'Nome Antigo',
        code: 'COD123',
      });
      expect(invalidNoClientName.success).toBe(false);
    });

    it('Schema de UPDATE exige version e aceita campos canónicos', () => {
      const validUpdate = updateClientSchema.safeParse({
        clientName: 'Cliente Atualizado',
        taxId: '987654321',
        version: 2,
      });
      expect(validUpdate.success).toBe(true);

      const invalidNoVersion = updateClientSchema.safeParse({
        clientName: 'Cliente Sem Versão',
      });
      expect(invalidNoVersion.success).toBe(false);
    });
  });

  describe('2. Rota GET /api/v1/clients (Collection) — app/api/v1/clients/route.ts', () => {
    const routeContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', 'route.ts'), 'utf-8');

    it('1. GET usa client_name e 2. GET devolve clientName', () => {
      expect(routeContent.includes("order('client_name'")).toBe(true);
      expect(routeContent.includes('clientName: row.client_name')).toBe(true);
    });

    it('3. GET usa short_name e 4. GET devolve shortName', () => {
      expect(routeContent.includes('shortName: row.short_name')).toBe(true);
    });

    it('5. GET usa location e 6. GET devolve location', () => {
      expect(routeContent.includes('location: row.location')).toBe(true);
    });

    it('7. GET devolve taxId mapeado de tax_id', () => {
      expect(routeContent.includes('taxId: row.tax_id')).toBe(true);
    });

    it('Pesquisa textual utiliza colunas reais client_name, short_name, location, tax_id', () => {
      expect(routeContent.includes('client_name.ilike')).toBe(true);
      expect(routeContent.includes('short_name.ilike')).toBe(true);
      expect(routeContent.includes('tax_id.ilike')).toBe(true);
      expect(routeContent.includes('location.ilike')).toBe(true);
    });
  });

  describe('3. Rota POST /api/v1/clients — app/api/v1/clients/route.ts', () => {
    const routeContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', 'route.ts'), 'utf-8');
    const postStart = routeContent.indexOf('export async function POST');
    const postBlock = routeContent.substring(postStart);

    it('8. POST escreve client_name, 9. short_name, 10. location, 11. tax_id', () => {
      expect(postBlock.includes('client_name: c.clientName')).toBe(true);
      expect(postBlock.includes('short_name: c.shortName')).toBe(true);
      expect(postBlock.includes('location: c.location')).toBe(true);
      expect(postBlock.includes('tax_id: c.taxId')).toBe(true);
      expect(postBlock.includes('contact_email: c.contactEmail')).toBe(true);
      expect(postBlock.includes('contact_phone: c.contactPhone')).toBe(true);
    });

    it('POST efetua re-leitura autoritativa da BD após inserção', () => {
      expect(postBlock.includes('Re-leitura autoritativa')).toBe(true);
      expect(postBlock.includes('.from(\'clients\')')).toBe(true);
      expect(postBlock.includes('createdRow.client_name')).toBe(true);
    });
  });

  describe('4. Rota GET & PATCH /api/v1/clients/[id] — app/api/v1/clients/[id]/route.ts', () => {
    const idRouteContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', '[id]', 'route.ts'), 'utf-8');

    it('GET individual devolve clientName, shortName, location, taxId a partir de client_name, short_name, location, tax_id', () => {
      const getStart = idRouteContent.indexOf('export async function GET');
      const getEnd = idRouteContent.indexOf('export async function PATCH');
      const getBlock = idRouteContent.substring(getStart, getEnd);

      expect(getBlock.includes('clientName: client.client_name')).toBe(true);
      expect(getBlock.includes('shortName: client.short_name')).toBe(true);
      expect(getBlock.includes('location: client.location')).toBe(true);
      expect(getBlock.includes('taxId: client.tax_id')).toBe(true);
    });

    it('12. PATCH atualiza client_name, 13. short_name, 14. location, 15. tax_id', () => {
      const patchStart = idRouteContent.indexOf('async function handleUpdate');
      const patchBlock = idRouteContent.substring(patchStart);

      expect(patchBlock.includes('updatePayload.client_name = updates.clientName')).toBe(true);
      expect(patchBlock.includes('updatePayload.short_name = updates.shortName')).toBe(true);
      expect(patchBlock.includes('updatePayload.location = updates.location')).toBe(true);
      expect(patchBlock.includes('updatePayload.tax_id = updates.taxId')).toBe(true);
      expect(patchBlock.includes('updatePayload.contact_email = updates.contactEmail')).toBe(true);
      expect(patchBlock.includes('updatePayload.contact_phone = updates.contactPhone')).toBe(true);
    });

    it('16. PATCH devolve dados do read-back da BD', () => {
      const patchStart = idRouteContent.indexOf('async function handleUpdate');
      const patchBlock = idRouteContent.substring(patchStart);

      expect(patchBlock.includes('Re-leitura autoritativa')).toBe(true);
      expect(patchBlock.includes('reRead.client_name')).toBe(true);
      expect(patchBlock.includes('reRead.short_name')).toBe(true);
      expect(patchBlock.includes('reRead.location')).toBe(true);
      expect(patchBlock.includes('reRead.tax_id')).toBe(true);
    });
  });

  describe('6. Static Code Analysis / Contract Checks — hooks/useERP.ts', () => {
    const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');

    it('1-6. addClient envia apenas campos canónicos (clientName, shortName, location, taxId, contactEmail) e não envia name/code/email/phone/address', () => {
      const addStart = useERPContent.indexOf('const addClient =');
      const addEnd = useERPContent.indexOf('const updateClient =');
      const addBlock = useERPContent.substring(addStart, addEnd);

      expect(addBlock.includes('clientName,')).toBe(true);
      expect(addBlock.includes('shortName,')).toBe(true);
      expect(addBlock.includes('location,')).toBe(true);
      expect(addBlock.includes('taxId,')).toBe(true);
      expect(addBlock.includes('contactEmail,')).toBe(true);

      // Payload enviado não contém as chaves legadas
      const payloadStart = addBlock.indexOf('const payload: Record<string, any> = {');
      const payloadEnd = addBlock.indexOf('};', payloadStart);
      const payloadBlock = addBlock.substring(payloadStart, payloadEnd);

      expect(payloadBlock.includes('name:')).toBe(false);
      expect(payloadBlock.includes('code:')).toBe(false);
      expect(payloadBlock.includes('email:')).toBe(false);
      expect(payloadBlock.includes('phone:')).toBe(false);
      expect(payloadBlock.includes('address:')).toBe(false);
    });

    it('7-8. addClient constrói newClient exclusivamente com result.data (s.*) sem usar input como fallback', () => {
      const addStart = useERPContent.indexOf('const addClient =');
      const addEnd = useERPContent.indexOf('const updateClient =');
      const addBlock = useERPContent.substring(addStart, addEnd);

      const newClientStart = addBlock.indexOf('const newClient: Client = {');
      const newClientEnd = addBlock.indexOf('};', newClientStart);
      const newClientBlock = addBlock.substring(newClientStart, newClientEnd);

      expect(newClientBlock.includes('clientName: s.clientName')).toBe(true);
      expect(newClientBlock.includes('shortName: s.shortName')).toBe(true);
      expect(newClientBlock.includes('location: s.location')).toBe(true);
      expect(newClientBlock.includes('taxId: s.taxId')).toBe(true);

      // Não usa variáveis locais de input como fallback
      expect(newClientBlock.includes('|| clientName')).toBe(false);
      expect(newClientBlock.includes('|| code')).toBe(false);
      expect(newClientBlock.includes('|| address')).toBe(false);
      expect(newClientBlock.includes('|| clientData.taxId')).toBe(false);
    });

    it('9-11. updateClient envia campos canónicos (incluindo version) e não envia campos antigos', () => {
      const updateStart = useERPContent.indexOf('const updateClient =');
      const updateEnd = useERPContent.indexOf('const deleteClient =');
      const updateBlock = useERPContent.substring(updateStart, updateEnd);

      const payloadStart = updateBlock.indexOf('const payload: Record<string, any> = {');
      const payloadEnd = updateBlock.indexOf('};', payloadStart);
      const payloadBlock = updateBlock.substring(payloadStart, payloadEnd);

      expect(payloadBlock.includes('version: currentVersion')).toBe(true);
      expect(updateBlock.includes('payload.clientName =')).toBe(true);
      expect(updateBlock.includes('payload.shortName =')).toBe(true);
      expect(updateBlock.includes('payload.location =')).toBe(true);
      expect(updateBlock.includes('payload.taxId =')).toBe(true);

      expect(updateBlock.includes('payload.name =')).toBe(false);
      expect(updateBlock.includes('payload.code =')).toBe(false);
      expect(updateBlock.includes('payload.address =')).toBe(false);
    });

    it('12-14. updateClient usa exclusivamente result.data (s.*) sem usar updates ou existingClient como fallback', () => {
      const updateStart = useERPContent.indexOf('const updateClient =');
      const updateEnd = useERPContent.indexOf('const deleteClient =');
      const updateBlock = useERPContent.substring(updateStart, updateEnd);

      const updatedClientStart = updateBlock.indexOf('const updatedClient: Client = {');
      const updatedClientEnd = updateBlock.indexOf('};', updatedClientStart);
      const updatedClientBlock = updateBlock.substring(updatedClientStart, updatedClientEnd);

      expect(updatedClientBlock.includes('updates.')).toBe(false);
      expect(updatedClientBlock.includes('existingClient?.')).toBe(false);
      expect(updatedClientBlock.includes('clientName: s.clientName')).toBe(true);
      expect(updatedClientBlock.includes('shortName: s.shortName')).toBe(true);
    });

    it('15. addClient, updateClient e deleteClient não usam saveState', () => {
      const clientSectionStart = useERPContent.indexOf('// ==================== CLIENTS CRUD');
      const nextSectionStart = useERPContent.indexOf('// ==================== MATERIALS CRUD', clientSectionStart);
      const clientSectionBlock = useERPContent.substring(clientSectionStart, nextSectionStart);

      expect(clientSectionBlock.includes('saveState(')).toBe(false);
    });

    it('16. deleteClient só altera o estado após sucesso da API', () => {
      const deleteStart = useERPContent.indexOf('const deleteClient =');
      const deleteEnd = useERPContent.indexOf('// ==================== MATERIALS CRUD');
      const deleteBlock = useERPContent.substring(deleteStart, deleteEnd);

      expect(deleteBlock.includes('if (res.ok && result.success)')).toBe(true);
      expect(deleteBlock.includes("method: 'DELETE'")).toBe(true);
    });
  });

});


