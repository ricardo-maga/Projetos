import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MechanicalDesignSection from '../components/MechanicalDesignSection';
import { createDesignSchema, isMechanicalDesignManager, manageDesignSchema, mapDesignRows, TASK_STATUS } from '../lib/mechanicalDesign';
import { APP_SECTIONS } from '../lib/sectionCatalog';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';

const id = (digit: number) => `${digit}`.repeat(8) + '-1111-4111-8111-111111111111';

describe('Desenho mecânico', () => {
  it('reconhece apenas gestores de projeto ativos, incluindo atribuições adicionais', () => {
    const profile = { roleId: CANONICAL_ROLE_IDS.TECHNICIAN,
      roleIds: [CANONICAL_ROLE_IDS.TECHNICIAN, CANONICAL_ROLE_IDS.PROJECT_MANAGER],
      approved: true, deleted: false, type: 'Team' as const };
    expect(isMechanicalDesignManager(profile)).toBe(true);
    expect(isMechanicalDesignManager({ ...profile, roleIds: [CANONICAL_ROLE_IDS.TECHNICIAN] })).toBe(false);
    expect(isMechanicalDesignManager({ ...profile, roleIds: [], roleId: CANONICAL_ROLE_IDS.PROJECT_MANAGER })).toBe(false);
    expect(isMechanicalDesignManager({ ...profile, deleted: true })).toBe(false);
    expect(isMechanicalDesignManager({ ...profile, type: 'External' })).toBe(false);
  });
  it('tem entrada própria na navegação e apresenta um percurso distinto de Tasks', () => {
    expect(APP_SECTIONS.find(section => section.id === 'desenho-mecanico')?.label).toBe('Desenho mecânico');
    const html = renderToStaticMarkup(<MechanicalDesignSection currentUser={{ id: id(1), name: 'Ana', approved: true,
      deleted: false, type: 'Team', email: '', roleId: '' } as any} users={[]} projects={[]} onTasksChanged={async () => {}} />);
    expect(html).toContain('Desenho mecânico');
    expect(html).toContain('Novo pedido');
  });

  it('exige prazo coerente, atribuição e estimativas em meios dias', () => {
    const create = { title: 'Desenho da estação', ownerId: id(2), plannedStartDate: '2026-11-05',
      plannedEndDate: '2026-11-04', instructions: '', deliverables: '' };
    expect(createDesignSchema.safeParse(create).success).toBe(false);
    expect(createDesignSchema.safeParse({ ...create, plannedEndDate: '2026-11-06' }).success).toBe(true);
    expect(manageDesignSchema.safeParse({ action: 'accept', version: 1, assigneeIds: [], estimatedDays: 0.5 }).success).toBe(false);
    expect(manageDesignSchema.safeParse({ action: 'accept', version: 1, assigneeIds: [id(3)], estimatedDays: 0.75 }).success).toBe(false);
    expect(manageDesignSchema.safeParse({ action: 'accept', version: 1, assigneeIds: [id(3)], estimatedDays: 1.5 }).success).toBe(true);
  });

  it('mantém a tarefa inicial ao acrescentar tarefas de desenvolvimento', () => {
    const requestId = id(1), firstId = id(2), extraId = id(3);
    const rows = mapDesignRows([{
      id: requestId, title: 'Estação', status: 'accepted', requester_id: id(4), area_owner_id: id(5),
      project_id: null, version: 2, created_at: '2026-10-29', delivered_at: null, delivered_by: null,
      planned_start_date: '2026-11-01', planned_end_date: '2026-11-07',
    }], [{ request_id: requestId, instructions: 'Modelar suporte', deliverables: 'Ficheiro CAD' }], [
      { request_id: requestId, task_id: firstId, is_initial: true, estimated_days: 1 },
      { request_id: requestId, task_id: extraId, is_initial: false, estimated_days: 0.5 },
    ], [
      { id: firstId, task_title: 'Desenvolvimento', status_id: TASK_STATUS.progress, version: 2 },
      { id: extraId, task_title: 'Desenhos técnicos', status_id: TASK_STATUS.pending, version: 1 },
    ], [
      { task_id: firstId, user_id: id(6) }, { task_id: extraId, user_id: id(6) },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tasks).toHaveLength(2);
    expect(rows[0].tasks[0].id).toBe(firstId);
    expect(rows[0].tasks[0].isInitial).toBe(true);
    expect(rows[0].tasks[1].estimatedDays).toBe(0.5);
    expect(rows[0].tasks[0].assigneeIds).toEqual([id(6)]);
  });
});
