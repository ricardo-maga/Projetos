-- Migration: 20260918000000_create_planning_tables.sql

SET search_path TO public;

-- Ensure helper functions exist for RLS policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND is_admin = true
          AND approved = true
          AND deleted = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND approved = true
          AND deleted = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Modify user_absences
ALTER TABLE user_absences ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE user_absences ADD COLUMN IF NOT EXISTS is_full_day BOOLEAN DEFAULT TRUE;
ALTER TABLE user_absences ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE user_absences ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE user_absences ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. Work Schedules
CREATE TABLE work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

CREATE TABLE work_schedule_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES work_schedules(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resource_work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES users(id),
    schedule_id UUID NOT NULL REFERENCES work_schedules(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    UNIQUE(resource_id)
);

-- 3. Overrides
CREATE TABLE work_schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    is_working_day BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

CREATE TABLE work_schedule_override_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    override_id UUID NOT NULL REFERENCES work_schedule_overrides(id),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Non-Project Work
CREATE TABLE non_project_work (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

CREATE TABLE resource_non_project_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES users(id),
    work_id UUID NOT NULL REFERENCES non_project_work(id),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- 5. Skills
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

CREATE TABLE resource_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES users(id),
    skill_id UUID NOT NULL REFERENCES skills(id),
    proficiency_level INTEGER NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    UNIQUE(resource_id, skill_id)
);

CREATE TABLE task_skill_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    skill_id UUID NOT NULL REFERENCES skills(id),
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    UNIQUE(task_id, skill_id)
);

-- 6. Planning Allocations
CREATE TABLE planning_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    resource_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- 7. Indexes
CREATE INDEX idx_planning_allocations_resource_date ON planning_allocations(resource_id, date);
CREATE INDEX idx_planning_allocations_task_date ON planning_allocations(task_id, date);
CREATE INDEX idx_resource_non_project_allocations_resource_date ON resource_non_project_allocations(resource_id, date);
CREATE INDEX idx_user_absences_user_date ON user_absences(user_id, absence_start_date, absence_end_date);
CREATE INDEX idx_resource_skills_resource ON resource_skills(resource_id);
CREATE INDEX idx_task_skill_requirements_task ON task_skill_requirements(task_id);

-- 8. RLS Policies
-- General pattern: 
-- SELECT: Approved users
-- INSERT/UPDATE: Approved users
-- DELETE: Admins

-- Apply RLS and Policies

-- Helper macro-like approach: None, doing explicitly to avoid scope issues.

-- 1. work_schedules
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view work_schedules" ON public.work_schedules FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert work_schedules" ON public.work_schedules FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update work_schedules" ON public.work_schedules FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete work_schedules" ON public.work_schedules FOR DELETE TO authenticated USING (public.is_admin());

-- 2. work_schedule_periods
ALTER TABLE public.work_schedule_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view work_schedule_periods" ON public.work_schedule_periods FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert work_schedule_periods" ON public.work_schedule_periods FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update work_schedule_periods" ON public.work_schedule_periods FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete work_schedule_periods" ON public.work_schedule_periods FOR DELETE TO authenticated USING (public.is_admin());

-- 3. resource_work_schedules
ALTER TABLE public.resource_work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view resource_work_schedules" ON public.resource_work_schedules FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert resource_work_schedules" ON public.resource_work_schedules FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update resource_work_schedules" ON public.resource_work_schedules FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete resource_work_schedules" ON public.resource_work_schedules FOR DELETE TO authenticated USING (public.is_admin());

-- 4. work_schedule_overrides
ALTER TABLE public.work_schedule_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view work_schedule_overrides" ON public.work_schedule_overrides FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert work_schedule_overrides" ON public.work_schedule_overrides FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update work_schedule_overrides" ON public.work_schedule_overrides FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete work_schedule_overrides" ON public.work_schedule_overrides FOR DELETE TO authenticated USING (public.is_admin());

-- 5. work_schedule_override_periods
ALTER TABLE public.work_schedule_override_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view work_schedule_override_periods" ON public.work_schedule_override_periods FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert work_schedule_override_periods" ON public.work_schedule_override_periods FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update work_schedule_override_periods" ON public.work_schedule_override_periods FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete work_schedule_override_periods" ON public.work_schedule_override_periods FOR DELETE TO authenticated USING (public.is_admin());

-- 6. non_project_work
ALTER TABLE public.non_project_work ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view non_project_work" ON public.non_project_work FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert non_project_work" ON public.non_project_work FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update non_project_work" ON public.non_project_work FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete non_project_work" ON public.non_project_work FOR DELETE TO authenticated USING (public.is_admin());

-- 7. resource_non_project_allocations
ALTER TABLE public.resource_non_project_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view resource_non_project_allocations" ON public.resource_non_project_allocations FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert resource_non_project_allocations" ON public.resource_non_project_allocations FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update resource_non_project_allocations" ON public.resource_non_project_allocations FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete resource_non_project_allocations" ON public.resource_non_project_allocations FOR DELETE TO authenticated USING (public.is_admin());

-- 8. skills
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view skills" ON public.skills FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert skills" ON public.skills FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update skills" ON public.skills FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete skills" ON public.skills FOR DELETE TO authenticated USING (public.is_admin());

-- 9. resource_skills
ALTER TABLE public.resource_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view resource_skills" ON public.resource_skills FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert resource_skills" ON public.resource_skills FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update resource_skills" ON public.resource_skills FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete resource_skills" ON public.resource_skills FOR DELETE TO authenticated USING (public.is_admin());

-- 10. task_skill_requirements
ALTER TABLE public.task_skill_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view task_skill_requirements" ON public.task_skill_requirements FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert task_skill_requirements" ON public.task_skill_requirements FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update task_skill_requirements" ON public.task_skill_requirements FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete task_skill_requirements" ON public.task_skill_requirements FOR DELETE TO authenticated USING (public.is_admin());

-- 11. planning_allocations
ALTER TABLE public.planning_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view planning_allocations" ON public.planning_allocations FOR SELECT TO authenticated USING (public.is_approved());
CREATE POLICY "Approved users can insert planning_allocations" ON public.planning_allocations FOR INSERT TO authenticated WITH CHECK (public.is_approved());
CREATE POLICY "Approved users can update planning_allocations" ON public.planning_allocations FOR UPDATE TO authenticated USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admins can delete planning_allocations" ON public.planning_allocations FOR DELETE TO authenticated USING (public.is_admin());



