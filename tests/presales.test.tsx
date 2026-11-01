import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PresalesSection from '../components/PresalesSection';
import { createPresalesSchema, presalesActionSchema, presalesDocumentSchema } from '../lib/presales';
import { APP_SECTIONS } from '../lib/sectionCatalog';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';

const id = '11111111-1111-4111-8111-111111111111';

describe('Presales', () => {
  it('tem navegação e permissão próprias', () => {
    expect(APP_SECTIONS.find(section => section.id === 'presales')).toMatchObject({
      label: 'Presales', requiredPermission: 'presales_read',
    });
    const user = { id, name: 'Ana', approved: true, deleted: false, type: 'Team', email: '',
      roleId: CANONICAL_ROLE_IDS.PROJECT_MANAGER, permissions: ['presales.read','presales.create'] } as any;
    expect(renderToStaticMarkup(<PresalesSection currentUser={user} users={[]} projects={[]} projectPriorities={[]} onTasksChanged={async () => {}} />))
      .toContain('Novo Presales');
    expect(renderToStaticMarkup(<PresalesSection currentUser={{ ...user, permissions: ['presales.read'] }} users={[]} projects={[]} projectPriorities={[]} onTasksChanged={async () => {}} />))
      .not.toContain('Novo Presales');
  });
  it('exige entrega posterior ao pedido e aceita tarefas sem estimativa', () => {
    const input = { title: 'Proposta técnica', ownerId: id, plannedStartDate: '2026-11-01',
      plannedEndDate: '2026-11-10', requirements: 'Requisitos', outcome: 'Solução' };
    expect(createPresalesSchema.safeParse(input).success).toBe(true);
    expect(createPresalesSchema.safeParse({ ...input, plannedEndDate: '2026-10-31' }).success).toBe(false);
    expect(createPresalesSchema.safeParse({ ...input, plannedEndDate: input.plannedStartDate }).success).toBe(false);
    expect(presalesActionSchema.safeParse({ action: 'add_task', version: 1, title: 'Desenhar solução', assigneeIds: [id] }).success).toBe(true);
  });
  it('valida secções ordenáveis e linhas escolhidas para o documento', () => {
    const blocks = [
      { id, type: 'rich_text', title: 'Requisitos', content: 'Texto técnico' },
      { id: '22222222-2222-4222-8222-222222222222', type: 'item_summary', title: 'Intervenção XPTO',
        itemIds: ['33333333-3333-4333-8333-333333333333'], displayLabel: 'Intervenção XPTO' },
    ];
    expect(presalesDocumentSchema.safeParse({ schemaVersion: 1, blocks }).success).toBe(true);
    expect(presalesDocumentSchema.safeParse({ schemaVersion: 1, blocks: [blocks[0],blocks[0]] }).success).toBe(false);
    expect(presalesActionSchema.safeParse({ action: 'publish', version: 2 }).success).toBe(true);
  });
});
