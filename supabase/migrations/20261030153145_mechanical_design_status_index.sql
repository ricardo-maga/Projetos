CREATE INDEX mechanical_design_details_project_status_idx
  ON public.mechanical_design_details(project_status_id)
  WHERE project_status_id IS NOT NULL;
