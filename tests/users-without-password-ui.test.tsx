import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';

const person = { id: 'profile-only', name: 'Pessoa de teste', email: 'person@example.invalid', type: 'Team' };
const alerts: Array<{ mockRestore(): void }> = [];
afterEach(() => alerts.splice(0).forEach(spy => spy.mockRestore()));

function form(editing = false, password = '', confirmation = '') {
  const h = createSectionHarness('../domains/administration/ui/UserSection.tsx', {
    isAddingUser: !editing, editingUser: editing ? person : null,
    uName: person.name, uEmail: person.email, uPassword: password, uPasswordConfirm: confirmation,
  });
  const props = { users: [person], userGroups: [], currentUser: { roleId: '10000000-0000-0000-0000-000000000004', permissions: ['users.read', 'users.write'] },
    addUser: mock(async () => 'new-profile'), updateUser: mock(async () => true), deleteUser: mock(async () => ({ success: true })) };
  return { h, props, tree: h.render(props) };
}

it('submits a new user with both password fields empty', async () => {
  const { props, tree } = form();
  const field = find(tree, e => e.props.id === 'admin-user-password');
  expect(field.props.required).toBeUndefined();
  expect(field.props['aria-describedby']).toBe('admin-user-password-help');
  expect(find(tree, e => e.props.id === 'admin-user-password-confirm').props.required).toBe(false);
  await find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  expect(props.addUser).toHaveBeenCalledWith({ name: person.name, email: person.email, type: person.type, password: undefined });
});

it('edits an unlinked user without a password', async () => {
  const { props, tree } = form(true);
  expect(find(tree, e => e.props.id === 'admin-user-password').props.required).toBeUndefined();
  await find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  expect(props.updateUser).toHaveBeenCalledWith(person.id, { name: person.name, email: person.email, type: person.type });
});

it('requires confirmation and submits a password for later activation', async () => {
  const password = 'Synthetic-test-password-123!';
  const { props, tree } = form(true, password, password);
  expect(find(tree, e => e.props.id === 'admin-user-password-confirm').props.required).toBe(true);
  await find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  expect(props.updateUser).toHaveBeenCalledWith(person.id, { name: person.name, email: person.email, type: person.type, password });
});

for (const editing of [false, true]) {
  it(`rejects a confirmation entered without a password during ${editing ? 'editing' : 'creation'}`, async () => {
    if (!('alert' in globalThis)) (globalThis as any).alert = () => {};
    const alert = spyOn(globalThis, 'alert').mockImplementation(() => {});
    alerts.push(alert);
    const { props, tree } = form(editing, '', 'Synthetic-test-password-123!');
    await find(tree, e => e.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(alert).toHaveBeenCalledWith('As passwords introduzidas não coincidem.');
    expect(props.addUser).not.toHaveBeenCalled();
    expect(props.updateUser).not.toHaveBeenCalled();
  });
}
