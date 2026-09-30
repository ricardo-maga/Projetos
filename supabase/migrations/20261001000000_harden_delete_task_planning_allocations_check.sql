-- Migration: 20261001000000_harden_delete_task_planning_allocations_check.sql
-- FASE 70: TASKS <-> PLANNING INTEGRITY HARDENING
-- Invariant: PostgreSQL is the ultimate authority. Tasks cannot be deleted
-- if active (DRAFT or CONFIRMED) planning allocations exist.

CREATE OR REPLACE FUNCTION public.delete_task_atomic(
  p_id UUID,
  p_expected_version INTEGER DEFAULT NULL,
  p_updated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_caller_user_id UUID;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:delete', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;

    -- Resolve caller profile in public.users to preserve FK integrity (tasks.updated_by -> users.id)
    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    -- Non-admin cannot forge updated_by
    IF p_updated_by IS NOT NULL AND p_updated_by <> v_caller_user_id AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_updated_by IS NULL OR p_updated_by = auth.uid() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:delete', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Check current task version for OCC
  SELECT version INTO v_current_version
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Hardening Invariant: Check for active planning allocations (DRAFT or CONFIRMED)
  IF EXISTS (
    SELECT 1
    FROM public.planning_allocations
    WHERE task_id = p_id
      AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION
      'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Soft-delete task and increment version
  UPDATE public.tasks
  SET
    deleted = TRUE,
    version = version + 1,
    updated_at = timezone('utc'::text, now()),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING * INTO v_task_row;

  RETURN to_jsonb(v_task_row);
END;
$function$;

-- 5. Grant execute privileges to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) TO authenticated, service_role;
