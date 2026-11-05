-- Migration to revoke anon privileges from Phase 18 planning tables that are strictly server-side / API-only.
-- These tables are never accessed directly by the browser or via Global Sync.

-- 1. non_project_work
REVOKE ALL ON TABLE public.non_project_work FROM anon;

-- 2. planning_allocations
REVOKE ALL ON TABLE public.planning_allocations FROM anon;

-- 3. resource_non_project_allocations
REVOKE ALL ON TABLE public.resource_non_project_allocations FROM anon;

-- 4. resource_skills
REVOKE ALL ON TABLE public.resource_skills FROM anon;

-- 5. resource_work_schedules
REVOKE ALL ON TABLE public.resource_work_schedules FROM anon;

-- 6. skills
REVOKE ALL ON TABLE public.skills FROM anon;

-- 7. task_skill_requirements
REVOKE ALL ON TABLE public.task_skill_requirements FROM anon;

-- 8. work_schedule_override_periods
REVOKE ALL ON TABLE public.work_schedule_override_periods FROM anon;

-- 9. work_schedule_overrides
REVOKE ALL ON TABLE public.work_schedule_overrides FROM anon;

-- 10. work_schedule_periods
REVOKE ALL ON TABLE public.work_schedule_periods FROM anon;

-- 11. work_schedules
REVOKE ALL ON TABLE public.work_schedules FROM anon;
