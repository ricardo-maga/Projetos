-- Migration 008: Cleanup Legacy Auth Columns from Application Tables
-- This migration ensures credentials are never stored in public application tables.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'users' 
          AND column_name = 'password'
    ) THEN
        ALTER TABLE public.users DROP COLUMN password;
    END IF;
END $$;
