import { describe, it, expect } from 'bun:test';
import { GET as getTickets, POST as createTicket } from '../app/api/v1/tickets/route';
import { GET as getTicket, PATCH as updateTicket, DELETE as deleteTicket } from '../app/api/v1/tickets/[id]/route';
import { NextRequest } from 'next/server';

describe('FASE 26 — Robustez e Auditoria do Módulo de Tickets', () => {
  describe('A — CREATE (POST /api/v1/tickets)', () => {
    it('1. Rejeita criação sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Sem Autenticação' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(401);
    });

    it('2. Rejeita criação com token/credenciais sem permissão (401/403)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer invalid-token-xyz',
        },
        body: JSON.stringify({ title: 'Ticket Sem Permissão' }),
      });
      const res = await createTicket(req);
      expect([401, 403]).toContain(res.status);
    });

    it('3. Rejeita título vazio ou inválido quando não autenticado (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: '   ' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(401);
    });

    it('4. Rejeita associação a cliente inexistente/eliminado sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Ticket Cliente Inválido',
          clientId: 'client-inexistente-9999',
        }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(401);
    });

    it('6. Rejeita associação a utilizador responsável inexistente/eliminado sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Ticket Responsável Inválido',
          assignedToId: 'user-inexistente-9999',
        }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(401);
    });

    it('8. Rejeita associação a projeto convertido inexistente/eliminado sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Ticket Projeto Convertido Inválido',
          convertedProjectId: 'project-inexistente-9999',
        }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(401);
    });
  });

  describe('B — UPDATE (PATCH/PUT /api/v1/tickets/[id])', () => {
    it('10. Rejeita atualização sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-1234', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Novo Título' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-1234' }));
      expect(res.status).toBe(401);
    });

    it('12. Rejeita atualização de ticket inexistente/eliminado sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/non-existent-tck-id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Atualização Inválida' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'non-existent-tck-id' }));
      expect(res.status).toBe(401);
    });
  });

  describe('C — DELETE (DELETE /api/v1/tickets/[id])', () => {
    it('17. Rejeita eliminação sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-1234', {
        method: 'DELETE',
      });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-1234' }));
      expect(res.status).toBe(401);
    });

    it('20. Rejeita eliminação de ticket inexistente/já eliminado sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/non-existent-tck-id', {
        method: 'DELETE',
      });
      const res = await deleteTicket(req, Promise.resolve({ id: 'non-existent-tck-id' }));
      expect(res.status).toBe(401);
    });
  });

  describe('D — GET & Segurança', () => {
    it('22. Rejeita listagem sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'GET',
      });
      const res = await getTickets(req);
      expect(res.status).toBe(401);
    });

    it('23. Rejeita consulta individual sem autenticação (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-1234', {
        method: 'GET',
      });
      const res = await getTicket(req, Promise.resolve({ id: 'tck-1234' }));
      expect(res.status).toBe(401);
    });
  });
});
