import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FASE 33 — Migração de Clients para a API Dedicada', () => {

  describe('1. CREATE — addClient utiliza POST /api/v1/clients e é server-authoritative', () => {
    it('Análise Estática: addClient utiliza POST /api/v1/clients e é server-authoritative', () => {
      const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');
      const addClientStart = useERPContent.indexOf('const addClient =');
      const addClientEnd = useERPContent.indexOf('const updateClient =');
      const addBlock = useERPContent.substring(addClientStart, addClientEnd);

      expect(addBlock.includes('/api/v1/clients')).toBe(true);
      expect(addBlock.includes("method: 'POST'")).toBe(true);
      expect(addBlock.includes('saveState(')).toBe(false);
      expect(addBlock.includes('s.id')).toBe(true);
    });
  });

  describe('2. UPDATE — updateClient utiliza PATCH /api/v1/clients/:id e result.data', () => {
    it('Análise Estática: updateClient não utiliza updates nem existingClient como fallback ao construir updatedClient', () => {
      const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');
      const updateClientStart = useERPContent.indexOf('const updateClient =');
      const updateClientEnd = useERPContent.indexOf('const deleteClient =');
      const updateBlock = useERPContent.substring(updateClientStart, updateClientEnd);

      const updatedClientConstStart = updateBlock.indexOf('const updatedClient: Client = {');
      const updatedClientConstEnd = updateBlock.indexOf('};', updatedClientConstStart);
      const updatedClientBlock = updateBlock.substring(updatedClientConstStart, updatedClientConstEnd);

      // Confirma que a atribuição de updatedClient não utiliza updates.* nem existingClient.*
      expect(updatedClientBlock.includes('updates.')).toBe(false);
      expect(updatedClientBlock.includes('existingClient?.')).toBe(false);
      expect(updatedClientBlock.includes('s.id')).toBe(true);
      expect(updatedClientBlock.includes('s.clientName')).toBe(true);
      expect(updatedClientBlock.includes('s.version')).toBe(true);
    });

    it('Análise Estática da Rota PATCH: Rota re-lê o registo da BD e devolve em result.data', () => {
      const routeContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', '[id]', 'route.ts'), 'utf-8');
      const patchHandlerStart = routeContent.indexOf('async function handleUpdate');
      const patchHandlerEnd = routeContent.indexOf('export async function DELETE');
      const patchBlock = routeContent.substring(patchHandlerStart, patchHandlerEnd);

      expect(patchBlock.includes('Re-leitura autoritativa')).toBe(true);
      expect(patchBlock.includes("from('clients')")).toBe(true);
      expect(patchBlock.includes('updatedClientData')).toBe(true);
    });
  });

  describe('3. DELETE — deleteClient utiliza DELETE /api/v1/clients/:id', () => {
    it('Análise Estática: deleteClient utiliza DELETE /api/v1/clients/:id', () => {
      const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');
      const deleteClientStart = useERPContent.indexOf('const deleteClient =');
      const deleteClientEnd = useERPContent.indexOf('// ==================== MATERIALS CRUD');
      const deleteBlock = useERPContent.substring(deleteClientStart, deleteClientEnd);

      expect(deleteBlock.includes('/api/v1/clients/')).toBe(true);
      expect(deleteBlock.includes("method: 'DELETE'")).toBe(true);
      expect(deleteBlock.includes('saveState(')).toBe(false);
    });
  });

  describe('4. Verificação de Código Estático — Nenhuma mutação de Client utiliza saveState', () => {
    it('hooks/useERP.ts não utiliza saveState em addClient, updateClient ou deleteClient', () => {
      const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');
      
      const clientSectionStart = useERPContent.indexOf('// ==================== CLIENTS CRUD');
      const nextSectionStart = useERPContent.indexOf('// ==================== MATERIALS CRUD', clientSectionStart);
      
      expect(clientSectionStart).toBeGreaterThan(0);
      expect(nextSectionStart).toBeGreaterThan(clientSectionStart);

      const clientSectionBlock = useERPContent.substring(clientSectionStart, nextSectionStart);

      expect(clientSectionBlock.includes('saveState(')).toBe(false);
    });
  });

});
