import { describe, it, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  mapRowToTaskDTO,
  createTaskServer,
  updateTaskServer,
  deleteTaskServer,
  getTaskServer,
  listTasksServer,
} from '@/lib/tasks/taskService';

// Mock Supabase client helper
function createMockSupabaseClient(initialTasks: any[] = [], initialAssignees: any[] = [], initialProjects: any[] = []) {
  let tasks = [...initialTasks];
  let assignees = [...initialAssignees];
  let projects = [...initialProjects];

  const client: any = {
    rpc: async (functionName: string, args: any) => {
      if (functionName === 'create_task_atomic') {
        const targetProj = projects.find(p => p.id === args.p_project_id && !p.deleted);
        if (args.p_project_id && !targetProj) {
          return { data: null, error: { message: 'Projeto associado não existe ou foi eliminado.', code: 'P0002' } };
        }
        const newTaskRow = {
          id: args.p_id,
          project_id: args.p_project_id,
          task_title: args.p_task_title,
          status_id: args.p_status_id,
          task_type_id: args.p_task_type_id,
          estimated_hours: args.p_estimated_hours,
          actual_hours: args.p_actual_hours,
          start_date: args.p_start_date,
          start_time: args.p_start_time,
          end_date: args.p_end_date,
          end_time: args.p_end_time,
          estimated_date: args.p_estimated_date,
          completed_date: args.p_completed_date,
          task_description: args.p_task_description,
          notes: args.p_notes,
          is_milestone: args.p_is_milestone,
          deleted: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: args.p_created_by,
          updated_by: args.p_created_by,
        };
        tasks.push(newTaskRow);
        if (args.p_assignee_user_ids && Array.isArray(args.p_assignee_user_ids)) {
          args.p_assignee_user_ids.forEach((uid: string) => {
            assignees.push({ task_id: args.p_id, user_id: uid });
          });
        }
        return { data: newTaskRow, error: null };
      }

      if (functionName === 'update_task_atomic') {
        const currentTask = tasks.find(t => t.id === args.p_id && !t.deleted);
        if (!currentTask) {
          return { data: null, error: { message: 'Tarefa não encontrada.', code: 'P0002' } };
        }
        if (args.p_expected_version !== null && currentTask.version !== args.p_expected_version) {
          return { data: null, error: { message: 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.', code: 'P0001' } };
        }
        currentTask.task_title = args.p_task_title || currentTask.task_title;
        currentTask.status_id = args.p_status_id || currentTask.status_id;
        currentTask.task_description = args.p_task_description || currentTask.task_description;
        currentTask.version += 1;
        currentTask.updated_at = new Date().toISOString();

        if (args.p_update_assignees) {
          assignees = assignees.filter(a => a.task_id !== args.p_id);
          if (args.p_assignee_user_ids && Array.isArray(args.p_assignee_user_ids)) {
            args.p_assignee_user_ids.forEach((uid: string) => {
              assignees.push({ task_id: args.p_id, user_id: uid });
            });
          }
        }
        return { data: currentTask, error: null };
      }

      if (functionName === 'delete_task_atomic') {
        const currentTask = tasks.find(t => t.id === args.p_id && !t.deleted);
        if (!currentTask) {
          return { data: null, error: { message: 'Tarefa não encontrada.', code: 'P0002' } };
        }
        if (args.p_expected_version !== null && currentTask.version !== args.p_expected_version) {
          return { data: null, error: { message: 'Conflito de concorrência ao eliminar tarefa.', code: 'P0001' } };
        }
        currentTask.deleted = true;
        currentTask.version += 1;
        currentTask.updated_at = new Date().toISOString();
        return { data: currentTask, error: null };
      }

      return { data: null, error: new Error(`RPC ${functionName} não implementada`) };
    },

    from: (tableName: string) => {
      let queryData = tableName === 'tasks' ? tasks : tableName === 'task_assignees' ? assignees : projects;

      const builder: any = {
        then: (onfulfilled: any) => Promise.resolve({ data: queryData, error: null }).then(onfulfilled),
        select: (cols: string, opts?: any) => builder,
        eq: (field: string, val: any) => {
          queryData = queryData.filter((item: any) => item[field] === val);
          return builder;
        },
        in: (field: string, vals: any[]) => {
          queryData = queryData.filter((item: any) => vals.includes(item[field]));
          return builder;
        },
        or: (condition: string) => builder,
        order: (field: string, opts?: any) => builder,
        range: (from: number, to: number) => {
          const sliced = queryData.slice(from, to + 1);
          return Promise.resolve({ data: sliced, count: queryData.length, error: null });
        },
        maybeSingle: async () => {
          const item = queryData[0] || null;
          return { data: item, error: null };
        },
        insert: async (rows: any[]) => {
          rows.forEach(r => queryData.push(r));
          return { data: rows, error: null };
        },
        update: (payload: any) => {
          const updateBuilder = {
            eq: (field: string, val: any) => {
              queryData.forEach((item: any) => {
                if (item[field] === val) {
                  Object.assign(item, payload);
                }
              });
              return updateBuilder;
            },
            select: async () => ({ data: queryData, error: null }),
          };
          return updateBuilder;
        },
        delete: () => {
          const delBuilder = {
            eq: (field: string, val: any) => {
              if (tableName === 'task_assignees') {
                assignees = assignees.filter(a => a[field] !== val);
              }
              return Promise.resolve({ error: null });
            },
          };
          return delBuilder;
        },
      };

      return builder;
    },
  };

  return { client, getTasks: () => tasks, getAssignees: () => assignees };
}

describe('FASE 63 — Desacoplamento e Persistência Atómica do domínio Tasks', () => {

  const mockProject = { id: '00000000-0000-0000-0000-000000000001', title: 'Projeto Teste', deleted: false };
  const mockUser1 = '11111111-1111-1111-1111-111111111111';
  const mockUser2 = '22222222-2222-2222-2222-222222222222';

  describe('1. Criação Atómica de Tarefas (createTaskServer)', () => {
    it('cria uma tarefa sem responsáveis atomicamente com DTO bem formatado', async () => {
      const { client, getTasks } = createMockSupabaseClient([], [], [mockProject]);
      const res = await createTaskServer(client, {
        projectId: mockProject.id,
        title: 'Tarefa Unitária',
        description: 'Descrição de teste',
        estimatedHours: 4,
        userId: mockUser1,
      });

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.title).toBe('Tarefa Unitária');
      expect(res.data?.projectId).toBe(mockProject.id);
      expect(res.data?.estimatedHours).toBe(4);
      expect(res.data?.version).toBe(1);
      expect(res.data?.assignedUserIds).toEqual([]);

      const tasksInDb = getTasks();
      expect(tasksInDb.length).toBe(1);
      expect(tasksInDb[0].task_title).toBe('Tarefa Unitária');
    });

    it('cria uma tarefa com múltiplos responsáveis em transação única', async () => {
      const { client, getAssignees } = createMockSupabaseClient([], [], [mockProject]);
      const res = await createTaskServer(client, {
        projectId: mockProject.id,
        title: 'Tarefa Multi-Responsável',
        assignedUserIds: [mockUser1, mockUser2],
        userId: mockUser1,
      });

      expect(res.success).toBe(true);
      expect(res.data?.assignedUserIds).toEqual([mockUser1, mockUser2]);

      const assigneesInDb = getAssignees();
      expect(assigneesInDb.length).toBe(2);
      expect(assigneesInDb.map(a => a.user_id)).toContain(mockUser1);
      expect(assigneesInDb.map(a => a.user_id)).toContain(mockUser2);
    });

    it('rejeita criação quando o projeto associado não existe', async () => {
      const { client } = createMockSupabaseClient([], [], []); // Nenhum projeto existe
      const res = await createTaskServer(client, {
        projectId: '99999999-9999-9999-9999-999999999999',
        title: 'Tarefa Órfã',
        userId: mockUser1,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('não existe ou foi eliminado');
    });
  });

  describe('2. Atualização Atómica e Controlo de Concorrência Otimista (updateTaskServer)', () => {
    it('atualiza tarefa e sincroniza responsáveis incrementando a versão (version = version + 1)', async () => {
      const initialTask = {
        id: 'task-100',
        project_id: mockProject.id,
        task_title: 'Título Inicial',
        status_id: 'ts-1',
        version: 1,
        deleted: false,
      };
      const { client, getTasks, getAssignees } = createMockSupabaseClient([initialTask], [], [mockProject]);

      const updateRes = await updateTaskServer(client, 'task-100', {
        title: 'Título Atualizado Atomicamente',
        version: 1,
        assignedUserIds: [mockUser2],
        userId: mockUser1,
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.title).toBe('Título Atualizado Atomicamente');
      expect(updateRes.data?.version).toBe(2);
      expect(updateRes.data?.assignedUserIds).toEqual([mockUser2]);

      const updatedDbTask = getTasks().find(t => t.id === 'task-100');
      expect(updatedDbTask.version).toBe(2);
      expect(updatedDbTask.task_title).toBe('Título Atualizado Atomicamente');
    });

    it('rejeita atualização se a versão esperada não coincidir com a BD e devolve HTTP 409 Conflict', async () => {
      const initialTask = {
        id: 'task-200',
        project_id: mockProject.id,
        task_title: 'Tarefa Concorrente',
        version: 5, // Versão na BD é 5
        deleted: false,
      };
      const { client } = createMockSupabaseClient([initialTask], [], [mockProject]);

      // Tenta atualizar com versão desatualizada (v=4)
      const updateRes = await updateTaskServer(client, 'task-200', {
        title: 'Tentativa de Escrita Antiga',
        version: 4,
        userId: mockUser1,
      });

      expect(updateRes.success).toBe(false);
      expect(updateRes.statusCode).toBe(409);
      expect(updateRes.error).toContain('Conflito de concorrência');
    });
  });

  describe('3. Soft-Delete Atómico (deleteTaskServer)', () => {
    it('marca tarefa como deleted = true e incrementa versão sem remover o registo fisicamente', async () => {
      const initialTask = {
        id: 'task-300',
        project_id: mockProject.id,
        task_title: 'Tarefa a Eliminar',
        version: 2,
        deleted: false,
      };
      const { client, getTasks } = createMockSupabaseClient([initialTask], [], [mockProject]);

      const delRes = await deleteTaskServer(client, 'task-300', mockUser1, 2);

      expect(delRes.success).toBe(true);

      const dbTask = getTasks().find(t => t.id === 'task-300');
      expect(dbTask).toBeDefined();
      expect(dbTask.deleted).toBe(true);
      expect(dbTask.version).toBe(3);
    });
  });

  describe('4. Arquitetura das API Routes e Mapeamento DTO', () => {
    it('mapRowToTaskDTO formata horas de forma consistente e segura', () => {
      const rawRow = {
        id: 'task-abc',
        project_id: 'proj-1',
        task_title: 'Minha Tarefa',
        estimated_hours: '7.5 hours',
        actual_hours: 3.5,
        version: 1,
        deleted: false,
      };

      const dto = mapRowToTaskDTO(rawRow, { 'task-abc': ['user-1'] });

      expect(dto.id).toBe('task-abc');
      expect(dto.title).toBe('Minha Tarefa');
      expect(dto.estimatedHours).toBe(7.5);
      expect(dto.actualHours).toBe(3.5);
      expect(dto.assignedUserIds).toEqual(['user-1']);
    });

    it('os endpoints /api/v1/tasks importam e consomem o taskService', () => {
      const mainRoute = readFileSync(join(process.cwd(), 'app/api/v1/tasks/route.ts'), 'utf-8');
      expect(mainRoute).toContain('from \'@/lib/tasks/taskService\'');
      expect(mainRoute).toContain('listTasksServer(');
      expect(mainRoute).toContain('createTaskServer(');

      const itemRoute = readFileSync(join(process.cwd(), 'app/api/v1/tasks/[id]/route.ts'), 'utf-8');
      expect(itemRoute).toContain('from \'@/lib/tasks/taskService\'');
      expect(itemRoute).toContain('getTaskServer(');
      expect(itemRoute).toContain('updateTaskServer(');
      expect(itemRoute).toContain('deleteTaskServer(');
    });
  });

  describe('5. Conformidade com as Regras Permanentes de Segurança', () => {
    it('garante que a regra estrita para ricardo75@gmail.com se mantém intacta e inviolável', () => {
      const agentsContent = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsContent).toContain('ricardo75@gmail.com');
      expect(agentsContent).toContain('deleted: true');
    });
  });

});
