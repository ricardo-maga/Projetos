-- Retire Tickets and their configuration; existing rows are intentionally discarded.
BEGIN;

DELETE FROM public.role_permissions rp USING public.permissions p
WHERE rp.permission_id = p.id AND p.code IN ('tickets:read', 'tickets:write', 'tickets:delete');
DELETE FROM public.permissions WHERE code IN ('tickets:read', 'tickets:write', 'tickets:delete');
DELETE FROM public.notifications WHERE link_url LIKE '%tab=tickets%';

DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.write_legacy_batch(jsonb)'::regprocedure);
  IF (position($needle$'ticket_statuses',$needle$ in definition) = 0)
    <> (position($needle$,'tickets'$needle$ in definition) = 0) THEN
    RAISE EXCEPTION 'Unexpected write_legacy_batch target list; review before retiring Tickets';
  END IF;
  IF position($needle$'ticket_statuses',$needle$ in definition) > 0 THEN
    definition := replace(definition, $needle$'ticket_statuses',$needle$, '');
    definition := replace(definition, $needle$,'tickets'$needle$, '');
    EXECUTE definition;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.write_legacy_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_legacy_batch(jsonb) TO service_role;

DROP TABLE IF EXISTS public.tickets;
DROP TABLE IF EXISTS public.ticket_statuses;
DROP FUNCTION IF EXISTS public.reserve_ticket_number();
DROP FUNCTION IF EXISTS public.generate_ticket_number();
DROP FUNCTION IF EXISTS public.update_ticket_timestamp();
DROP SEQUENCE IF EXISTS public.ticket_number_seq;

COMMIT;
