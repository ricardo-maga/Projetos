import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';

describe('User list group filter', () => {
  it('filters role assignments, keeps custom groups distinct and excludes deleted users', () => {
    const h = createSectionHarness('UserSection.tsx', {
      rbacRoles: [
        { id: CANONICAL_ROLE_IDS.TECHNICIAN, name: 'Técnico', code: 'technician' },
        { id: CANONICAL_ROLE_IDS.COMMERCIAL, name: 'Comercial', code: 'commercial' },
        { id: 'custom-a', name: 'Personalizado A', code: 'custom_a' },
        { id: 'custom-b', name: 'Personalizado B', code: 'custom_b' },
      ],
      rbacUserRoles: [
        { user_id: 'one', role_id: CANONICAL_ROLE_IDS.TECHNICIAN },
        { user_id: 'two', role_id: CANONICAL_ROLE_IDS.TECHNICIAN },
        { user_id: 'three', role_id: CANONICAL_ROLE_IDS.COMMERCIAL },
        { user_id: 'four', role_id: 'custom-a' },
        { user_id: 'five', role_id: 'custom-b' },
        { user_id: 'seven', role_id: CANONICAL_ROLE_IDS.TECHNICIAN },
      ],
    });
    const props: any = {
      hideAbsences: true, absences: [], currentUser: { roleId: 'ug-1', permissions: ['users.read'] },
      userGroups: [{ id: CANONICAL_ROLE_IDS.TECHNICIAN, name: 'Técnico' }, { id: 'custom-a', name: 'Personalizado A' }, { id: 'custom-b', name: 'Personalizado B' }],
      users: [
        { id: 'one', name: 'Pessoa canónica', roleId: CANONICAL_ROLE_IDS.TECHNICIAN },
        { id: 'two', name: 'Pessoa antiga', roleId: 'ug-3' },
        { id: 'three', name: 'Pessoa comercial', roleId: CANONICAL_ROLE_IDS.COMMERCIAL },
        { id: 'four', name: 'Pessoa personalizada', roleId: 'custom-a' },
        { id: 'five', name: 'Pessoa outro grupo', roleId: 'custom-b' },
        { id: 'six', name: 'Pessoa sem grupo' },
        { id: 'seven', name: 'Pessoa eliminada', roleId: 'ug-3', deleted: true },
      ], addAbsence() {}, deleteAbsence() {}, addUser() {}, updateUser() {}, deleteUser() {},
    };
    let tree = h.render(props);
    const change = (value: string) => {
      find(tree, e => e.type === 'select' && e.props.value === h.state.filterRoleId).props.onChange({ target: { value } });
      tree = h.render(props);
      return renderToStaticMarkup(tree);
    };
    let html = change(CANONICAL_ROLE_IDS.TECHNICIAN);
    expect(html).toContain('Pessoa canónica'); expect(html).toContain('Pessoa antiga');
    expect(html).not.toContain('Pessoa comercial'); expect(html).not.toContain('Pessoa eliminada');
    html = change('custom-a');
    expect(html).toContain('Pessoa personalizada'); expect(html).not.toContain('Pessoa outro grupo');
    expect(html).not.toContain('Pessoa sem grupo'); expect(html).not.toContain('Pessoa antiga');
    html = change('all');
    expect(html).toContain('Pessoa comercial'); expect(html).toContain('Pessoa outro grupo');
    expect(html).not.toContain('Pessoa eliminada');
  });
});
