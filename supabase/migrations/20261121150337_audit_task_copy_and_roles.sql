BEGIN;

CREATE FUNCTION application_audit.normalize_application_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  headers jsonb := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  source_task uuid;
  role_details jsonb;
BEGIN
  IF COALESCE(claims->>'role', '') <> 'service_role'
     OR NULLIF(headers->>'x-projetos-audit-operation', '') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'task.created' AND NEW.source = 'application'
      AND NEW.request_id = headers->>'x-projetos-audit-operation' THEN
    source_task := NULLIF(headers->>'x-projetos-audit-task-source', '')::uuid;
    IF source_task IS NOT NULL THEN
      NEW.action := 'task.copied';
      NEW.changes := COALESCE(NEW.changes, '{}'::jsonb) ||
        jsonb_build_object('source_task_id', jsonb_build_object('after', source_task));
    END IF;
  ELSIF NEW.action = 'SETTINGS' AND NEW.entity_name IN
      ('role.created', 'role.updated', 'role.disabled', 'role.permissions.updated', 'user.roles.updated') THEN
    role_details := COALESCE(NEW.details::jsonb, '{}'::jsonb);
    NEW.action := 'rbac.' || replace(NEW.entity_name, '.', '_');
    NEW.entity_type := 'rbac';
    NEW.audit_version := 1;
    NEW.source := 'application';
    NEW.outcome := 'succeeded';
    NEW.actor_id := NEW.user_id;
    NEW.request_id := headers->>'x-projetos-audit-operation';
    NEW.changes := jsonb_build_object(
      'permissions', jsonb_build_object('after', role_details->'permissionIds'),
      'roles', jsonb_build_object('after', role_details->'roleIds'));
    NEW.changes := COALESCE((
      SELECT jsonb_object_agg(field, value)
      FROM jsonb_each(NEW.changes) d(field, value)
      WHERE value->'after' <> 'null'::jsonb
    ), '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION application_audit.normalize_application_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER normalize_application_event BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION application_audit.normalize_application_event();

COMMIT;
