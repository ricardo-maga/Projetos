import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClientSchema, updateClientSchema } from '../lib/validations/client';

describe('FASE 33-C1 — Verificação Estática de Contrato da API de Clients com o Schema Real da BD', () => {

  describe('1. Validações — domains/clients/contracts/client.ts', () => {
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

  describe('2–4. Fronteiras HTTP, serviço e persistência de Clientes', () => {
    const collection = readFileSync(join(process.cwd(), 'app/api/v1/clients/route.ts'), 'utf-8');
    const item = readFileSync(join(process.cwd(), 'app/api/v1/clients/[id]/route.ts'), 'utf-8');
    const repository = readFileSync(join(process.cwd(), 'domains/clients/data/clientRepository.ts'), 'utf-8');
    const mapper = readFileSync(join(process.cwd(), 'domains/clients/data/clientMapper.ts'), 'utf-8');
    const service = readFileSync(join(process.cwd(), 'domains/clients/modules/clientService.ts'), 'utf-8');

    it('mantém autorização e validação HTTP nas rotas, sem queries de Clientes', () => {
      expect(collection).toContain("requirePermission(req, 'clients_read')");
      expect(collection).toContain("requirePermission(req, 'clients_write')");
      expect(item).toContain("requirePermission(req, 'clients_delete')");
      expect(collection).toContain('queryClientSchema.safeParse');
      expect(item).toContain('updateClientSchema.safeParse');
      expect(collection + item).not.toContain(".from('clients')");
      expect(collection).toContain('listClients(db, parsed.data)');
      expect(item).toContain('editClient(db, id, parsed.data, user.id)');
    });

    it('concentra filtros, paginação e colunas SQL no repositório e mapeador', () => {
      expect(repository).toContain(".eq('deleted', false)");
      expect(repository).toContain(".order('client_name', { ascending: true }).range(from, to)");
      expect(repository).toContain('client_name.ilike');
      expect(mapper).toContain('clientName: row.client_name');
      expect(mapper).toContain('taxId: row.tax_id');
      expect(mapper).toContain('createdDate: row.created_at');
    });

    it('mantém releitura autoritativa, concorrência e auditoria no serviço', () => {
      expect(service).toContain('findClient(db, id)');
      expect(service).toContain('currentVersion + 1');
      expect(service).toContain('findActiveProjects(db, id)');
      expect(service).toContain("action: 'CLIENT_CREATED'");
      expect(service).toContain("action: 'CLIENT_UPDATED'");
      expect(service).toContain("action: 'CLIENT_DELETED'");
    });
  });

  describe('6. Static Code Analysis / Contract Checks — domains/clients/modules/clientActions.ts', () => {
    const useERPContent = readFileSync(join(process.cwd(), 'domains', 'clients', 'modules', 'clientActions.ts'), 'utf-8');

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
      const nextSectionStart = useERPContent.indexOf('// ==================== PROJECT MATERIALS CRUD', clientSectionStart);
      const clientSectionBlock = useERPContent.substring(clientSectionStart, nextSectionStart);

      expect(clientSectionBlock.includes('saveState(')).toBe(false);
    });

    it('16. deleteClient só altera o estado após sucesso da API', () => {
      const deleteStart = useERPContent.indexOf('const deleteClient =');
      const deleteEnd = useERPContent.indexOf('return { addClient, updateClient, deleteClient };');
      const deleteBlock = useERPContent.substring(deleteStart, deleteEnd);

      expect(deleteBlock.includes('if (res.ok && result.success)')).toBe(true);
      expect(deleteBlock.includes("method: 'DELETE'")).toBe(true);
    });
  });

});


