import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  CANONICAL_ROLE_IDS, 
  ROLE_UUID_MAP, 
  hasPermission, 
  normalizeRoleId 
} from '@/lib/permissions';

describe('FASE 66-B-HARDENING-7 — Canonical RBAC Migration & Cutover Verification', () => {

  // 1. Viewer não pode tasks:write
  it('1. Viewer não tem permissão para tasks_write', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.VIEWER, permissions: [] }, 'tasks_write')).toBe(false);
  });

  // 2. Viewer não pode projects:write
  it('2. Viewer não tem permissão para projects_write', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.VIEWER, permissions: [] }, 'projects_write')).toBe(false);
  });

  // 3. Viewer + is_admin pode admin:access
  it('3. Viewer com is_admin = true tem acesso a admin:access na UI', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.VIEWER, isAdmin: true, permissions: [] }, 'config_read')).toBe(true);
  });

  // 4. Viewer + is_admin pode config:manage
  it('4. Viewer com is_admin = true pode gerir configurações administrativas em frontend helper', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.VIEWER, isAdmin: true, permissions: [] }, 'config_write')).toBe(true);
  });

  // 5. Viewer + is_admin NÃO pode tasks:write (limite de role funcional mantido)
  it('5. Viewer mesmo com is_admin = true não obtém permissão funcional tasks_write na matriz da role', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.VIEWER, isAdmin: true, permissions: [] }, 'tasks_write')).toBe(false);
  });

  // 6. Project Manager pode projects:write
  it('6. Project Manager pode realizar projects_write', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.PROJECT_MANAGER, permissions: ['projects.write'] }, 'projects_write')).toBe(true);
  });

  // 7. Project Manager + is_admin pode admin:access
  it('7. Project Manager com is_admin = true tem permissão de admin', () => {
    expect(hasPermission({ roleId: CANONICAL_ROLE_IDS.PROJECT_MANAGER, isAdmin: true, permissions: [] }, 'config_write')).toBe(true);
  });

  // 8. Deleted user não tem qualquer permissão
  it('8. Utilizador eliminado (deleted = true) deve falhar hasPermission', () => {
    expect(hasPermission(null, 'projects_read')).toBe(false);
    expect(hasPermission(undefined, 'projects_read')).toBe(false);
  });

  // 9. Unapproved user não tem qualquer permissão
  it('9. Utilizador sem role_id não possui permissões por fallback', () => {
    expect(hasPermission({ roleId: '', isAdmin: false }, 'projects_read')).toBe(false);
    expect(hasPermission({ roleId: '', isAdmin: true, permissions: [] }, 'config_write')).toBe(false);
  });

  // 10. Anonymous / Unauthenticated não tem permissões
  it('10. Contexto anónimo ou indefinido devolve false', () => {
    expect(hasPermission('', 'projects_read')).toBe(false);
    expect(hasPermission(null, 'tasks_read')).toBe(false);
  });

  // 11. service_role sem utilizador não obtém bypass genérico na migration RPC
  it('11. Migration RPC has_permission() recusa service_role sem auth.uid() e sem utilizador válido', () => {
    const sqlPath = join(process.cwd(), 'supabase/migrations/20260928040000_normalize_users_role_id_canonical_rbac.sql');
    const content = readFileSync(sqlPath, 'utf-8');
    expect(content).toContain('IF v_auth_uid IS NULL THEN');
    expect(content).toContain('RETURN FALSE;');
    expect(content).not.toContain('IF auth.role() = \'service_role\' THEN RETURN TRUE;');
  });

  // 12. p_user_id fornecido por authenticated não permite impersonation
  it('12. Migration RPC força auth.uid() quando auth.role() = authenticated ignorando p_user_id do cliente', () => {
    const sqlPath = join(process.cwd(), 'supabase/migrations/20260928040000_normalize_users_role_id_canonical_rbac.sql');
    const content = readFileSync(sqlPath, 'utf-8');
    expect(content).toContain("IF auth.role() = 'authenticated' THEN");
    expect(content).toContain('v_auth_uid := auth.uid();');
  });

  // 13. UUID legacy é normalizado / convertido para UUID canónico pelo sync
  it('13. normalizeRoleId normaliza aliases legados ug-1..ug-4 e UUIDs legados para a série canónica 10000000', () => {
    expect(normalizeRoleId('ug-1')).toBe(CANONICAL_ROLE_IDS.SUPER_ADMIN);
    expect(normalizeRoleId('ug-2')).toBe(CANONICAL_ROLE_IDS.PROJECT_MANAGER);
    expect(normalizeRoleId('ug-3')).toBe(CANONICAL_ROLE_IDS.TECHNICIAN);
    expect(normalizeRoleId('ug-4')).toBe(CANONICAL_ROLE_IDS.VIEWER);

    expect(normalizeRoleId('00000000-0000-0000-0000-000000000001')).toBe(CANONICAL_ROLE_IDS.SUPER_ADMIN);
    expect(normalizeRoleId('00000000-0000-0000-0000-000000000002')).toBe(CANONICAL_ROLE_IDS.PROJECT_MANAGER);
    expect(normalizeRoleId('00000000-0000-0000-0000-000000000003')).toBe(CANONICAL_ROLE_IDS.TECHNICIAN);
    expect(normalizeRoleId('52616954-8b59-4459-a00b-963f1b29a91c')).toBe(CANONICAL_ROLE_IDS.COMMERCIAL);
    expect(normalizeRoleId('a158a7b3-88ce-46d1-a779-cd6d73363d3c')).toBe(CANONICAL_ROLE_IDS.SOLUTIONS);
    expect(normalizeRoleId('9de391f6-46fa-45f6-b32d-25c11e1dd533')).toBe(CANONICAL_ROLE_IDS.VIEWER);
  });

  // 14. UUID canónico é aceite diretamente
  it('14. normalizeRoleId aceita diretamente UUIDs da série canónica 10000000', () => {
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.SUPER_ADMIN)).toBe(CANONICAL_ROLE_IDS.SUPER_ADMIN);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.ADMIN)).toBe(CANONICAL_ROLE_IDS.ADMIN);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.PROJECT_MANAGER)).toBe(CANONICAL_ROLE_IDS.PROJECT_MANAGER);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.TECHNICIAN)).toBe(CANONICAL_ROLE_IDS.TECHNICIAN);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.COMMERCIAL)).toBe(CANONICAL_ROLE_IDS.COMMERCIAL);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.SOLUTIONS)).toBe(CANONICAL_ROLE_IDS.SOLUTIONS);
    expect(normalizeRoleId(CANONICAL_ROLE_IDS.VIEWER)).toBe(CANONICAL_ROLE_IDS.VIEWER);
  });

  // 15. register/route.ts usa role canónica
  it('15. app/api/auth/register/route.ts escreve o UUID canónico TECHNICIAN (10000000-0000-0000-0000-000000000004)', () => {
    const filePath = join(process.cwd(), 'app/api/auth/register/route.ts');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain("role_id: '10000000-0000-0000-0000-000000000004'");
    expect(content).not.toContain("role_id: '00000000-0000-0000-0000-000000000004'");
  });

  // 16. bootstrap/route.ts usa role canónica
  it('16. app/api/auth/bootstrap/route.ts escreve o UUID canónico SUPER_ADMIN (10000000-0000-0000-0000-000000000001)', () => {
    const filePath = join(process.cwd(), 'app/api/auth/bootstrap/route.ts');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain("role_id: '10000000-0000-0000-0000-000000000001'");
    expect(content).not.toContain("role_id: '00000000-0000-0000-0000-000000000001'");
  });

  // 17. UserSection.tsx usa apenas roles ativas carregadas da fonte autoritativa
  it('17. components/UserSection.tsx utiliza roles ativas da API para a atribuição de permissões', () => {
    const filePath = join(process.cwd(), 'components/UserSection.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('activeRoles');
    expect(content).toContain("fetch('/api/rbac/catalog'");
    expect(content).not.toContain('CANONICAL_ROLES_LIST');
  });

  // 18. Static audit check: lib/supabaseSync.ts normaliza roles antes de upsert em users
  it('18. lib/supabaseSync.ts aplica normalizeRoleId nos objetos de utilizadores enviados para o Supabase', () => {
    const filePath = join(process.cwd(), 'lib/supabaseSync.ts');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('role_id: normalizeRoleId(u.roleId)');
    expect(content).toContain("'ug-1': '10000000-0000-0000-0000-000000000001'");
  });

  it('19. migration alinha is_admin com os aliases usados pela API sem conceder permissões funcionais', () => {
    const migration = readFileSync(join(
      process.cwd(),
      'supabase/migrations/20261019222030_align_is_admin_permission_aliases.sql',
    ), 'utf-8');
    expect(migration).toContain("'admin.access', 'config.manage', 'config.read', 'config.write'");
    expect(migration).toContain('v_auth_uid := auth.uid();');
    expect(migration).toContain('IF v_auth_uid IS NULL THEN');
    expect(migration).not.toContain('auth.role()');
    expect(migration).toContain('FROM public.user_roles ur');
    expect(migration).not.toContain("'tasks.write'");
    expect(migration).not.toContain("'projects.write'");
  });
});
