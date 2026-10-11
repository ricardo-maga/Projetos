-- The application uses server-side routes with the service role for these internal tables.
-- Do not expose their rows or writes through the Supabase Data API.
REVOKE ALL PRIVILEGES ON TABLE
  public.planning_allocations,
  public.work_schedules,
  public.work_schedule_periods,
  public.resource_work_schedules,
  public.work_schedule_overrides,
  public.work_schedule_override_periods,
  public.non_project_work,
  public.resource_non_project_allocations,
  public.skills,
  public.resource_skills,
  public.task_skill_requirements
FROM anon, authenticated, PUBLIC;
