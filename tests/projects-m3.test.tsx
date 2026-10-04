import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ProjectSection from '../components/ProjectSection';
import { getProjectStatusStyle } from '../lib/utils';
import { createProjectHarness, findProjectElement } from './fixtures/projects-m3-harness';
import { M3FilterChip, M3SegmentedControl } from '../components/M3';

const project = {
  id: 'qa-project', title: 'Projeto M3 de exemplo', clientId: 'qa-client',
  statusId: 'qa-status', description: 'Descrição preservada', projectManagerId: 'qa-user',
  startDate: '2026-10-01', deliveryDate: '2026-12-01', categoryIds: [],
  teamsInvolvedIds: [], partnersIds: [], deleted: false,
};
const statuses = [{ id: 'qa-status', name: 'Estado configurado', color: 'laranja', scale: 2 }];
export const projectPreviewProps: React.ComponentProps<typeof ProjectSection> = {
  projects: [project] as any, clients: [{ id: 'qa-client', clientName: 'Cliente de exemplo', deleted: false }] as any,
  users: [{ id: 'qa-user', name: 'Pessoa de exemplo', roleId: 'ug-1', deleted: false }],
  tasks: [], comments: [], projectStatuses: statuses, taskStatuses: [],
  projectCategories: [], projectRisks: [], projectPriorities: [], projectTeams: [], projectPartners: [],
  selectedProjectId: null, setSelectedProjectId: () => {},
  addProject: () => {}, updateProject: () => {}, deleteProject: () => {}, addClient: () => {},
  addComment: () => {}, deleteComment: () => {}, addTask: () => {}, updateTask: () => {},
  currentUser: { id: 'qa-user', roleId: 'ug-1' },
};

describe('Projects M3 presentation', () => {
  it('renders the list with Foundation surfaces, configured badges and accessible project actions', () => {
    const html = renderToStaticMarkup(<ProjectSection {...projectPreviewProps} />);
    expect(html).toContain('m3-projects');
    expect(html).toContain('<h2>Lista de projetos</h2>');
    expect(html).toContain('rounded-card');
    expect(html).toContain('Novo projeto');
    expect(html).toContain('aria-label="Abrir projeto Projeto M3 de exemplo"');
    expect(html).toContain(getProjectStatusStyle('qa-status', statuses).badgeClass);
    expect(html).toContain('Cliente de exemplo');
    expect(html).toContain('Pessoa de exemplo');
    expect(html).toContain('Estado configurado');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('retains empty filters, soft-delete filtering and write permissions', () => {
    const html = renderToStaticMarkup(<ProjectSection {...projectPreviewProps}
      projects={[{ ...project, deleted: true }] as any} currentUser={undefined} />);
    expect(html).toContain('Nenhum projeto encontrado para os filtros selecionados.');
    expect(html).not.toContain('Novo projeto');
    expect(html).not.toContain('Abrir projeto Projeto M3');
  });

  it('renders the individual project, existing tabs and exactly one selected section', () => {
    const html = renderToStaticMarkup(<ProjectSection {...projectPreviewProps} selectedProjectId={project.id} />);
    expect(html).toContain('Descrição preservada');
    expect(html).toContain('aria-label="Secções do projeto"');
    expect(html).toContain('aria-label="Copiar link do projeto"');
    for (const text of ['Visão Geral', 'Tarefas (0)', 'Material (0)', 'Riscos (0)', 'Análise', 'Editar Projeto', 'Eliminar']) expect(html).toContain(text);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain(getProjectStatusStyle('qa-status', statuses).badgeClass);
  });

  it('preserves the delete confirmation/dependency guard and the unified task modal', () => {
    const source = readFileSync(new URL('../components/ProjectSection.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Confirmar Eliminação de Projeto');
    expect(source).toContain('if (projTasks.length > 0)');
    expect(source).toContain('await deleteProject(selectedProj.id)');
    expect(source.match(/<TaskDetailsModal\b/g)).toHaveLength(1);
    expect(source).toContain('normalizeTaskFromApiResponse');
    expect(source).toContain('getTaskStatusStyle(task.statusId, taskStatuses)');
  });

  it('real segmented filter retains pagination reset and phase selection', () => {
    const harness = createProjectHarness({ projectCurrentPage: 3 });
    const filter = findProjectElement(harness.render(projectPreviewProps), el => el.type === M3SegmentedControl);
    filter.props.onChange('completed');
    expect(harness.state.filterStatusGroup).toBe('completed');
    harness.render(projectPreviewProps);
    harness.effects.find(effect => effect.toString().includes('setProjectCurrentPage(1)'))!();
    expect(harness.state.projectCurrentPage).toBe(1);
  });

  it('real project navigation retains risk-form reset and all five views render', () => {
    const harness = createProjectHarness({ riskTitle: 'Temporário' });
    const props = { ...projectPreviewProps, selectedProjectId: project.id };
    const navigation = findProjectElement(harness.render(props), el => el.type === M3FilterChip && el.props.selected === false && React.Children.toArray(el.props.children).some(child => typeof child === 'string' && child.includes('Riscos')));
    navigation.props.onClick();
    expect(harness.state.activeDetailTab).toBe('riscos');
    expect(harness.state.riskTitle).toBe('');
    for (const tab of ['geral', 'tarefas', 'material', 'riscos', 'analise']) {
      harness.state.activeDetailTab = tab;
      expect(renderToStaticMarkup(harness.render(props))).toContain('Secções do projeto');
    }
  });

  it('real project form retains submit semantics, controlled title and Foundation fields', () => {
    const harness = createProjectHarness({ isEditing: true, formTitle: 'Título original' });
    const tree = harness.render(projectPreviewProps);
    const form = findProjectElement(tree, el => el.type === 'form');
    expect(typeof form.props.onSubmit).toBe('function');
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('type="submit"');
    expect(html).toContain('value="Título original"');
    expect(html).toContain('rounded-control');
    expect(html).toContain('aria-label="Nome do projeto');
  });

  it('real status update keeps its partial payload and keyboard task opening keeps the existing modal', () => {
    const updates: any[] = [];
    const harness = createProjectHarness();
    const props = { ...projectPreviewProps, selectedProjectId: project.id, updateProject: (id: string, payload: any) => { updates.push({ id, payload }); } };
    const status = findProjectElement(harness.render(props), el => el.props?.['aria-label'] === 'Estado');
    status.props.onChange({ target: { value: 'qa-status-next' } });
    expect(updates).toEqual([{ id: project.id, payload: { statusId: 'qa-status-next' } }]);
    harness.state.activeDetailTab = 'tarefas';
    const task = { id: 'qa-task', projectId: project.id, title: 'Tarefa exemplo', statusId: '', assigneeIds: [], deleted: false };
    const card = findProjectElement(harness.render({ ...props, tasks: [task] }), el => el.props?.['aria-label'] === 'Abrir tarefa Tarefa exemplo');
    let prevented = false;
    card.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    expect(harness.state.taskModalState.isOpen).toBe(true);
    expect(harness.state.taskModalState.task.id).toBe('qa-task');
    expect(harness.state.taskModalState.mode).toBe('edit');
  });

  it('real edit submit forwards the existing project payload without changing persistence', async () => {
    const saved: any[] = [];
    const harness = createProjectHarness({
      isEditing: true, editingId: project.id, formTitle: 'Projeto editado',
      formClient: 'qa-client', clientSearchQuery: 'Cliente de exemplo',
      formStatus: 'qa-status', formBudget: '1500', formTeams: ['qa-team'],
      formPartners: ['qa-partner'], formCategories: ['qa-category'],
    });
    const tree = harness.render({ ...projectPreviewProps, updateProject: async (id: string, payload: any) => { saved.push({ id, payload }); } });
    const form = findProjectElement(tree, el => el.type === 'form');
    await form.props.onSubmit({ preventDefault() {} });
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(project.id);
    expect(saved[0].payload.title).toBe('Projeto editado');
    expect(saved[0].payload.clientId).toBe('qa-client');
    expect(saved[0].payload.statusId).toBe('qa-status');
    expect(saved[0].payload.budgetValue).toBe(1500);
    expect(saved[0].payload.categoryIds).toEqual(['qa-category']);
    expect(saved[0].payload.teamsInvolvedIds).toEqual(['qa-team']);
    expect(saved[0].payload.partnersIds).toEqual(['qa-partner']);
    expect(harness.state.isEditing).toBe(false);
  });
});
