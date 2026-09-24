import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClientSchema, updateClientSchema } from '../lib/validations/client';

describe('FASE 33-C — Alinhar API de Clients com o Schema Real da BD', () => {

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

  describe('5. Conformidade Estrita — Campos antigos não são usados como fonte de verdade', () => {
    const routeContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', 'route.ts'), 'utf-8');
    const idRouteContent = readFileSync(join(process.cwd(), 'app', 'api', 'v1', 'clients', '[id]', 'route.ts'), 'utf-8');

    it('17. name não é usado pela API', () => {
      expect(routeContent.includes('row.name')).toBe(false);
      expect(idRouteContent.includes('client.name')).toBe(false);
      expect(idRouteContent.includes('reRead.name')).toBe(false);
    });

    it('18. code não é usado como fonte de shortName', () => {
      expect(routeContent.includes('row.code')).toBe(false);
      expect(idRouteContent.includes('client.code')).toBe(false);
      expect(idRouteContent.includes('reRead.code')).toBe(false);
    });

    it('19. address não é usado como fonte de location', () => {
      expect(routeContent.includes('row.address')).toBe(false);
      expect(idRouteContent.includes('client.address')).toBe(false);
      expect(idRouteContent.includes('reRead.address')).toBe(false);
    });

    it('20. email não é usado como fonte de contactEmail e 21. phone não é usado como fonte de contactPhone', () => {
      expect(routeContent.includes('contactEmail: row.email')).toBe(false);
      expect(routeContent.includes('contactPhone: row.phone')).toBe(false);
      expect(idRouteContent.includes('contactEmail: client.email')).toBe(false);
      expect(idRouteContent.includes('contactPhone: client.phone')).toBe(false);
    });
  });

});

