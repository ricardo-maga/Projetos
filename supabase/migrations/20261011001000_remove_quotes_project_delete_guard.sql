-- The original project-delete RPC predates the retirement of public.quotes.
-- Keep the task and project-material safeguards, but remove the obsolete query.
CREATE OR REPLACE FUNCTION public.delete_project_transaction(
  p_id UUID,
  p_expected_version INT DEFAULT NULL,
  p_updated_by UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INT;
  v_next_version INT;
BEGIN
  SELECT version INTO v_current_version
  FROM public.projects
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', v_current_version, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem tarefas ativas associadas.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_materials
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem materiais associados.'
      USING ERRCODE = 'P0001';
  END IF;

  v_next_version := v_current_version + 1;
  UPDATE public.projects
  SET deleted = TRUE, version = v_next_version, updated_by = p_updated_by, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_id;
  RETURN v_next_version;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_project_transaction(UUID, INT, UUID) TO authenticated, service_role;
