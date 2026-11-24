-- Atomically reorder one reference collection. Called only by the server with
-- the service role after config:write authorization and input validation.
create or replace function public.reorder_reference_records(p_table text, p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  change jsonb;
  saved jsonb;
  result jsonb := '[]'::jsonb;
  active_count bigint;
begin
  if p_table is null or p_table <> all(array[
    'project_category', 'project_status', 'project_risk', 'project_priority',
    'project_teams', 'project_partners', 'task_status', 'task_types',
    'risk_categories', 'risk_statuses', 'risk_priorities'
  ]) then
    raise exception 'Invalid reference table' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 100
    or jsonb_array_length(p_changes) = 0 then
    raise exception 'Invalid reorder request' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_changes) item
    group by item->>'id' having count(*) > 1
  ) then
    raise exception 'Duplicate reference id' using errcode = '22023';
  end if;
  execute format('select count(*) from public.%I where deleted = false', p_table) into active_count;
  if active_count <> jsonb_array_length(p_changes) then
    raise exception 'Incomplete reference collection' using errcode = 'PT409';
  end if;
  for change in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    if change->>'id' is null or change->>'syncVersion' is null or change->>'sortOrder' is null then
      raise exception 'Invalid reference row' using errcode = '22023';
    end if;
    execute format(
      'update public.%I as target set sort_order = $1 where target.id = $2 and target.sync_version = $3 and target.deleted = false returning to_jsonb(target)',
      p_table
    ) into saved using (change->>'sortOrder')::int, (change->>'id')::uuid, (change->>'syncVersion')::bigint;
    if saved is null then
      raise exception 'Concurrent reference modification' using errcode = 'PT409';
    end if;
    result := result || jsonb_build_array(saved);
  end loop;
  return result;
end;
$$;
revoke all on function public.reorder_reference_records(text, jsonb) from public, anon, authenticated;
grant execute on function public.reorder_reference_records(text, jsonb) to service_role;
