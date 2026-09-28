-- Migration: 20260928010000_planning_allocations_exclusion_constraint.sql
-- FASE 65-FINAL-B: Garantia de Integridade Concorrente em Planning (Invariante de Sobreposição)

SET search_path TO public;

-- 1. Ativar a extensão btree_gist para permitir tipos escalares (UUID, DATE) no índice GiST
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Função imutável auxiliar para construção de tsrange [start, end)
CREATE OR REPLACE FUNCTION public.planning_allocation_tsrange(d DATE, s_time TIME, e_time TIME)
RETURNS tsrange AS $$
BEGIN
    RETURN tsrange((d + s_time), (d + e_time), '[)');
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

-- 3. Constraint de Exclusão (EXCLUDE USING gist) em planning_allocations
-- Garante a nível de base de dados PostgreSQL que nunca podem existir duas alocações
-- CONFIRMED sobrepostas para o mesmo recurso na mesma data.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_confirmed_allocations'
    ) THEN
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
