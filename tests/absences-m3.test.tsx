import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { getAbsenceVisibility } from '../lib/absenceVisibility';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';
import { cn } from '../lib/utils';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';

const groups = [{ id: 'custom-z', name: 'Zebra' }, { id: 'custom-a', name: 'Águia' }, { id: 'custom-x', name: 'Outro' }, { id: 'custom-d', name: 'Eliminado', deleted: true }];
const users = [{ id: 'z', name: 'Zé', roleId: 'custom-z' }, { id: 'a', name: 'Ana', roleId: 'custom-a' }, { id: 'b', name: 'Bia', roleId: 'custom-a' }, { id: 'x', name: 'Pessoa excluída', roleId: 'custom-x' }, { id: 'd', name: 'Pessoa eliminada', roleId: 'custom-a', deleted: true }, { id: 'dg', name: 'Grupo eliminado', roleId: 'custom-d' }];
const config = { taskAssigneeGroupIds: ['custom-z', 'custom-a', 'custom-d'] };
const absence = (id: string, userId: string) => ({ id, userId, absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-06', createdDate: '2026-10-01', reason: 'Vacation' });
const props: any = { users, userGroups: groups, appConfig: config, absences: [absence('visible', 'a'), absence('excluded', 'x'), absence('deleted', 'd')], hideUsers: true,
  currentUser: { id: 'qa-user', roleId: 'ug-1' }, specialDays: [], addAbsence: () => {}, deleteAbsence: () => {}, addUser: () => {}, updateUser: () => {}, deleteUser: () => {} };

describe('Absences configured group visibility', () => {
  it('sorts only configured active groups and their active users alphabetically without collapsing unknown custom roles', () => {
    const scope = getAbsenceVisibility(users, groups, config);
    expect(scope.groups.map(g => g.name)).toEqual(['Águia', 'Zebra']);
    expect(scope.users.map(u => u.name)).toEqual(['Ana', 'Bia', 'Zé']);
    expect(groups.map(g => g.name)).toEqual(['Zebra', 'Águia', 'Outro', 'Eliminado']);
  });
  it('has no all-users fallback, honours an explicit empty array and supports the legacy configured group', () => {
    expect(getAbsenceVisibility(users, groups).users).toEqual([]);
    expect(getAbsenceVisibility(users, groups, { taskAssigneeGroupIds: [], taskAssigneeGroupId: 'custom-a' }).users).toEqual([]);
    expect(getAbsenceVisibility(users, groups, { taskAssigneeGroupId: 'custom-a, custom-z' }).users).toHaveLength(3);
    expect(getAbsenceVisibility(users, groups, { taskAssigneeGroupIds: ['missing'] }).users).toEqual([]);
  });
  it('matches existing canonical role aliases to configured groups', () => {
    expect(getAbsenceVisibility([{ id: 'viewer', name: 'Pessoa', roleId: 'ug-4' }], [{ id: CANONICAL_ROLE_IDS.VIEWER, name: 'Equipa' }], { taskAssigneeGroupIds: ['ug-4'] }).users).toHaveLength(1);
  });
});

describe('Absences M3 presentation and existing actions', () => {
  it('renders configured optgroups, filters both calendar and records, and uses Foundation controls', () => {
    const h = createSectionHarness('UserSection.tsx', { currentCalendarDate: new Date(2026, 9, 1) });
    const tree = h.render(props), html = renderToStaticMarkup(tree);
    expect(html).toContain('Registo de ausências'); expect(html).toContain('Calendário mensal');
    expect(html).toContain('Ausências registadas'); expect(html).toContain('rounded-card');
    expect(html.indexOf('label="Águia"')).toBeLessThan(html.indexOf('label="Zebra"'));
    expect(html).not.toContain('Pessoa excluída'); expect(html).not.toContain('Pessoa eliminada');
    expect(html).toContain('Ana (Ausente:');
    expect(html.match(/Confirmar Eliminação/g)).toBeNull();
    const source = readFileSync(new URL('../components/UserSection.tsx', import.meta.url), 'utf8');
    const section = source.slice(source.indexOf("{subTab === 'absences' && ("), source.indexOf("{subTab === 'users' && ("));
    expect(section).not.toMatch(/<(button|select|input|textarea)\b/);
    expect(section).not.toMatch(/text-\[(8|9|10|11)px\]|text-xs|(?:bg|text|border)-(slate|blue|rose)-/);
  });
  it('keeps the canonical absence payload and deletion confirmation', () => {
    const h = createSectionHarness('UserSection.tsx', { userId: 'b', startDate: '2026-10-08', endDate: '2026-10-09' });
    let added: any, deleted = '';
    let tree = h.render({ ...props, addAbsence: (value: any) => added = value, deleteAbsence: (id: string) => deleted = id });
    find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(added).toEqual({ userId: 'b', absenceStartDate: '2026-10-08', absenceEndDate: '2026-10-09', reason: 'Vacation' });
    expect(h.state.userId).toBe('');
    tree = h.render({ ...props, deleteAbsence: (id: string) => deleted = id });
    find(tree, e => e.props?.children === 'Eliminar').props.onClick();
    expect(deleted).toBe(''); expect(h.state.confirmState.isOpen).toBe(true);
    h.state.confirmState.onConfirm(); expect(deleted).toBe('visible');
  });
  it('clears stale user selections on configuration changes and disables submission with no groups', () => {
    const h = createSectionHarness('UserSection.tsx', { userId: 'x', filterUserId: 'x' });
    h.render(props); h.effects.forEach(fn => fn());
    expect(h.state.userId).toBe(''); expect(h.state.filterUserId).toBe('all');
    const html = renderToStaticMarkup(h.render({ ...props, appConfig: { taskAssigneeGroupIds: [] } }));
    expect(html).toContain('Defina os Grupos Associados Tarefas');
    expect(html).not.toContain('label="Águia"');
    expect(html).toContain('disabled=""');
  });
  it('does not filter the independent user directory by task groups', () => {
    const h = createSectionHarness('UserSection.tsx', { subTab: 'users' });
    const html = renderToStaticMarkup(h.render({ ...props, hideUsers: false, hideAbsences: true }));
    expect(html).toContain('Pessoa excluída');
  });
});

describe('Main navigation presentation boundaries', () => {
  it('uses stable font size/weight for both menu branches and only hides Tickets visually', () => {
    const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    expect(source.match(/m3-nav-item w-full flex items-center gap-3 py-3 font-semibold/g)).toHaveLength(2);
    expect(source.match(/cn\("text-body truncate", isCollapsed \? 'md:hidden' : 'block'\)\}\>\{tab.label\}/g)).toHaveLength(2);
    expect(cn('text-body truncate', 'block')).toContain('text-body');
    expect(source).not.toContain('is-active font-bold');
    expect(source).toContain("tab.id !== 'tickets'");
    expect(source).toContain("activeTab === 'tickets'");
    expect(source).toContain("activeTab === 'tickets' && tabs.some(tab => tab.id === 'tickets')");
    expect(source).toContain('appConfig={state.appConfig}');
  });
});
