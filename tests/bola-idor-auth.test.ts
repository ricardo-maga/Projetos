import { describe, it, expect } from 'bun:test';
import { POST as createTask, PATCH as updateTask } from '../app/api/v1/tasks/route';
import { POST as createMaterial } from '../app/api/v1/project-materials/route';
import { PUT as updateMaterial } from '../app/api/v1/project-materials/[id]/route';
import { POST as createTicket } from '../app/api/v1/tickets/route';
import { GET as getProject } from '../app/api/v1/projects/[id]/route';
import { GET as getTask } from '../app/api/v1/tasks/[id]/route';
import { GET as getClient } from '../app/api/v1/clients/[id]/route';
import { NextRequest } from 'next/server';

describe('FASE 25-B — Auditoria e Correção BOLA/IDOR (Resource Authorization & Reference Validation)', () => {
  describe('Teste A: Rejeição de referências diretas a recursos inexistentes/eliminados em Tasks', () => {
    it('bloqueia criação de tarefas associadas a projectId inexistente/eliminado com HTTP 400', async () => {
      const nonExistentProjectId = '00000000-0000-4000-a000-000000000999';
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': 'u-test-user',
        },
        body: JSON.stringify({
          projectId: nonExistentProjectId,
          title: 'Nova Tarefa com Projeto Inválido',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('projeto');
    });
  });

  describe('Teste B: Rejeição de referências diretas em Project Materials', () => {
    it('devolve HTTP 404 ao tentar criar material para projeto inexistente', async () => {
      const nonExistentProjectId = '00000000-0000-4000-a000-000000000999';
      const req = new NextRequest('http://localhost:3000/api/v1/project-materials', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: nonExistentProjectId,
          description: 'Cabo Elétrico 3x2.5mm',
          supplier: 'Fornecedor Teste',
        }),
      });

      const res = await createMaterial(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('projeto');
    });
  });

  describe('Teste C: Rejeição de referências diretas em Tickets', () => {
    it('devolve HTTP 400 ao associar cliente ou responsável inexistente/eliminado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Ticket Teste BOLA/IDOR',
          clientId: 'client-invalido-999',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('cliente');
    });
  });

  describe('Teste D: Consulta por ID de recursos inexistentes', () => {
    it('devolve HTTP 404 para projeto inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/non-existent-id', {
        method: 'GET',
      });

      const res = await getProject(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('devolve HTTP 404 para tarefa inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/non-existent-id', {
        method: 'GET',
      });

      const res = await getTask(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('devolve HTTP 404 para cliente inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/clients/non-existent-id', {
        method: 'GET',
      });

      const res = await getClient(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });
});
