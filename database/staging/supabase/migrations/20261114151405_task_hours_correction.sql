-- Preserve the previous values for an auditable, reversible data repair.
CREATE SCHEMA IF NOT EXISTS maintenance_task_hours;
REVOKE ALL ON SCHEMA maintenance_task_hours FROM PUBLIC, anon, authenticated;
CREATE TABLE maintenance_task_hours.repair_20261114 (
  task_id uuid PRIMARY KEY,
  old_actual_hours interval,
  new_actual_hours interval,
  estimated_hours interval,
  old_version integer,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON maintenance_task_hours.repair_20261114 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_task_actual_hours()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE completed boolean;
BEGIN
  IF NEW.actual_hours = interval '0' THEN NEW.actual_hours := NULL; END IF;
  SELECT scale = 3 INTO completed FROM public.task_status WHERE id = NEW.status_id;
  IF COALESCE(completed, false) AND NEW.actual_hours IS NULL
     AND NEW.estimated_hours > interval '0' THEN
    NEW.actual_hours := NEW.estimated_hours;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_task_actual_hours
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.normalize_task_actual_hours();

-- The existing RPC uses NULL to mean "no patch". A zero interval is now the
-- explicit clear request; the trigger then fills it only for completed tasks.
DO $$
DECLARE fn record; body text; needle text := 'actual_hours = COALESCE(p_actual_hours, actual_hours)';
BEGIN
  FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_task_atomic'
  LOOP
    body := pg_get_functiondef(fn.oid);
    IF position(needle IN body) > 0 THEN
      EXECUTE replace(body, needle,
        'actual_hours = CASE WHEN p_actual_hours = interval ''0'' THEN NULL ELSE COALESCE(p_actual_hours, actual_hours) END');
    END IF;
  END LOOP;
END;
$$;

INSERT INTO maintenance_task_hours.repair_20261114
  (task_id, old_actual_hours, new_actual_hours, estimated_hours, old_version)
SELECT t.id, t.actual_hours,
  CASE WHEN s.scale = 3 AND t.estimated_hours > interval '0' THEN t.estimated_hours ELSE NULL END,
  t.estimated_hours, t.version
FROM public.tasks t LEFT JOIN public.task_status s ON s.id = t.status_id
WHERE t.deleted IS FALSE AND t.actual_hours = interval '0';

UPDATE public.tasks t SET actual_hours = r.new_actual_hours
FROM maintenance_task_hours.repair_20261114 r WHERE t.id = r.task_id;
