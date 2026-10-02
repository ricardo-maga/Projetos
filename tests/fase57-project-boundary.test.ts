import { describe, it, expect, spyOn, beforeEach } from 'bun:test';
import { getProjectsServerData, createProject, updateProject, getProject, listProjects, deleteProject } from '../lib/projects/projectService';
import { fetchPaginatedProjectsDirectly } from '../lib/supabaseSync';

describe('FASE 57-FINAL — Strict PostgreSQL RPC Persistence Boundary & Canonical Model Verification', () => {
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
  let rpcCalls: { fn: string; args: any }[];
  let fromInsertsCount: number;
  let fromUpdatesCount: number;

  beforeEach(() => {
    rpcCalls = [];
    fromInsertsCount = 0;
    fromUpdatesCount = 0;

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
      rpc: async (fn: string, args: any) => {
        rpcCalls.push({ fn, args });

        if (fn === 'create_project_transaction') {
          const newProj = {
            id: args.p_id,
            demo: args.p_demo,
            client_id: args.p_client_id,
            project_title: args.p_project_title,
            project_description: args.p_project_description,
            status_id: args.p_status_id,
            category_id: args.p_category_ids?.[0] || null,
            project_manager_id: args.p_project_manager_id,
            field_manager_id: args.p_field_manager_id,
            sales_rep_id: args.p_sales_rep_id,
            start_date: args.p_start_date,
            delivery_date: args.p_delivery_date,
            estimated_date: args.p_estimated_date,
            scheduled_date: args.p_scheduled_date,
            install_project_no: args.p_install_project_no,
            sf_opportunity_no: args.p_sf_opportunity_no,
            documents: args.p_documents,
            budget_value: args.p_budget_value,
            client_contact_name: args.p_client_contact_name,
            client_contact_email: args.p_client_contact_email,
            client_contact_phone: args.p_client_contact_phone,
            color: args.p_color,
            notes: args.p_notes,
            created_by: args.p_created_by,
            is_urgent: args.p_is_urgent,
            deleted: false,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockDbData.projects.push(newProj);
          if (args.p_priority_id) mockDbData.project_priority_link.push({ project_id: args.p_id, priority_id: args.p_priority_id });
          if (args.p_risk_id) mockDbData.project_risk_link.push({ project_id: args.p_id, risk_id: args.p_risk_id });
          (args.p_category_ids || []).forEach((c: string) => mockDbData.project_category_link.push({ project_id: args.p_id, category_id: c }));
          (args.p_teams_involved_ids || []).forEach((t: string) => mockDbData.project_teams_link.push({ project_id: args.p_id, team_id: t }));
          (args.p_partners_ids || []).forEach((p: string) => mockDbData.project_partners_link.push({ project_id: args.p_id, partner_id: p }));
          return { data: args.p_id, error: null };
        }

        if (fn === 'update_project_transaction') {
          const proj = mockDbData.projects.find((p: any) => p.id === args.p_id);
          if (!proj) return { error: { message: 'Project not found' } };
          if (args.p_expected_version !== undefined && proj.version !== args.p_expected_version) {
            return { error: { code: 'P0001', message: `Concurrency conflict: current version is ${proj.version}, expected ${args.p_expected_version}` } };
          }
          proj.version = (proj.version || 1) + 1;
          proj.project_title = args.p_project_title;
          proj.project_description = args.p_project_description;
          proj.client_id = args.p_client_id;
          proj.status_id = args.p_status_id;
          proj.category_id = args.p_category_ids?.[0] || null;
          proj.updated_at = new Date().toISOString();

          if (args.p_priority_id !== undefined) {
            mockDbData.project_priority_link = mockDbData.project_priority_link.filter((l: any) => l.project_id !== args.p_id);
            if (args.p_priority_id) mockDbData.project_priority_link.push({ project_id: args.p_id, priority_id: args.p_priority_id });
          }
          if (args.p_risk_id !== undefined) {
            mockDbData.project_risk_link = mockDbData.project_risk_link.filter((l: any) => l.project_id !== args.p_id);
            if (args.p_risk_id) mockDbData.project_risk_link.push({ project_id: args.p_id, risk_id: args.p_risk_id });
          }
          if (args.p_category_ids !== undefined) {
            mockDbData.project_category_link = mockDbData.project_category_link.filter((l: any) => l.project_id !== args.p_id);
            args.p_category_ids.forEach((c: string) => mockDbData.project_category_link.push({ project_id: args.p_id, category_id: c }));
          }
          if (args.p_teams_involved_ids !== undefined) {
            mockDbData.project_teams_link = mockDbData.project_teams_link.filter((l: any) => l.project_id !== args.p_id);
            args.p_teams_involved_ids.forEach((t: string) => mockDbData.project_teams_link.push({ project_id: args.p_id, team_id: t }));
          }
          if (args.p_partners_ids !== undefined) {
            mockDbData.project_partners_link = mockDbData.project_partners_link.filter((l: any) => l.project_id !== args.p_id);
            args.p_partners_ids.forEach((p: string) => mockDbData.project_partners_link.push({ project_id: args.p_id, partner_id: p }));
          }
          return { data: proj.version, error: null };
        }

        if (fn === 'delete_project_transaction') {
          const proj = mockDbData.projects.find((p: any) => p.id === args.p_id);
          if (!proj) return { error: { code: 'P0002', message: 'Project not found' } };
          if (args.p_expected_version !== undefined && proj.version !== args.p_expected_version) {
            return { error: { code: 'P0001', message: `Concurrency conflict: current version is ${proj.version}, expected ${args.p_expected_version}` } };
          }
          proj.deleted = true;
          proj.version = (proj.version || 1) + 1;
          proj.updated_at = new Date().toISOString();
          proj.updated_by = args.p_updated_by || null;
          return { data: proj.version, error: null };
        }

        return { data: null, error: { message: `Unknown RPC function ${fn}` } };
      },
      from: (table: string) => ({
        select: (cols?: string) => createChain(mockDbData[table] || []),
        insert: async (rows: any[]) => {
          if (table === 'projects') fromInsertsCount++;
          if (!mockDbData[table]) mockDbData[table] = [];
          mockDbData[table].push(...rows);
          return { error: null };
        },
        update: (payload: any) => {
          if (table === 'projects') fromUpdatesCount++;
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

  it('A. createProject chama exclusivamente a RPC e não faz inserts diretos no Supabase', async () => {
    const newP = await createProject(
      mockSb,
      {
        title: 'Novo Projeto via RPC Strict',
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
    expect(newP.title).toBe('Novo Projeto via RPC Strict');
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('create_project_transaction');
    expect(fromInsertsCount).toBe(0); // Zero direct table inserts
  });

  it('B. updateProject chama exclusivamente a RPC e não faz updates ou deletes diretos', async () => {
    const updated = await updateProject(mockSb, pId, { title: 'Título Alterado via RPC' }, 'u-1', 1);

    expect(updated.title).toBe('Título Alterado via RPC');
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('update_project_transaction');
    expect(fromUpdatesCount).toBe(0); // Zero direct table updates
  });

  it('C. Erro da RPC em createProject é imediatamente propagado sem tentativa de fallback', async () => {
    const errorSb = {
      ...mockSb,
      rpc: async () => ({ data: null, error: { message: 'Erro fatal de constraint em PL/pgSQL' } }),
    };

    expect(
      createProject(
        errorSb as any,
        {
          title: 'Projeto que Falha na RPC',
        },
        'u-1'
      )
    ).rejects.toThrow('Erro fatal de constraint em PL/pgSQL');

    expect(fromInsertsCount).toBe(0); // Garante que NENHUMA tentativa de insert direto foi feita
  });

  it('D. Erro da RPC em updateProject é imediatamente propagado sem tentativa de fallback', async () => {
    const errorSb = {
      ...mockSb,
      rpc: async () => ({ data: null, error: { message: 'Erro fatal de permissão em PL/pgSQL' } }),
    };

    expect(
      updateProject(errorSb as any, pId, { title: 'UPDATE com falha RPC' }, 'u-1', 1)
    ).rejects.toThrow('Erro fatal de permissão em PL/pgSQL');

    expect(fromUpdatesCount).toBe(0); // Garante que NENHUMA tentativa de update direto foi feita
  });

  it('E. Relações continuam a ser lidas exclusivamente das tabelas de ligação', async () => {
    const project = await getProject(mockSb, pId);
    expect(project).not.toBeNull();
    expect(project!.priorityId).toBe(prioId);
    expect(project!.riskId).toBe(riskId);
    expect(project!.teamsInvolvedIds).toEqual([teamId]);
    expect(project!.partnersIds).toEqual([partnerId]);
    expect(project!.categoryIds).toEqual([catId]);
  });

  it('F. Concorrência Otimista (OCC) funciona via RPC', async () => {
    expect(
      updateProject(mockSb, pId, { title: 'Tentativa Concorrente Incorreta' }, 'u-1', 99)
    ).rejects.toThrow('Conflito de concorrência');
  });

  it('G. deleteProject chama exclusivamente a RPC delete_project_transaction e não faz updates diretos no Supabase', async () => {
    fromUpdatesCount = 0;
    rpcCalls = [];

    await deleteProject(mockSb, pId, 'u-1', 1);

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('delete_project_transaction');
    expect(rpcCalls[0].args.p_id).toBe(pId);
    expect(rpcCalls[0].args.p_expected_version).toBe(1);
    expect(fromUpdatesCount).toBe(0); // Zero direct table updates
    expect(mockDbData.projects.find((p: any) => p.id === pId).deleted).toBe(true);
  });
});
