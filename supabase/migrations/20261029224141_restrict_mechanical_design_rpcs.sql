-- Restrict the write RPCs after a staging deployment of the initial migration.
-- The application invokes them only through its authenticated server routes.
REVOKE EXECUTE ON FUNCTION public.create_mechanical_design_request(uuid,uuid,uuid,text,text,text,uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manage_mechanical_design_request(uuid,uuid,integer,text,uuid[],text,text,text,text,numeric,date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_mechanical_design_task(uuid,uuid,integer,text,text,uuid[],numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mechanical_design_task_action(uuid,uuid,uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_mechanical_design_task(uuid,uuid,uuid,integer,uuid[]) FROM PUBLIC, anon, authenticated;
