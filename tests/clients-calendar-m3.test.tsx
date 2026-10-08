import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';
import { Dialog } from '../components/ui/Dialog';
import { Tabs } from '../components/ui/Tabs';
import ProjectTimeline from '../components/ProjectTimeline';
import TaskDetailsModal from '../components/TaskDetailsModal';

const client: any = { id: 'c', clientName: 'Cliente Exemplo', shortName: 'CE', location: 'Porto', taxId: '123', contactPerson: 'Ana', contactEmail: 'ana@example.invalid', contactPhone: '123', notes: 'Nota', deleted: false };
export const clientPreviewProps: any = { clients: [client], projects: [{ id: 'p', clientId: 'c', title: 'Projeto associado', deleted: false }], currentUser: { id: 'qa-user', roleId: 'ug-1' }, userGroups: [], addClient: () => {}, updateClient: () => {}, deleteClient: () => {}, onSelectProject: () => {} };
describe('Clients and Calendar M3', () => {
  it('renders clients with the Projects header, Foundation fields and no local palette or tiny typography', () => {
    const h = createSectionHarness('ClientSection.tsx');
    const tree = h.render(clientPreviewProps);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Lista de clientes'); expect(html).toContain('Cliente Exemplo');
    expect(html).toContain('text-body-sm'); expect(html).toContain('rounded-card');
    const source = readFileSync(new URL('../components/ClientSection.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(source).not.toMatch(/text-\[(9|10|11)px\]|text-xs|(?:bg|text|border)-(slate|blue)-/);
  });
  it('preserves client creation payload, failed submits and edit/delete permissions', async () => {
    const h = createSectionHarness('ClientSection.tsx', { isEditing: true, formName: 'Novo', formShortName: 'N', formTaxId: '999', formLocation: 'Lisboa', formContactPerson: 'Pessoa', formContactEmail: 'pessoa@example.invalid', formContactPhone: '123', formNotes: 'Notas' });
    let payload: any;
    const tree = h.render({ ...clientPreviewProps, addClient: async (p: any) => payload = p });
    await find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(payload).toEqual({ clientName: 'Novo', shortName: 'N', taxId: '999', location: 'Lisboa', contactPerson: 'Pessoa', contactEmail: 'pessoa@example.invalid', contactPhone: '123', notes: 'Notas' });
    expect(h.state.isEditing).toBe(false);
    h.state.isEditing = true;
    await find(h.render({ ...clientPreviewProps, addClient: async () => { throw new Error('fail'); } }), e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(h.state.isEditing).toBe(true);
    h.state.isEditing = false;
    const restricted = h.render({ ...clientPreviewProps, currentUser: { id: 'qa-user', roleId: 'ug-4' } });
    expect(find(restricted, e => e.props?.['aria-label'] === 'Editar cliente')).toBeUndefined();
    expect(find(restricted, e => e.props?.['aria-label'] === 'Eliminar cliente')).toBeUndefined();
  });
  it('preserves deletion confirmation and opens client project links in the Foundation Dialog', async () => {
    const h = createSectionHarness('ClientSection.tsx'); let deleted = '', selected = '';
    let tree = h.render({ ...clientPreviewProps, deleteClient: async (id: string) => deleted = id });
    find(tree, e => e.props?.['aria-label'] === 'Eliminar cliente').props.onClick();
    expect(deleted).toBe(''); expect(h.state.confirmState.isOpen).toBe(true);
    await h.state.confirmState.onConfirm(); expect(deleted).toBe('c');
    h.state.selectedClientForModal = client;
    tree = h.render({ ...clientPreviewProps, onSelectProject: (id: string) => selected = id });
    expect(find(tree, e => e.type === Dialog).props.title).toBe('Projetos de Cliente Exemplo');
    find(tree, e => e.props?.onClick && e.props?.children?.[0]?.props?.children?.[0]?.props?.children === 'Projeto associado').props.onClick();
    expect(selected).toBe('p'); expect(h.state.selectedClientForModal).toBe(null);
  });
  it('uses Projects-style tabs with icons, forwards risks and priorities, and preserves calendar permissions/modal', () => {
    const h = createSectionHarness('CalendarSection.tsx');
    const priorities = [{ id: 'high', name: 'Alta', scale: 1, deleted: false }];
    const props: any = { projects: [], tasks: [], clients: [], users: [], absences: [], taskStatuses: [], projectStatuses: [], projectPriorities: priorities, projectRiskItems: [{ id: 'r' }], currentUser: { id: 'qa-user', roleId: 'ug-1' } };
    let tree = h.render(props);
    const tabs = find(tree, e => e.type === Tabs);
    expect(tabs.props.tabs.map((t: any) => t.label)).toEqual(['Calendário semanal', 'Timeline de projetos']);
    expect(tabs.props.tabs.every((t: any) => React.isValidElement(t.icon))).toBe(true);
    tabs.props.onChange('projects'); tree = h.render(props);
    const timeline = find(tree, e => e.type === ProjectTimeline);
    expect(timeline.props.projectRiskItems).toEqual([{ id: 'r' }]);
    timeline.props.onCreateTask('2026-10-05', 'p');
    expect(h.state.modal).toEqual({ task: null, mode: 'create', date: '2026-10-05', userId: undefined, projectId: 'p' });
    tree = h.render(props);
    expect(find(tree, e => e.type === TaskDetailsModal).props.projectPriorities).toBe(priorities);
    expect(renderToStaticMarkup(h.render({ ...props, currentUser: { roleId: 'not-permitted' } }))).toContain('Sem permissão');
  });
});
