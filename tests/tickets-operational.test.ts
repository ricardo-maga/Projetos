import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { GET as getTickets, POST as createTicket } from '../app/api/v1/tickets/route';
import { GET as getTicket, PATCH as updateTicket, DELETE as deleteTicket } from '../app/api/v1/tickets/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as syncModule from '../lib/supabaseSync';
import { NextRequest, NextResponse } from 'next/server';
import { Ticket } from '../lib/types';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: 'user-op-100',
  email: 'operador@empresa.com',
  name: 'Operador Sistema',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

const mockInitialState = {
  tickets: [
    {
      id: 'tck-val-1',
      ticketNumber: 'TCK-2026-001',
      title: 'Avaria em Bomba Circuladora',
      description: 'Cliente reporta ruído anormal na bomba de circulação.',
      source: 'email',
      sourceDetails: 'Email Inbound (suporte@cliente.pt)',
      status: 'validacao',
      priority: 'alta',
      category: 'Manutenção',
      clientId: 'client-1',
      requesterName: 'Manuel Silva',
      requesterEmail: 'msilva@cliente.pt',
      assignedToId: 'user-tech-1',
      createdById: 'user-op-100',
      createdDate: '2026-02-01T08:00:00.000Z',
      updatedDate: '2026-02-01T08:00:00.000Z',
      deleted: false,
    },
    {
      id: 'tck-aberto-1',
      ticketNumber: 'TCK-2026-002',
      title: 'Ajuste de Setpoint HVAC',
      description: 'Solicitada reprogramação de setpoint da central de frio.',
      source: 'teams',
      sourceDetails: 'MS Teams (#obras)',
      status: 'aberto',
      priority: 'media',
      category: 'Programação',
      clientId: 'client-2',
      requesterName: 'Ana Martins',
      assignedToId: 'user-tech-2',
      createdById: 'user-op-100',
      createdDate: '2026-02-02T09:00:00.000Z',
      updatedDate: '2026-02-02T09:00:00.000Z',
      deleted: false,
    },
    {
      id: 'tck-analise-1',
      ticketNumber: 'TCK-2026-003',
      title: 'Falta de Isolamento no Tubo 4',
      description: 'Verificada perda térmica na tubagem do chiller.',
      source: 'manual',
      sourceDetails: 'Inserido manualmente',
      status: 'em_analise',
      priority: 'urgente',
      category: 'Isolamentos',
      clientId: 'client-1',
      convertedProjectId: 'proj-1',
      assignedToId: 'user-tech-1',
      createdById: 'user-op-100',
      createdDate: '2026-02-03T10:00:00.000Z',
      updatedDate: '2026-02-03T10:00:00.000Z',
      deleted: false,
    },
    {
      id: 'tck-del-1',
      ticketNumber: 'TCK-2026-099',
      title: 'Ticket Antigo Eliminado',
      description: 'Este ticket foi marcado como eliminado.',
      source: 'manual',
      status: 'cancelado',
      priority: 'baixa',
      deleted: true,
    },
  ],
  clients: [
    { id: 'client-1', clientName: 'Empresa Industrial Alfa', shortName: 'Alfa', deleted: false },
    { id: 'client-2', clientName: 'Hospital Central Beta', shortName: 'Beta', deleted: false },
  ],
  users: [
    { id: 'user-tech-1', name: 'Eng. João Pedro', deleted: false, approved: true },
    { id: 'user-tech-2', name: 'Téc. Carlos Lima', deleted: false, approved: true },
  ],
  projects: [
    { id: 'proj-1', title: 'Remodelação Chiller Bloco A', clientId: 'client-1', deleted: false },
  ],
};

describe('Fase 27 — Modelo Operacional de Tickets / Pendências / Problemas', () => {
  let authSpy: any;
  let getSyncSpy: any;
  let saveSyncSpy: any;
  let dbState: any;

  beforeEach(() => {
    dbState = JSON.parse(JSON.stringify(mockInitialState));

    getSyncSpy = spyOn(syncModule, 'getActiveStateFromSupabase').mockImplementation(async () => {
      return { success: true, data: dbState };
    });

    saveSyncSpy = spyOn(syncModule, 'saveActiveStateToSupabase').mockImplementation(async (newState: any) => {
      dbState = JSON.parse(JSON.stringify(newState));
      return { success: true, data: dbState };
    });

    authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async (req: any) => {
      return { success: true, user: mockAuthenticatedUser, requestId: 'req-op-test' };
    });
  });

  afterEach(() => {
    getSyncSpy?.mockRestore();
    saveSyncSpy?.mockRestore();
    authSpy?.mockRestore();
  });

  describe('1. Consulta & Lista de Tickets (Filtros & Pesquisa Operacional)', () => {
    it('Lista tickets ativos e omite tickets eliminados', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', { method: 'GET' });
      const res = await getTickets(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const activeList: Ticket[] = json.data;
      expect(activeList.length).toBe(3);
      expect(activeList.some(t => t.id === 'tck-del-1')).toBe(false);
    });

    it('Permite consultar um ticket específico por ID no endpoint individual', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-aberto-1', { method: 'GET' });
      const res = await getTicket(req, Promise.resolve({ id: 'tck-aberto-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ticketNumber).toBe('TCK-2026-002');
      expect(json.data.title).toBe('Ajuste de Setpoint HVAC');
    });

    it('Retorna 404 para consulta de ticket eliminado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-del-1', { method: 'GET' });
      const res = await getTicket(req, Promise.resolve({ id: 'tck-del-1' }));
      expect(res.status).toBe(404);
    });
  });

  describe('2. Criar Ticket Operacional (CREATE)', () => {
    it('Cria ticket operacional completo com servidor como fonte de verdade', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Manutenção de Emergência Gerador',
          description: 'Gerador nº 2 falhou arranque automático durante o teste.',
          source: 'manual',
          priority: 'urgente',
          category: 'Eletrotecnia',
          clientId: 'client-2',
          assignedToId: 'user-tech-1',
          requesterName: 'Mário Rocha',
          requesterEmail: 'mrocha@hospitalbeta.pt',
          status: 'aberto',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Manutenção de Emergência Gerador');
      expect(json.data.createdById).toBe(mockAuthenticatedUser.id);
      expect(json.data.ticketNumber).toMatch(/^TCK-\d{4}-\d{3}$/);
    });

    it('Rejeita criação de ticket com título composto por apenas espaços (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '      ' }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(400);
    });

    it('Rejeita criação de ticket associado a cliente inválido ou inexistente (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Ticket Teste Cliente Inexistente',
          clientId: 'client-inexistente-999',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });
  });

  describe('3. Edição Operacional & Preservação de Imutáveis (UPDATE)', () => {
    it('Atualiza estado, responsável, prioridade e descrição de ticket existente (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'aberto',
          assignedToId: 'user-tech-2',
          priority: 'urgente',
          description: 'Descrição atualizada após triagem inicial.',
        }),
      });

      const res = await updateTicket(req, Promise.resolve({ id: 'tck-val-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('aberto');
      expect(json.data.assignedToId).toBe('user-tech-2');
      expect(json.data.priority).toBe('urgente');
      expect(json.data.description).toBe('Descrição atualizada após triagem inicial.');
    });

    it('Preserva estritamente campos imutáveis (id, ticketNumber, createdById, createdDate) em atualizações', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'tentativa-injecao-id',
          ticketNumber: 'TCK-2099-999',
          createdById: 'utilizador-malicioso',
          createdDate: '1980-01-01T00:00:00.000Z',
          title: 'Título Corretamente Modificado',
        }),
      });

      const res = await updateTicket(req, Promise.resolve({ id: 'tck-val-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe('tck-val-1');
      expect(json.data.ticketNumber).toBe('TCK-2026-001');
      expect(json.data.createdById).toBe('user-op-100');
      expect(json.data.createdDate).toBe('2026-02-01T08:00:00.000Z');
      expect(json.data.title).toBe('Título Corretamente Modificado');
    });
  });

  describe('4. Transições Operacionais de Estado', () => {
    it('Permite transição de validação -> aberto', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'aberto' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-val-1' }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.status).toBe('aberto');
    });

    it('Permite transição de aberto -> em_analise', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-aberto-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'em_analise' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-aberto-1' }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.status).toBe('em_analise');
    });

    it('Permite transição de em_analise -> resolvido', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-analise-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'resolvido', resolutionNotes: 'Problema resolvido com substituição de junta.' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-analise-1' }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.status).toBe('resolvido');
    });

    it('Permite transição para cancelado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-aberto-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-aberto-1' }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.status).toBe('cancelado');
    });

    it('Permite transição para convertido e associação a projeto', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-analise-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'convertido', convertedProjectId: 'proj-1' }),
      });
      const res = await updateTicket(req, Promise.resolve({ id: 'tck-analise-1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('convertido');
      expect(json.data.convertedProjectId).toBe('proj-1');
    });
  });

  describe('5. Soft Delete & Permissões', () => {
    it('Executa soft delete ao eliminar ticket (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', { method: 'DELETE' });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-val-1' }));
      expect(res.status).toBe(200);

      // Confirm soft delete flag
      const checkReq = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', { method: 'GET' });
      const checkRes = await getTicket(checkReq, Promise.resolve({ id: 'tck-val-1' }));
      expect(checkRes.status).toBe(404);
    });

    it('Retorna 401 para requisições não autenticadas', async () => {
      authSpy.mockImplementation(async () => ({
        success: false,
        response: NextResponse.json({ success: false, message: 'Sessão inválida' }, { status: 401 }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/tickets', { method: 'GET' });
      const res = await getTickets(req);
      expect(res.status).toBe(401);
    });

    it('Retorna 403 quando utilizador não possui permissão exigida', async () => {
      authSpy.mockImplementation(async () => ({
        success: false,
        response: NextResponse.json({ success: false, message: 'Sem permissão' }, { status: 403 }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/tickets/tck-val-1', { method: 'DELETE' });
      const res = await deleteTicket(req, Promise.resolve({ id: 'tck-val-1' }));
      expect(res.status).toBe(403);
    });
  });
});
