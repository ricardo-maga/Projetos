CREATE INDEX work_requests_presales_recent_idx ON public.work_requests(created_at DESC,id)
WHERE kind='presales';
CREATE INDEX presales_details_commercial_manager_idx ON public.presales_details(commercial_manager_id)
WHERE commercial_manager_id IS NOT NULL;
CREATE INDEX presales_details_project_manager_idx ON public.presales_details(project_manager_id)
WHERE project_manager_id IS NOT NULL;
CREATE INDEX presales_assets_uploaded_by_idx ON public.presales_assets(uploaded_by);
CREATE INDEX presales_revisions_published_by_idx ON public.presales_document_revisions(published_by);
