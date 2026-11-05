-- Migration: 20260928020000_planning_allocations_integrity_hardening.sql
-- FASE 65-FINAL-C: Planning Database Integrity Hardening

SET search_path TO public;

-- 1. Structural NOT NULL Guarantees on planning_allocations
DO $$
BEGIN
    -- Ensure resource_id is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN resource_id SET NOT NULL;
    -- Ensure task_id is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN task_id SET NOT NULL;
    -- Ensure date is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN date SET NOT NULL;
    -- Ensure start_time is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN start_time SET NOT NULL;
    -- Ensure end_time is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN end_time SET NOT NULL;
    -- Ensure status is NOT NULL
    ALTER TABLE public.planning_allocations ALTER COLUMN status SET NOT NULL;
END $$;

-- 2. Temporal Invariant: start_time < end_time CHECK Constraint
-- Rejects start_time = end_time and start_time > end_time at the PostgreSQL level.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.planning_allocations'::regclass 
          AND conname = 'chk_planning_allocations_start_before_end'
    ) THEN
        ALTER TABLE public.planning_allocations
        ADD CONSTRAINT chk_planning_allocations_start_before_end
        CHECK (start_time < end_time);
    END IF;
END $$;

-- 3. Exclusion Constraint for Overlapping CONFIRMED Allocations (Idempotent confirmation)
-- Ensures no two CONFIRMED allocations for the same resource on the same date can overlap.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.planning_allocations'::regclass 
          AND conname = 'no_overlapping_confirmed_allocations'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        
        ALTER TABLE public.planning_allocations
        ADD CONSTRAINT no_overlapping_confirmed_allocations
        EXCLUDE USING gist (
            resource_id WITH =,
            date WITH =,
            (public.planning_allocation_tsrange(date, start_time, end_time)) WITH &&
        )
        WHERE (status = 'CONFIRMED');
    END IF;
END $$;
