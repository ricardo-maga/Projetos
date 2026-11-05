DO $$
DECLARE definition text; old_fragment text;
BEGIN
  SELECT pg_get_functiondef('notification_internal.generate_presales_due(date)'::regprocedure) INTO definition;
  old_fragment:='WHERE w.kind = ''presales'' AND w.status IN';
  IF position(old_fragment IN definition)=0 THEN
    old_fragment:='WHERE w.kind=''presales'' AND w.status IN';
  END IF;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Presales reminder definition changed.'; END IF;
  EXECUTE replace(definition,old_fragment,replace(old_fragment,'WHERE ','WHERE w.deleted_at IS NULL AND '));

  SELECT pg_get_functiondef('notification_internal.generate_mechanical_design_due(date)'::regprocedure) INTO definition;
  old_fragment:='WHERE w.kind = ''mechanical_design'' AND w.status IN';
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Design reminder definition changed.'; END IF;
  EXECUTE replace(definition,old_fragment,replace(old_fragment,'WHERE ','WHERE w.deleted_at IS NULL AND '));
END $$;
