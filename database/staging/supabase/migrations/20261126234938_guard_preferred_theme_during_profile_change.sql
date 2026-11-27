-- Administrative profile changes reserve the row across Auth and database calls.
-- A theme write also bumps users.sync_version, so wait for the reservation to clear.
CREATE FUNCTION private.guard_preferred_theme_during_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM private.user_profile_changes WHERE user_id = OLD.id) THEN
    RAISE EXCEPTION 'Existe uma alteração pendente nesta conta. Tente novamente.' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_preferred_theme_during_profile_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_preferred_theme_during_profile_change
  BEFORE UPDATE OF preferred_theme ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.guard_preferred_theme_during_profile_change();
