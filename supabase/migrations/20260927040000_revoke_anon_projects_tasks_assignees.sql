-- Migration to revoke anon privileges from projects, tasks, and task_assignees tables.
-- These tables are strictly server-side/API-only and never accessed directly by the browser via the anon client.

-- FASE 47 — Revogar acesso anon à tabela projects
REVOKE ALL ON TABLE public.projects FROM anon;

-- FASE 49 — Revogar acesso anon à tabela tasks
REVOKE ALL ON TABLE public.tasks FROM anon;

-- FASE 51 — Revogar acesso anon à tabela task_assignees
REVOKE ALL ON TABLE public.task_assignees FROM anon;
