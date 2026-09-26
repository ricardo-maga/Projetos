import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createTaskSchema, updateTaskSchema } from '../lib/validations/task';
import { getTaskConflictWarnings } from '../lib/taskConflicts';
import { POST as createTask } from '../app/api/v1/tasks/route';
import { PATCH as updateTask, DELETE as deleteTask } from '../app/api/v1/tasks/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as serverDbModule from '../lib/supabase/server';
import { NextRequest } from 'next/server';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'gestor@empresa.pt',
  name: 'Gestor Tarefas',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

const validProjectId = 'a0000000-0000-0000-0000-000000000001';
const validUserId1 = 'u0000000-0000-0000-0000-000000000001';
const validUserId2 = 'u0000000-0000-0000-0000-000000000002';

describe('FASE 28 — Simplificação e Robustez do Módulo de Tarefas', () => {
  let authSpy: any;
  let permSpy: any;
  let serverDbSpy: any;

  beforeEach(() => {
    authSpy = spyOn(authModule, 'requireAuth').mockResolvedValue({
      success: true,
      user: mockAuthenticatedUser,
      requestId: 'test-fase-28',
    });
    permSpy = spyOn(authModule, 'requirePermission').mockResolvedValue({
      success: true,
      user: mockAuthenticatedUser,
      requestId: 'test-fase-28',
    });
  });

  afterEach(() => {
    if (authSpy) authSpy.mockRestore();
    if (permSpy) permSpy.mockRestore();
    if (serverDbSpy) serverDbSpy.mockRestore();
  });

  describe('1. Criação e Validação de Tarefas (Schema & API)', () => {
    it('cria tarefa com todos os dados válidos', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Instalação de Painéis Fotovoltaicos',
        description: 'Montagem de estrutura na cobertura',
        estimatedHours: 8,
        estimatedDate: '2026-10-15',
        assignedUserIds: [validUserId1, validUserId2],
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.title).toBe('Instalação de Painéis Fotovoltaicos');
        expect(res.data.assignedUserIds).toEqual([validUserId1, validUserId2]);
      }
    });

    it('permite criar tarefa sem utilizadores atribuídos', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Inspeção Inicial',
        assignedUserIds: [],
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.assignedUserIds).toEqual([]);
      }
    });

    it('aceita horas previstas como número não negativo', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Manutenção Preventiva',
        estimatedHours: 4.5,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.estimatedHours).toBe(4.5);
      }
    });
  });

  describe('2. Validação de Horários de Execução (startTime & endTime)', () => {
    it('aceita hora de fim estritamente posterior à hora de início', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Trabalho de Campo',
        startTime: '08:00',
        endTime: '12:00',
      });
      expect(res.success).toBe(true);
    });

    it('rejeita hora de fim igual à hora de início (endTime == startTime)', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Trabalho de Campo Inválido',
        startTime: '10:00',
        endTime: '10:00',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const msg = res.error.issues.map(i => i.message).join(' ');
        expect(msg).toContain('A hora de fim deve ser posterior à hora de início');
      }
    });

    it('rejeita hora de fim anterior à hora de início (endTime < startTime)', () => {
      const res = createTaskSchema.safeParse({
        projectId: validProjectId,
        title: 'Trabalho Invertido',
        startTime: '17:00',
        endTime: '08:00',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const msg = res.error.issues.map(i => i.message).join(' ');
        expect(msg).toContain('A hora de fim deve ser posterior à hora de início');
      }
    });

    it('valida atualização com horário de fim inválido no updateTaskSchema', () => {
      const res = updateTaskSchema.safeParse({
        startTime: '14:00',
        endTime: '13:00',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('3. Verificação e Visibilidade de Conflitos (user + date)', () => {
    const mockUsers = [
      { id: 'u-1', name: 'Pedro Correia', email: 'pedro@empresa.pt', roleId: 'ug-1', isAdmin: false, isSuperAdmin: false, approved: true },
      { id: 'u-2', name: 'Hélder Silva', email: 'helder@empresa.pt', roleId: 'ug-1', isAdmin: false, isSuperAdmin: false, approved: true },
    ];

    const mockProjects = [
      { id: 'p-1', title: 'Cliente X', clientId: 'c-1', version: 1, deleted: false },
      { id: 'p-2', title: 'Máquina Y', clientId: 'c-1', version: 1, deleted: false },
    ];

    const mockExistingTasks = [
      {
        id: 'task-1',
        projectId: 'p-1',
        title: 'Instalação Cliente X',
        estimatedHours: 4,
        estimatedDate: '2026-09-24',
        assigneeIds: ['u-1'],
        deleted: false,
        version: 1,
      },
      {
        id: 'task-2',
        projectId: 'p-2',
        title: 'FAT Máquina Y',
        estimatedHours: 3,
        estimatedDate: '2026-09-24',
        assigneeIds: ['u-1'],
        deleted: false,
        version: 1,
      },
    ];

    it('deteta tarefas já agendadas para o mesmo utilizador no mesmo dia', () => {
      const warnings = getTaskConflictWarnings({
        date: '2026-09-24',
        assigneeIds: ['u-1'],
        tasks: mockExistingTasks,
        users: mockUsers,
        projects: mockProjects,
      });

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Pedro Correia já tem 2 tarefas planeadas para 24/09');
      expect(warnings[0]).toContain('Instalação Cliente X');
      expect(warnings[0]).toContain('FAT Máquina Y');
    });

    it('deteta ausência do utilizador no dia especificado', () => {
      const mockAbsences = [
        { id: 'abs-1', userId: 'u-1', startDate: '2026-09-24', endDate: '2026-09-24', deleted: false },
      ];

      const warnings = getTaskConflictWarnings({
        date: '2026-09-24',
        assigneeIds: ['u-1'],
        tasks: [],
        users: mockUsers,
        absences: mockAbsences,
        projects: mockProjects,
      });

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Pedro Correia está ausente em 24/09');
    });

    it('acumula conflitos de ausência e tarefas para múltiplos utilizadores', () => {
      const mockAbsences = [
        { id: 'abs-1', userId: 'u-2', startDate: '2026-09-24', endDate: '2026-09-24', deleted: false },
      ];

      const warnings = getTaskConflictWarnings({
        date: '2026-09-24',
        assigneeIds: ['u-1', 'u-2'],
        tasks: mockExistingTasks,
        users: mockUsers,
        absences: mockAbsences,
        projects: mockProjects,
      });

      expect(warnings.length).toBe(2);
      expect(warnings.some(w => w.includes('Pedro Correia já tem 2 tarefas planeadas'))).toBe(true);
      expect(warnings.some(w => w.includes('Hélder Silva está ausente em 24/09'))).toBe(true);
    });

    it('não gera avisos quando não existem conflitos na data', () => {
      const warnings = getTaskConflictWarnings({
        date: '2026-09-25',
        assigneeIds: ['u-1'],
        tasks: mockExistingTasks,
        users: mockUsers,
        absences: [],
        projects: mockProjects,
      });

      expect(warnings.length).toBe(0);
    });
  });

  describe('4. Teste Integrado da API (Inexistências & Regras de Integridade)', () => {
    it('bloqueia criação de tarefa com projeto inexistente com HTTP 400', async () => {
      const createChain = (items: any[]) => ({
        data: items,
        error: null,
        eq: () => createChain(items),
        maybeSingle: async () => ({ data: null, error: null }),
      });

      const mockDb: any = {
        from: (table: string) => ({
          select: () => createChain([]),
        }),
      };

      serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockResolvedValue(mockDb);

      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: '00000000-0000-0000-0000-000000000999',
          title: 'Tarefa em Projeto Inexistente',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error?.message || json.message).toContain('projeto');
    });

    it('bloqueia eliminação de tarefa com alocações de planeamento ativas com HTTP 409', async () => {
      const mockTask = { id: 'task-alloc-1', project_id: validProjectId, task_title: 'Tarefa com Alocação', deleted: false, version: 1 };
      const mockAllocations = [{ id: 'alloc-1', task_id: 'task-alloc-1', status: 'CONFIRMED' }];

      const createChain = (items: any[]) => {
        const obj: any = {
          data: items,
          error: null,
          select: () => obj,
          eq: (col: string, val: any) => createChain(items.filter(r => r[col] === val || r.id === val || r.task_id === val)),
          neq: (col: string, val: any) => createChain(items.filter(r => r[col] !== val)),
          maybeSingle: async () => ({ data: items[0] || null, error: null }),
          then: (cb: any) => Promise.resolve({ data: items, error: null }).then(cb),
        };
        return obj;
      };

      const mockDb: any = {
        from: (table: string) => {
          if (table === 'tasks') return createChain([mockTask]);
          if (table === 'planning_allocations') return createChain(mockAllocations);
          return createChain([]);
        },
      };

      serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockResolvedValue(mockDb);

      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-alloc-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-alloc-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error?.message || json.message).toContain('alocação');
    });
  });
});
