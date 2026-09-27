import { describe, it, expect } from 'bun:test';
import { getProjectsServerData } from '../lib/projects/projectService';

describe('FASE 45-A — Correções cirúrgicas ao ProjectService', () => {
  const mockProjectRow = {
    id: 'p-001',
    project_title: 'Projeto Teste 1',
    deleted: false,
    created_at: '2026-01-01T00:00:00Z',
  };

  function createMockSupabaseClient(overrides: {
    statusTableError?: any;
    teamsLinkError?: any;
    partnersLinkError?: any;
    categoryLinkError?: any;
    priorityLinkError?: any;
    riskLinkError?: any;
    projectsData?: any[];
    versionField?: any;
    queriedTables?: string[];
  } = {}) {
    const queriedTables: string[] = overrides.queriedTables || [];

    return {
      from: (tableName: string) => {
        queriedTables.push(tableName);

        const builder: any = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          or: () => builder,
          order: () => builder,
          range: () => builder,
          then: (resolve: Function) => {
            if (tableName === 'projects') {
              const projectsData = overrides.projectsData !== undefined
                ? overrides.projectsData
                : [
                    {
                      ...mockProjectRow,
                      version: overrides.versionField,
                    },
                  ];
              return resolve({ data: projectsData, count: projectsData.length, error: null });
            }

            if (tableName === 'project_status') {
              if (overrides.statusTableError) {
                return resolve({ data: null, error: overrides.statusTableError });
              }
              return resolve({
                data: [
                  { id: 'st-1', scale: 1, name: 'Em Análise' },
                  { id: 'st-2', scale: 4, name: 'Em Execução' },
                  { id: 'st-3', scale: 5, name: 'Concluído' },
                ],
                error: null,
              });
            }

            if (tableName === 'project_teams_link') {
              if (overrides.teamsLinkError) {
                return resolve({ data: null, error: overrides.teamsLinkError });
              }
              return resolve({ data: [{ project_id: 'p-001', team_id: 'team-1' }], error: null });
            }

            if (tableName === 'project_partners_link') {
              if (overrides.partnersLinkError) {
                return resolve({ data: null, error: overrides.partnersLinkError });
              }
              return resolve({ data: [{ project_id: 'p-001', partner_id: 'partner-1' }], error: null });
            }

            if (tableName === 'project_category_link') {
              if (overrides.categoryLinkError) {
                return resolve({ data: null, error: overrides.categoryLinkError });
              }
              return resolve({ data: [{ project_id: 'p-001', category_id: 'cat-1' }], error: null });
            }

            if (tableName === 'project_priority_link') {
              if (overrides.priorityLinkError) {
                return resolve({ data: null, error: overrides.priorityLinkError });
              }
              return resolve({ data: [{ project_id: 'p-001', priority_id: 'prio-1' }], error: null });
            }

            if (tableName === 'project_risk_link') {
              if (overrides.riskLinkError) {
                return resolve({ data: null, error: overrides.riskLinkError });
              }
              return resolve({ data: [{ project_id: 'p-001', risk_id: 'risk-1' }], error: null });
            }

            return resolve({ data: [], error: null });
          },
        };

        return builder;
      },
    };
  }

  it('1. Utilização da tabela project_status ao filtrar por statusGroup', async () => {
    const queriedTables: string[] = [];
    const client = createMockSupabaseClient({ queriedTables }) as any;

    await getProjectsServerData(client, { statusGroup: 'active' });

    expect(queriedTables).toContain('project_status');
    expect(queriedTables).not.toContain('project_statuses');
  });

  it('2. Erro em project_teams_link é propagado', async () => {
    const client = createMockSupabaseClient({
      teamsLinkError: { message: 'DB connection error on project_teams_link', code: '500' },
    }) as any;

    expect(getProjectsServerData(client, { all: true })).rejects.toEqual({
      message: 'DB connection error on project_teams_link',
      code: '500',
    });
  });

  it('3. Erro em project_partners_link é propagado', async () => {
    const client = createMockSupabaseClient({
      partnersLinkError: { message: 'DB connection error on project_partners_link', code: '500' },
    }) as any;

    expect(getProjectsServerData(client, { all: true })).rejects.toEqual({
      message: 'DB connection error on project_partners_link',
      code: '500',
    });
  });

  it('4. Erro em project_category_link é propagado', async () => {
    const client = createMockSupabaseClient({
      categoryLinkError: { message: 'DB connection error on project_category_link', code: '500' },
    }) as any;

    expect(getProjectsServerData(client, { all: true })).rejects.toEqual({
      message: 'DB connection error on project_category_link',
      code: '500',
    });
  });

  it('5. Erro em project_priority_link é propagado', async () => {
    const client = createMockSupabaseClient({
      priorityLinkError: { message: 'DB connection error on project_priority_link', code: '500' },
    }) as any;

    expect(getProjectsServerData(client, { all: true })).rejects.toEqual({
      message: 'DB connection error on project_priority_link',
      code: '500',
    });
  });

  it('6. Erro em project_risk_link é propagado', async () => {
    const client = createMockSupabaseClient({
      riskLinkError: { message: 'DB connection error on project_risk_link', code: '500' },
    }) as any;

    expect(getProjectsServerData(client, { all: true })).rejects.toEqual({
      message: 'DB connection error on project_risk_link',
      code: '500',
    });
  });

  it('7. Resposta sem version não cria version = 1 (mantém undefined/null)', async () => {
    const clientUndefinedVersion = createMockSupabaseClient({ versionField: undefined }) as any;
    const resUndefined = await getProjectsServerData(clientUndefinedVersion, { all: true });
    expect(resUndefined.data[0].version).toBeUndefined();

    const clientNullVersion = createMockSupabaseClient({ versionField: null }) as any;
    const resNull = await getProjectsServerData(clientNullVersion, { all: true });
    expect(resNull.data[0].version).toBeNull();
  });

  it('8. Resposta com version mantém exatamente a versão devolvida pelo servidor', async () => {
    const clientVersion5 = createMockSupabaseClient({ versionField: 5 }) as any;
    const res5 = await getProjectsServerData(clientVersion5, { all: true });
    expect(res5.data[0].version).toBe(5);

    const clientVersion10 = createMockSupabaseClient({ versionField: 10 }) as any;
    const res10 = await getProjectsServerData(clientVersion10, { all: true });
    expect(res10.data[0].version).toBe(10);
  });
});
