-- Migration: 20261002010000_harden_tasks_project_foreign_key.sql
-- FASE 79: Hardening da Integridade Física Projects -> Tasks + Consolidação do Project Persistence Boundary
-- 1. Altera a foreign key tasks_project_id_fkey de ON DELETE CASCADE para ON DELETE RESTRICT (com ON UPDATE NO ACTION).
-- 2. Cria a RPC transacional canónica delete_project_transaction(p_id, p_expected_version, p_updated_by).

SET search_path = public;

-- ============================================================================
-- 1. Hardening da Foreign Key tasks.project_id -> projects.id
-- ============================================================================

-- Remover a foreign key legada com regra CASCADE perigosa
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;

-- Recriar a foreign key com restrição estrita ON DELETE RESTRICT e ON UPDATE NO ACTION
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id)
  REFERENCES public.projects(id)
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

COMMENT ON CONSTRAINT tasks_project_id_fkey ON public.tasks IS
  'Garante que nenhum projeto pode ser fisicamente eliminado no PostgreSQL enquanto contiver tarefas associadas.';

-- ============================================================================
-- 2. RPC Canónica Transacional para Eliminação de Projeto (Project Persistence Boundary)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_project_transaction(
  p_id UUID,
  p_expected_version INT DEFAULT NULL,
  p_updated_by UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INT;
  v_next_version INT;
BEGIN
  -- 1. Verificar se o projeto existe e não está já marcado como eliminado
  SELECT version INTO v_current_version
  FROM public.projects
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validação de Concorrência Otimista (OCC)
  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', v_current_version, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Invariante de integridade: bloquear se existirem tarefas ativas associadas
  IF EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem tarefas ativas associadas.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Invariante de integridade: bloquear se existirem orçamentos associados
  IF EXISTS (
    SELECT 1
    FROM public.quotes
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem orçamentos associados.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Invariante de integridade: bloquear se existirem materiais associados
  IF EXISTS (
    SELECT 1
    FROM public.project_materials
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem materiais associados.'
      USING ERRCODE = 'P0001';
  END IF;

  v_next_version := v_current_version + 1;

  -- 6. Executar soft-delete de forma atómica e incrementar versão
  UPDATE public.projects
  SET
    deleted = TRUE,
    version = v_next_version,
    updated_by = p_updated_by,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_id;

  RETURN v_next_version;
END;
$function$;

-- Conceder privilégios de execução a utilizadores autenticados e service_role
GRANT EXECUTE ON FUNCTION public.delete_project_transaction(UUID, INT, UUID) TO authenticated, service_role;
