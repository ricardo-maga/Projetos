-- Task-level priority and reports access.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority_id UUID REFERENCES public.project_priority(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority_id ON public.tasks(priority_id) WHERE deleted IS NOT TRUE;

-- Keep the existing atomic task contract intact and add an overload that accepts priority.
-- The wrapper runs in the same transaction as the canonical RPC and validates the active lookup value.
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_id UUID, p_project_id UUID, p_task_title TEXT, p_status_id TEXT,
  p_task_type_id TEXT, p_estimated_hours INTERVAL, p_actual_hours INTERVAL, p_start_date DATE, p_start_time TIME,
  p_end_date DATE, p_end_time TIME, p_estimated_date DATE, p_completed_date DATE, p_task_description TEXT, p_notes TEXT,
  p_is_milestone BOOLEAN, p_created_by UUID, p_assignee_user_ids UUID[], p_priority_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_task JSONB;
BEGIN
  IF p_priority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;
  v_task := public.create_task_atomic(p_id, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_created_by, p_assignee_user_ids);
  UPDATE public.tasks SET priority_id = p_priority_id WHERE id = p_id;
  SELECT to_jsonb(tasks) INTO v_task FROM public.tasks WHERE id = p_id;
  RETURN v_task;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_task_atomic(
  p_id UUID, p_expected_version INTEGER, p_project_id UUID, p_task_title TEXT,
  p_status_id TEXT, p_task_type_id TEXT, p_estimated_hours INTERVAL, p_actual_hours INTERVAL,
  p_start_date DATE, p_start_time TIME, p_end_date DATE, p_end_time TIME, p_estimated_date DATE,
  p_completed_date DATE, p_task_description TEXT, p_notes TEXT, p_is_milestone BOOLEAN, p_updated_by UUID,
  p_assignee_user_ids UUID[], p_update_assignees BOOLEAN, p_update_project_id BOOLEAN, p_update_dates BOOLEAN,
  p_priority_id UUID, p_update_priority BOOLEAN
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_task JSONB;
BEGIN
  IF p_update_priority AND p_priority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;
  v_task := public.update_task_atomic(p_id, p_expected_version, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_updated_by, p_assignee_user_ids, p_update_assignees, p_update_project_id, p_update_dates);
  IF p_update_priority THEN UPDATE public.tasks SET priority_id = p_priority_id WHERE id = p_id; END IF;
  SELECT to_jsonb(tasks) INTO v_task FROM public.tasks WHERE id = p_id;
  RETURN v_task;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN, UUID, BOOLEAN) TO authenticated, service_role;

INSERT INTO public.permissions (code, module, description)
VALUES ('reports:read', 'reports', 'Visualizar relatórios') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id FROM public.roles role CROSS JOIN public.permissions permission
WHERE role.code IN ('SUPER_ADMIN', 'ADMIN') AND permission.code = 'reports:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

