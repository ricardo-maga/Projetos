CREATE OR REPLACE FUNCTION public.delete_project_transaction(p_id uuid,p_expected_version integer DEFAULT NULL,p_updated_by uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_current_version integer; v_next_version integer;
BEGIN
 SELECT version INTO v_current_version FROM public.projects WHERE id=p_id AND deleted IS NOT TRUE FOR UPDATE;
 IF v_current_version IS NULL THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_expected_version IS NOT NULL AND v_current_version<>p_expected_version THEN
  RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %',v_current_version,p_expected_version USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.tasks WHERE project_id=p_id AND deleted IS NOT TRUE) THEN
  RAISE EXCEPTION 'NÃ£o Ã© possÃ­vel eliminar o projeto porque existem tarefas ativas associadas.' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.project_materials WHERE project_id=p_id AND deleted IS NOT TRUE) THEN
  RAISE EXCEPTION 'NÃ£o Ã© possÃ­vel eliminar o projeto porque existem materiais associados.' USING ERRCODE='P0001';
 END IF;
 v_next_version:=v_current_version+1;
 UPDATE public.projects SET deleted=true,version=v_next_version,updated_by=p_updated_by,updated_at=CURRENT_TIMESTAMP WHERE id=p_id;
 RETURN v_next_version;
END; $$;
