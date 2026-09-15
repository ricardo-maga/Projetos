-- Migration 004: Hardening Row Level Security (RLS)
-- Disallow public access (USING true) and require authenticated context

-- 1. Helper function to check if current authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND is_admin = true
          AND approved = true
          AND deleted = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to check if current user is approved
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND approved = true
          AND deleted = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Hardening USERS table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full access to auth users on users" ON public.users;
DROP POLICY IF EXISTS "Permitir leitura pública de utilizadores" ON public.users;

CREATE POLICY "Authenticated users can view active team members"
ON public.users FOR SELECT
TO authenticated
USING (public.is_approved());

CREATE POLICY "Users can update their own profile"
ON public.users FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid() OR id = auth.uid())
WITH CHECK (auth_user_id = auth.uid() OR id = auth.uid());

CREATE POLICY "Administrators full management on users"
ON public.users FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Hardening PROJECTS table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full access to auth users on projects" ON public.projects;

CREATE POLICY "Approved users can view projects"
ON public.projects FOR SELECT
TO authenticated
USING (public.is_approved() AND deleted = false);

CREATE POLICY "Approved users can insert projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (public.is_approved());

CREATE POLICY "Approved users can update projects"
ON public.projects FOR UPDATE
TO authenticated
USING (public.is_approved())
WITH CHECK (public.is_approved());

CREATE POLICY "Admins can delete projects"
ON public.projects FOR DELETE
TO authenticated
USING (public.is_admin());

-- 5. Hardening TASKS table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full access to auth users on tasks" ON public.tasks;

CREATE POLICY "Approved users can view tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (public.is_approved() AND deleted = false);

CREATE POLICY "Approved users can insert and update tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (public.is_approved());

CREATE POLICY "Approved users can update tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (public.is_approved())
WITH CHECK (public.is_approved());

CREATE POLICY "Admins can delete tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (public.is_admin());

-- 6. Hardening CLIENTS table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full access to auth users on clients" ON public.clients;

CREATE POLICY "Approved users can view clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_approved() AND deleted = false);

CREATE POLICY "Approved users can manage clients"
ON public.clients FOR ALL
TO authenticated
USING (public.is_approved())
WITH CHECK (public.is_approved());

-- 7. Revoke public access to snapshots
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_erp_snapshots') THEN
        DROP POLICY IF EXISTS "Permitir leitura pública de snapshots" ON portal_erp_snapshots;
        DROP POLICY IF EXISTS "Permitir inserção pública de snapshots" ON portal_erp_snapshots;
        DROP POLICY IF EXISTS "Permitir atualização pública de snapshots" ON portal_erp_snapshots;
        DROP POLICY IF EXISTS "Permitir eliminação pública de snapshots" ON portal_erp_snapshots;
    END IF;
END $$;
