-- Existing manager roles lack these grants in production, so named owners could
-- not see or act on their requests. Preserve individually configured grants.
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active AND p.is_active AND r.code IN ('PROJECT_MANAGER','SOLUTIONS')
  AND p.code IN ('mechanical_design.read','mechanical_design.create','mechanical_design.manage','mechanical_design.execute',
    'presales.read','presales.create','presales.manage','presales.execute')
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ DECLARE row_record record;
BEGIN
 FOR row_record IN SELECT w.id,w.kind,w.area_owner_id,wt.task_id FROM public.work_requests w
   JOIN public.work_request_tasks wt ON wt.request_id=w.id AND wt.is_initial
   WHERE w.kind IN ('presales','mechanical_design') AND w.status='accepted' AND w.deleted_at IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.task_assignees ta WHERE ta.task_id=wt.task_id)
 LOOP
   IF public.has_permission(row_record.kind || '.execute',row_record.area_owner_id) THEN
     IF row_record.kind='presales' THEN PERFORM set_config('app.presales_write','on',true);
     ELSE PERFORM set_config('app.mechanical_design_write','on',true); END IF;
     INSERT INTO public.task_assignees(task_id,user_id) VALUES(row_record.task_id,row_record.area_owner_id)
       ON CONFLICT DO NOTHING;
   END IF;
 END LOOP;
END $$;

;
