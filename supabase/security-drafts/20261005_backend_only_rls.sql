-- PROPOSTA: não aplicar antes de concluir docs/rls-cutover.md.
-- Fora de migrations/ deliberadamente. Não elimina dados nem políticas existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Após revisão e testes em staging, inserir aqui, na MESMA transação:
-- SET LOCAL app.rls_cutover_reviewed = 'on';

DO $cutover$
DECLARE
  targets constant text[] := ARRAY[
    'audit_logs','automation_rules','bill_of_materials','clients','comments',
    'default_tasks','equipment','erp_projects','erp_tasks','material',
    'notification_settings','notifications','project_category','project_category_link',
    'project_materials','project_partners','project_partners_link','project_priority',
    'project_priority_link','project_risk','project_risk_items','project_risk_link',
    'project_status','project_teams','project_teams_link','projects','quotes',
    'risk_categories','risk_priorities','risk_statuses','special_days','task_assignees',
    'task_status','task_types','tasks','ticket_statuses','tickets','user_absences',
    'user_groups','users'
  ];
  target text;
  columns_sql text;
  browser_role text;
BEGIN
  IF current_setting('app.rls_cutover_reviewed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cutover não aprovado: concluir docs/rls-cutover.md primeiro';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Roles Supabase ausentes ou service_role sem BYPASSRLS';
  END IF;
  -- Validar todos os alvos antes de iniciar as alterações.
  FOREACH target IN ARRAY targets LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=target AND c.relkind IN ('r','p')) THEN
      RAISE EXCEPTION 'Tabela esperada ausente: public.%', target;
    END IF;
  END LOOP;
  FOREACH target IN ARRAY targets LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
    -- REVOKE de tabela não remove privilégios concedidos diretamente por coluna.
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO columns_sql
    FROM pg_attribute a WHERE a.attrelid=format('public.%I',target)::regclass
      AND a.attnum>0 AND NOT a.attisdropped;
    IF columns_sql IS NOT NULL THEN
      EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        columns_sql, columns_sql, columns_sql, columns_sql, target);
    END IF;
    -- Restritiva: políticas antigas permissivas de tickets não podem sobrepor-se.
    EXECUTE format('DROP POLICY IF EXISTS backend_only_no_direct_api ON public.%I',target);
    EXECUTE format('CREATE POLICY backend_only_no_direct_api ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',target);
    -- Falhar também perante privilégios efetivos herdados de outros roles.
    FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(browser_role,format('public.%I',target),
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_any_column_privilege(browser_role,format('public.%I',target),
          'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Privilégios herdados residuais para % em public.%: rever preflight',browser_role,target;
      END IF;
    END LOOP;
  END LOOP;
END
$cutover$;
COMMIT;
