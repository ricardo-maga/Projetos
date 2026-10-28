alter table public.risk_statuses
  add column if not exists scale integer;

-- Preserve a useful numeric value for existing records without changing their order.
update public.risk_statuses
set scale = greatest(1, coalesce(sort_order, 1))
where scale is null;

alter table public.risk_statuses
  alter column scale set default 1,
  alter column scale set not null;
