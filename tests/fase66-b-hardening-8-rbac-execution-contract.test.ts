import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  CANONICAL_ROLE_IDS, 
  DEFAULT_PERMISSIONS, 
  getGroupPermissions, 
  normalizeRoleId 
} from '@/lib/permissions';

describe('FASE 66-B-HARDENING-8 — RBAC Execution Contract Hardening', () => {
  const migrationPath = join(
    process.cwd(), 
    'supabase/migrations/20260929010000_rbac_execution_contract_hardening.sql'
  );

  // =========================================================================
  // GRUPO A & B: Contrato da RPC has_permission(text, uuid) (Static & Contract)
  // =========================================================================
  describe('A & B. Contrato de Identidade: authenticated vs service_role', () => {
    it('migration existe e contém search_path=public e SECURITY DEFINER', () => {
      expect(existsSync(migrationPath)).toBe(true);
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public');
    });

    it('em sessão authenticated, auth.uid() é estritamente primário e p_user_id é ignorado', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain("IF auth.role() = 'authenticated' THEN");
      expect(sql).toContain('v_auth_uid := auth.uid();');
      expect(sql).toContain('ELSE');
      expect(sql).toContain('v_auth_uid := p_user_id;');
    });

    it('service_role sem p_user_id resulta obrigatoriamente em FAIL CLOSED (FALSE)', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('IF v_auth_uid IS NULL THEN');
      expect(sql).toContain('RETURN FALSE;');
      // Garante que não existe nenhum bypass genérico do género IF auth.role() = 'service_role' THEN RETURN TRUE
      expect(sql).not.toContain("IF auth.role() = 'service_role' THEN RETURN TRUE;");
    });

    it('utilizador eliminado (deleted=true) ou não aprovado (approved=false) devolve FALSE', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('(v_profile.approved IS NOT TRUE)');
      expect(sql).toContain('(v_profile.deleted IS TRUE)');
      expect(sql).toContain('(v_profile.role_id IS NULL)');
    });
  });

  // =========================================================================
  // GRUPO C: Matriz de Autorização Funcional vs Privilégios Administrativos
  // =========================================================================
  describe('C. Autorização: role_permissions é a única fonte funcional', () => {
    it('is_admin concede apenas permissões administrativas explícitas', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('IF (v_profile.is_admin IS TRUE) AND (');
      expect(sql).toContain("'admin:access'");
      expect(sql).toContain("'config:manage'");
      // Garante que is_admin não concede tasks:write ou projects:write automaticamente
      expect(sql).not.toContain("p_permission_code IN ('tasks:write'");
      expect(sql).not.toContain("p_permission_code IN ('projects:write'");
    });

    it('permissões funcionais vêm estritamente da junção role_permissions -> permissions', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('FROM public.role_permissions rp');
      expect(sql).toContain('JOIN public.permissions p ON p.id = rp.permission_id');
      expect(sql).toContain('WHERE rp.role_id = v_profile.role_id');
    });

    it('na matriz canónica, Viewer não possui tasks_write nem projects_write', () => {
      const viewerPerms = DEFAULT_PERMISSIONS[CANONICAL_ROLE_IDS.VIEWER];
      expect(viewerPerms.tasks_write).toBe(false);
      expect(viewerPerms.projects_write).toBe(false);
      expect(viewerPerms.tasks_delete).toBe(false);
      expect(viewerPerms.projects_delete).toBe(false);
    });

    it('na matriz canónica, Project Manager possui projects_write e tasks_write', () => {
      const pmPerms = DEFAULT_PERMISSIONS[CANONICAL_ROLE_IDS.PROJECT_MANAGER];
      expect(pmPerms.projects_write).toBe(true);
      expect(pmPerms.tasks_write).toBe(true);
    });
  });

  // =========================================================================
  // GRUPO D: Privilégios de Execução (EXECUTE Privileges)
  // =========================================================================
  describe('D. Privilégios de Execução: REVOKE PUBLIC/anon e GRANT authenticated/service_role', () => {
    it('migration revoga EXECUTE de PUBLIC para public.has_permission(text, uuid)', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) FROM PUBLIC;');
    });

    it('migration revoga EXECUTE de anon para public.has_permission(text, uuid)', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) FROM anon;');
    });

    it('migration concede EXECUTE a authenticated e service_role', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated, service_role;');
    });

    it('migration revoga todos os privilégios de escrita nas tabelas roles, permissions e role_permissions', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.roles FROM PUBLIC, anon, authenticated;');
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.permissions FROM PUBLIC, anon, authenticated;');
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.role_permissions FROM PUBLIC, anon, authenticated;');
    });

    it('migration concede apenas SELECT nas tabelas roles, permissions e role_permissions a authenticated e service_role', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('GRANT SELECT ON TABLE public.roles TO authenticated, service_role;');
      expect(sql).toContain('GRANT SELECT ON TABLE public.permissions TO authenticated, service_role;');
      expect(sql).toContain('GRANT SELECT ON TABLE public.role_permissions TO authenticated, service_role;');
    });
  });

  // =========================================================================
  // GRUPO E: Auditoria de requireAuth() e requirePermission()
  // =========================================================================
  describe('E. Auditoria de Segurança em requireAuth() e requirePermission()', () => {
    const requireAuthPath = join(process.cwd(), 'lib/auth/requireAuth.ts');
    const authWrapperPath = join(process.cwd(), 'lib/auth/authorization.ts');

    it('requireAuth() autentica primeiro e valida o perfil na base de dados', () => {
      const content = readFileSync(requireAuthPath, 'utf-8');
      expect(content).toContain('supabase.auth.getUser(');
      expect(content).toContain('profile.deleted');
      expect(content).toContain('profile.approved');
    });

    it('requirePermission() nunca confia num user_id vindo de input de cliente', () => {
      const content = readFileSync(requireAuthPath, 'utf-8');
      // O utilizador vem estritamente de requireAuth()
      expect(content).toContain('const user = await requireAuth(');
      expect(content).toContain('p_user_id: user.id');
    });

    it('requirePermission() invoca a RPC PostgreSQL has_permission com o admin client', () => {
      const content = readFileSync(requireAuthPath, 'utf-8');
      expect(content).toContain("await admin.rpc('has_permission', {");
      expect(content).toContain('p_permission_code: code');
      expect(content).toContain('p_user_id: user.id');
    });

    it('erros de infraestrutura ou autorização falham fechados (ForbiddenError / AuthError)', () => {
      const content = readFileSync(requireAuthPath, 'utf-8');
      expect(content).toContain('if (hasPerm !== true)');
      expect(content).toContain('throw new ForbiddenError');
      expect(content).toContain('if (error)');
      expect(content).toContain('throw new AuthError');
    });

    it('requireAdmin() em authorization.ts utiliza roles canónicas sem referenciar UUIDs legados', () => {
      const content = readFileSync(authWrapperPath, 'utf-8');
      expect(content).toContain('normalizeRoleId(centralUser.role_id)');
      expect(content).toContain('CANONICAL_ROLE_IDS.SUPER_ADMIN');
      expect(content).not.toContain("'00000000-0000-0000-0000-000000000001'");
    });
  });
});
