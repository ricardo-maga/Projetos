import { describe, it, expect, spyOn, beforeEach } from 'bun:test';
import { getProjectsServerData, createProject, updateProject, getProject, listProjects, deleteProject } from '../lib/projects/projectService';
import { fetchPaginatedProjectsDirectly } from '../lib/supabaseSync';
import { GET as getProjectsApi, POST as createProjectApi } from '../app/api/v1/projects/route';
import { GET as getProjectApi, PATCH as updateProjectApi, DELETE as deleteProjectApi } from '../app/api/v1/projects/[id]/route';

describe('FASE 57 — Project Persistence Boundary & Canonical Model Verification', () => {
  const pId = '11111111-1111-4111-a111-111111111111';
  const cId = '22222222-2222-4222-a222-222222222222';
  const statusId = '33333333-3333-4333-a333-333333333333';
  const catId = '44444444-4444-4444-a444-444444444444';
  const prioId = '55555555-5555-4555-a555-555555555555';
  const riskId = '66666666-6666-4666-a666-666666666666';
  const teamId = '77777777-7777-4777-a777-777777777777';
  const partnerId = '88888888-8888-4888-a888-888888888888';

  let mockDbData: Record<string, any[]>;
  let mockSb: any;

  beforeEach(() => {
    mockDbData = {
      projects: [
        {
          id: pId,
          project_title: 'Chiller Bloco Central',
          client_id: cId,
          status_id: statusId,
          category_id: catId,
          deleted: false,
          version: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      clients: [{ id: cId, client_name: 'Cliente Alpha', deleted: false }],
      project_status: [{ id: statusId, name: 'Em Execução', scale: 2, deleted: false }],
      project_category: [{ id: catId, name: 'HVAC', deleted: false }],
      project_priority_link: [{ project_id: pId, priority_id: prioId }],
      project_risk_link: [{ project_id: pId, risk_id: riskId }],
      project_teams_link: [{ project_id: pId, team_id: teamId }],
      project_partners_link: [{ project_id: pId, partner_id: partnerId }],
      project_category_link: [{ project_id: pId, category_id: catId }],
      tasks: [],
      quotes: [],
      project_materials: [],
      users: [],
    };

    const createChain = (items: any[]) => {
      const obj: any = {
        data: items,
        error: null,
        eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
        in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
        or: () => createChain(items),
        order: () => obj,
        range: async () => ({ data: items, count: items.length, error: null }),
        maybeSingle: async () => ({ data: items[0] || null, error: null }),
        single: async () => ({ data: items[0] || null, error: null }),
        then: (cb: any) => Promise.resolve({ data: items, count: items.length, error: null }).then(cb),
      };
      return obj;
    };

    mockSb = {
      from: (table: string) => ({
        select: (cols?: string) => createChain(mockDbData[table] || []),
        insert: async (rows: any[]) => {
          // Verify that inserts into projects never contain legacy relation columns
          if (table === 'projects') {
            for (const row of rows) {
              expect(row.priority_id).toBeUndefined();
              expect(row.risk_id).toBeUndefined();
              expect(row.teams_involved_ids).toBeUndefined();
              expect(row.partners_ids).toBeUndefined();
            }
          }
          if (!mockDbData[table]) mockDbData[table] = [];
          mockDbData[table].push(...rows);
          return { error: null };
        },
        update: (payload: any) => {
          // Verify that updates to projects never contain legacy relation columns
          if (table === 'projects') {
            expect(payload.priority_id).toBeUndefined();
            expect(payload.risk_id).toBeUndefined();
            expect(payload.teams_involved_ids).toBeUndefined();
            expect(payload.partners_ids).toBeUndefined();
          }
          const filters: Record<string, any> = {};
          const updateObj: any = {
            eq: (col: string, val: any) => {
              filters[col] = val;
              return updateObj;
            },
            select: async () => {
              const matched = (mockDbData[table] || []).filter((r: any) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (r[k] !== v) return false;
                }
                return true;
              });
              for (const item of matched) {
                Object.assign(item, payload);
              }
              return { data: matched.map((i: any) => ({ id: i.id })), error: null };
            },
          };
          return updateObj;
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            mockDbData[table] = (mockDbData[table] || []).filter((r: any) => r[col] !== val);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  });

  it('1. Nenhuma escrita em projects utiliza priority_id, risk_id, teams_involved_ids ou partners_ids', async () => {
    const newP = await createProject(
      mockSb,
      {
        title: 'Novo Projeto Auditado',
        clientId: cId,
        priorityId: prioId,
        riskId: riskId,
        teamsInvolvedIds: [teamId],
        partnersIds: [partnerId],
        categoryIds: [catId],
      },
      'u-1'
    );

    expect(newP).toBeDefined();
    expect(newP.title).toBe('Novo Projeto Auditado');
    expect(newP.priorityId).toBe(prioId);
    expect(newP.riskId).toBe(riskId);

    const insertedRaw = mockDbData.projects.find((p: any) => p.id === newP.id);
    expect(insertedRaw.priority_id).toBeUndefined();
    expect(insertedRaw.risk_id).toBeUndefined();
    expect(insertedRaw.teams_involved_ids).toBeUndefined();
    expect(insertedRaw.partners_ids).toBeUndefined();
  });

  it('2. Relações são lidas exclusivamente das tabelas de ligação correspondentes', async () => {
    const project = await getProject(mockSb, pId);
    expect(project).not.toBeNull();
    expect(project!.priorityId).toBe(prioId);
    expect(project!.riskId).toBe(riskId);
    expect(project!.teamsInvolvedIds).toEqual([teamId]);
    expect(project!.partnersIds).toEqual([partnerId]);
    expect(project!.categoryIds).toEqual([catId]);
  });

  it('3. GET individual e GET paginado utilizam exatamente o mesmo serviço e modelo', async () => {
    const single = await getProject(mockSb, pId);
    const paginated = await listProjects(mockSb, { page: 1, pageSize: 10 });

    expect(paginated.data.length).toBe(1);
    expect(paginated.data[0]).toEqual(single!);
  });

  it('4. fetchPaginatedProjectsDirectly delega integralmente no serviço canónico de Projects', async () => {
    const res = await fetchPaginatedProjectsDirectly({ page: 1, pageSize: 10 }, mockSb);
    expect(res.success).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    const p = res.data[0];
    expect(p.categoryIds).toBeDefined();
    expect(Array.isArray(p.categoryIds)).toBe(true);
  });

  it('5. Alterações de campos escalares não alteram relações e alterações de relações não escrevem colunas indevidas', async () => {
    const updated = await updateProject(mockSb, pId, { title: 'Título Alterado' }, 'u-1', 1);
    expect(updated.title).toBe('Título Alterado');
    expect(updated.priorityId).toBe(prioId);
    expect(updated.riskId).toBe(riskId);
    expect(updated.teamsInvolvedIds).toEqual([teamId]);

    const raw = mockDbData.projects.find((p: any) => p.id === pId);
    expect(raw.priority_id).toBeUndefined();
    expect(raw.risk_id).toBeUndefined();
  });

  it('6. Rollback transacional se falhar a criação de uma relação', async () => {
    const sbWithError = {
      from: (table: string) => {
        if (table === 'project_partners_link') {
          return {
            insert: async () => ({ error: { message: 'Erro provocado em partners_link' } }),
          };
        }
        return mockSb.from(table);
      },
    };

    expect(
      createProject(
        sbWithError as any,
        {
          title: 'Projeto com Falha',
          partnersIds: [partnerId],
        },
        'u-1'
      )
    ).rejects.toThrow();

    const created = mockDbData.projects.find((p: any) => p.project_title === 'Projeto com Falha');
    expect(created).toBeUndefined();
  });
});
