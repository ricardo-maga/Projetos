import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { GET as getTickets, POST as createTicket } from '../app/api/v1/tickets/route';
import { GET as getTicket, PATCH as updateTicket, DELETE as deleteTicket } from '../app/api/v1/tickets/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as syncModule from '../lib/supabaseSync';
import { NextRequest, NextResponse } from 'next/server';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: 'user-auth-100',
  email: 'tecnico@empresa.com',
  name: 'Técnico Teste',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

const mockState = {
  tickets: [
    {
      id: 'tck-ativo-1',
      ticketNumber: 'TCK-2026-001',
      title: 'Ticket Ativo Existente',
      description: 'Descrição do ticket ativo',
      source: 'manual',
      status: 'aberto',
      priority: 'media',
      createdById: 'user-auth-100',
      createdDate: '2026-01-01T10:00:00.000Z',
      updatedDate: '2026-01-01T10:00:00.000Z',
      deleted: false,
    },
    {
      id: 'tck-eliminado-1',
      ticketNumber: 'TCK-2026-002',
      title: 'Ticket Eliminado',
      description: 'Descrição do ticket eliminado',
      source: 'manual',
      status: 'cancelado',
      priority: 'baixa',
      createdById: 'user-auth-100',
      createdDate: '2026-01-01T10:00:00.000Z',
      updatedDate: '2026-01-01T10:00:00.000Z',
      deleted: true,
    },
  ],
  clients: [
    { id: 'client-ativo-1', name: 'Cliente Ativo', deleted: false },
    { id: 'client-eliminado-1', name: 'Cliente Eliminado', deleted: true },
  ],
  users: [
    { id: 'user-ativo-1', name: 'Utilizador Ativo', deleted: false },
    { id: 'user-eliminado-1', name: 'Utilizador Eliminado', deleted: true },
  ],
  projects: [
    { id: 'proj-ativo-1', title: 'Projeto Ativo', deleted: false },
    { id: 'proj-eliminado-1', title: 'Projeto Eliminado', deleted: true },
  ],
};

describe('Fase 26-A — Validação do Módulo de Tickets (Comportamento Autenticado & Integridade)', () => {
  let authSpy: any;
  let getSyncSpy: any;
  let saveSyncSpy: any;

  beforeEach(() => {
    getSyncSpy = spyOn(syncModule, 'getActiveStateFromSupabase').mockImplementation(async () => {
      return { success: true, data: JSON.parse(JSON.stringify(mockState)) };
    });

    saveSyncSpy = spyOn(syncModule, 'saveActiveStateToSupabase').mockImplementation(async (newState: any) => {
      return { success: true, data: newState };
    });
  });

  afterEach(() => {
    getSyncSpy?.mockRestore();
    saveSyncSpy?.mockRestore();
    authSpy?.mockRestore();
  });

  describe('1. Testes de Permissões (401 vs 403)', () => {
    it('Retorna 401 para pedido sem sessão/autenticação', async () => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return {
          success: false,
          response: NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 }),
        };
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tickets', { method: 'GET' });
      const res = await getTickets(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('Retorna 403 para utilizador autenticado sem a permissão exigida (tickets_read / tickets_write / tickets_delete)', async () => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return {
          success: false,
          response: NextResponse.json({ success: false, message: 'Sem permissão para realizar esta operação.' }, { status: 403 }),
        };
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste Permissão' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('2. CREATE (POST /api/v1/tickets)', () => {
    beforeEach(() => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return { success: true, user: mockAuthenticatedUser, requestId: 'req-test' };
      });
    });

    it('Cria ticket com sucesso quando os dados e permissões são válidos (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Novo Ticket Válido',
          description: 'Descrição do novo ticket',
          clientId: 'client-ativo-1',
          assignedToId: 'user-ativo-1',
          convertedProjectId: 'proj-ativo-1',
          status: 'aberto',
        }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Novo Ticket Válido');
      expect(json.data.createdById).toBe(mockAuthenticatedUser.id);
    });

    it('Rejeita título vazio ou constituído apenas por espaços em branco (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('Título do ticket é obrigatório');
    });

    it('Rejeita associação a cliente inexistente (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', clientId: 'client-inexistente-999' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });

    it('Rejeita associação a cliente eliminado (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', clientId: 'client-eliminado-1' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });

    it('Rejeita associação a utilizador responsável inexistente (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', assignedToId: 'user-inexistente-999' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('utilizador responsável');
    });

    it('Rejeita associação a utilizador responsável eliminado/inativo (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', assignedToId: 'user-eliminado-1' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('utilizador responsável');
    });

    it('Rejeita associação a projeto convertido inexistente (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', convertedProjectId: 'proj-inexistente-999' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('projeto');
    });

    it('Rejeita associação a projeto convertido eliminado (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', convertedProjectId: 'proj-eliminado-1' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('projeto');
    });

    it('Rejeita submissão de estado inválido (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ticket Teste', status: 'estado_inexistente_xyz' }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('Estado de ticket inválido');
    });

    it('Enforça createdById com a identidade do utilizador autenticado e ignora body.createdById (Segurança)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Ticket Teste Identidade',
          createdById: 'user-vitima-999', // Tentativa de personificação
        }),
      });
      const res = await createTicket(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.createdById).toBe(mockAuthenticatedUser.id);
      expect(json.data.createdById).not.toBe('user-vitima-999');
    });
  });

  describe('3. UPDATE (PATCH/PUT /api/v1/tickets/[id])', () => {
    beforeEach(() => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return { success: true, user: mockAuthenticatedUser, requestId: 'req-test' };
      });
    });

    it('Atualiza ticket existente com sucesso (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Título Atualizado', status: 'em_analise' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Título Atualizado');
      expect(json.data.status).toBe('em_analise');
    });

    it('Retorna 404 para Ticket inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-inexistente', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Atualização' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-inexistente' }));
      expect(res.status).toBe(404);
    });

    it('Retorna 404 para Ticket eliminado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-eliminado-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Atualização' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-eliminado-1' }));
      expect(res.status).toBe(404);
    });

    it('Protege campos imutáveis/controlados pelo servidor (id, ticketNumber, createdDate, createdById) no PATCH (400 / preservação)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'hacked-id',
          ticketNumber: 'TCK-2099-999',
          createdById: 'hacked-user-id',
          createdDate: '1990-01-01T00:00:00.000Z',
          title: 'Título Válido Modificado',
        }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe('tck-ativo-1');
      expect(json.data.ticketNumber).toBe('TCK-2026-001');
      expect(json.data.createdById).toBe('user-auth-100');
      expect(json.data.createdDate).toBe('2026-01-01T10:00:00.000Z');
      expect(json.data.title).toBe('Título Válido Modificado');
    });

    it('Rejeita título inválido/vazio no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
    });

    it('Rejeita cliente inválido/inexistente no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-inexistente-999' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });

    it('Rejeita cliente eliminado no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-eliminado-1' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });

    it('Rejeita responsável inexistente no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToId: 'user-inexistente-999' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('utilizador responsável');
    });

    it('Rejeita responsável eliminado/inativo no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToId: 'user-eliminado-1' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('utilizador responsável');
    });

    it('Rejeita projeto associado inexistente no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ convertedProjectId: 'proj-inexistente-999' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('projeto');
    });

    it('Rejeita projeto associado eliminado no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ convertedProjectId: 'proj-eliminado-1' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('projeto');
    });

    it('Rejeita estado inválido no PATCH (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'estado_invalido_123' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('Estado de ticket inválido');
    });

    it('Atualiza ticket com relações válidas (cliente, responsável e projeto ativos) com sucesso (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Ticket com Relações Válidas',
          clientId: 'client-ativo-1',
          assignedToId: 'user-ativo-1',
          convertedProjectId: 'proj-ativo-1',
          status: 'em_analise',
        }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.clientId).toBe('client-ativo-1');
      expect(json.data.assignedToId).toBe('user-ativo-1');
      expect(json.data.convertedProjectId).toBe('proj-ativo-1');
      expect(json.data.status).toBe('em_analise');
    });

    it('Devolve estado persistido pelo servidor após UPDATE (server-authoritative)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Título Server Authoritative',
          description: 'Nova descrição autoritativa',
          unwantedField: 'malicious-data',
        }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe('Título Server Authoritative');
      expect(json.data.description).toBe('Nova descrição autoritativa');
      expect((json.data as any).unwantedField).toBeUndefined();
      expect(json.data.updatedDate).toBeDefined();
    });
  });

  describe('4. DELETE (DELETE /api/v1/tickets/[id])', () => {
    beforeEach(() => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return { success: true, user: mockAuthenticatedUser, requestId: 'req-test' };
      });
    });

    it('Elimina ticket existente com soft-delete (200) e mantém o registo com deleted: true', async () => {
      let savedState: any = null;
      saveSyncSpy.mockImplementation(async (newState: any) => {
        savedState = newState;
        return { success: true, data: newState };
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'DELETE',
      });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Confirma que não foi removido fisicamente e ficou com deleted: true
      const deletedTicketInDb = savedState.tickets.find((t: any) => t.id === 'tck-ativo-1');
      expect(deletedTicketInDb).toBeDefined();
      expect(deletedTicketInDb.deleted).toBe(true);
    });

    it('Retorna 404 ao tentar eliminar ticket inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-inexistente', {
        method: 'DELETE',
      });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-inexistente' }));
      expect(res.status).toBe(404);
    });

    it('Retorna 404 ao tentar eliminar ticket já eliminado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-eliminado-1', {
        method: 'DELETE',
      });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-eliminado-1' }));
      expect(res.status).toBe(404);
    });
  });

  describe('5. GET e Listagem (Filtro de eliminados & Integridade)', () => {
    beforeEach(() => {
      authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
        return { success: true, user: mockAuthenticatedUser, requestId: 'req-test' };
      });
    });

    it('GET individual de ticket eliminado devolve 404', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-eliminado-1', {
        method: 'GET',
      });
      const res = await getTicket(req, Promise.resolve({ id: 'tck-eliminado-1' }));
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Ticket não encontrado ou eliminado');
    });

    it('GET individual de ticket ativo devolve 200 com os dados corretos', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-ativo-1', {
        method: 'GET',
      });
      const res = await getTicket(req, Promise.resolve({ id: 'tck-ativo-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('tck-ativo-1');
      expect(json.data.deleted).toBe(false);
    });

    it('Listagem (GET /api/v1/tickets) não apresenta tickets eliminados', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'GET',
      });
      const res = await getTickets(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe('tck-ativo-1');
      expect(json.data.some((t: any) => t.id === 'tck-eliminado-1')).toBe(false);
      expect(json.data.every((t: any) => !t.deleted)).toBe(true);
    });
  });
});
