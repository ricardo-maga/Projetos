-- ============================================================================
-- AUDITORIA E OTIMIZAÇÃO DE ÍNDICES SUPABASE / POSTGRESQL (ERP INDUSTRIAL)
-- ============================================================================
-- Este script executa a auditoria e implementação de índices de alto desempenho
-- para PostgreSQL / Supabase, eliminando sequential scans (Seq Scan), acelerando
-- consultas paginadas (ORDER BY created_at DESC LIMIT X OFFSET Y) e filtros frequentes.
--
-- INSTRUÇÕES DE EXECUÇÃO:
-- 1. Aceda ao painel do Supabase (https://supabase.com/dashboard)
-- 2. Selecione o seu projeto -> SQL Editor -> New Query
-- 3. Cole e execute este script. É seguro e idempotente (usa IF NOT EXISTS).
-- ============================================================================

-- ============================================================================
-- 1. TABELA `projects` (Projetos Industriais)
-- ============================================================================
-- Otimiza consultas paginadas e listagem de projetos ativos (deleted = false)
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects (deleted);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_created_at ON projects (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc ON projects (created_at DESC);

-- Otimiza filtros por Chaves Estrangeiras (FK) e junções
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status_id ON projects (status_id);
CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects (category_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects (project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_field_manager_id ON projects (field_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_sales_rep_id ON projects (sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects (created_by);

-- Otimiza pesquisas rápidas por código de instalação e oportunidade
CREATE INDEX IF NOT EXISTS idx_projects_install_no ON projects (install_project_no);
CREATE INDEX IF NOT EXISTS idx_projects_sf_opp_no ON projects (sf_opportunity_no);

-- Índice parcial composto para projetos ativos por estado
CREATE INDEX IF NOT EXISTS idx_projects_active_status ON projects (status_id, created_at DESC) WHERE deleted = FALSE;

-- Otimiza filtros de calendário e datas de projeto
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects (start_date, delivery_date);
CREATE INDEX IF NOT EXISTS idx_projects_scheduled_date ON projects (scheduled_date);

-- ============================================================================
-- 2. TABELA `tasks` (Tarefas de Projetos)
-- ============================================================================
-- Tabela de maior volume: consultas por projeto e paginação
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks (status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC);

-- Índice composto chave: Tarefas ativas de um projeto ordenadas cronologicamente
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted ON tasks (project_id, deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_created_at ON tasks (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_active_project ON tasks (project_id, status_id) WHERE deleted = FALSE;

-- Otimiza filtros por tipo de tarefa e marco (milestone)
CREATE INDEX IF NOT EXISTS idx_tasks_task_type_id ON tasks (task_type_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_milestone ON tasks (is_milestone);

-- Otimiza consultas do Calendário e planeamento temporal
CREATE INDEX IF NOT EXISTS idx_tasks_estimated_date ON tasks (estimated_date);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks (start_date, end_date);

-- ============================================================================
-- 3. TABELA `task_assignees` (Atribuição de Tarefas a Técnicos)
-- ============================================================================
-- O PK é (task_id, user_id). O índice abaixo permite pesquisas instantâneas
-- por user_id (usado no painel 'O Meu Foco' e conflitos de agendamento)
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees (user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees (task_id);

-- ============================================================================
-- 4. TABELA `comments` (Comentários de Projetos)
-- ============================================================================
-- Comentários ordenados por data dentro de cada projeto
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments (project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_created ON comments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments (author_id);

-- ============================================================================
-- 5. TABELA `project_materials` (Materiais e Encomendas por Projeto)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_project_materials_project_id ON project_materials (project_id);
CREATE INDEX IF NOT EXISTS idx_project_materials_proj_del ON project_materials (project_id, deleted);
CREATE INDEX IF NOT EXISTS idx_project_materials_supplier ON project_materials (supplier);
CREATE INDEX IF NOT EXISTS idx_project_materials_status ON project_materials (status);
CREATE INDEX IF NOT EXISTS idx_project_materials_created_at ON project_materials (created_at DESC);

-- ============================================================================
-- 6. TABELA `project_risk_items` (Matriz de Riscos de Projeto)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_risk_items_project_id ON project_risk_items (project_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_proj_del ON project_risk_items (project_id, deleted);
CREATE INDEX IF NOT EXISTS idx_risk_items_status ON project_risk_items (status_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_priority ON project_risk_items (priority_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_owner ON project_risk_items (owner_id);

-- ============================================================================
-- 7. TABELAS DE LIGAÇÃO RELACIONAIS N:N (Reverse Foreign Key Indexes)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_project_risk_link_risk ON project_risk_link (risk_id);
CREATE INDEX IF NOT EXISTS idx_project_priority_link_priority ON project_priority_link (priority_id);
CREATE INDEX IF NOT EXISTS idx_project_category_link_cat ON project_category_link (category_id);
CREATE INDEX IF NOT EXISTS idx_project_teams_link_team ON project_teams_link (team_id);
CREATE INDEX IF NOT EXISTS idx_project_partners_link_partner ON project_partners_link (partner_id);

-- ============================================================================
-- 8. TABELAS AUXILIARES E ORÇAMENTAÇÃO (`clients`, `quotes`, `bill_of_materials`, `equipment`, etc.)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients (deleted);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (client_name) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON quotes (project_id);
CREATE INDEX IF NOT EXISTS idx_quotes_deleted ON quotes (deleted);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (status);

CREATE INDEX IF NOT EXISTS idx_bom_quote_id ON bill_of_materials (quote_id);
CREATE INDEX IF NOT EXISTS idx_bom_material_id ON bill_of_materials (material_id);
CREATE INDEX IF NOT EXISTS idx_bom_deleted ON bill_of_materials (deleted);

CREATE INDEX IF NOT EXISTS idx_material_deleted ON material (deleted);
CREATE INDEX IF NOT EXISTS idx_material_name ON material (name) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_material_supplier ON material (supplier);

CREATE INDEX IF NOT EXISTS idx_equipment_project_id ON equipment (project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_deleted ON equipment (deleted);

CREATE INDEX IF NOT EXISTS idx_user_absences_user_dates ON user_absences (user_id, absence_start_date, absence_end_date);

-- Analisar estatísticas das tabelas para o Planeador de Consultas (Cost-Based Optimizer) do PostgreSQL
ANALYZE projects;
ANALYZE tasks;
ANALYZE task_assignees;
ANALYZE comments;
ANALYZE project_materials;
ANALYZE project_risk_items;
ANALYZE clients;
ANALYZE quotes;
ANALYZE bill_of_materials;
ANALYZE material;
ANALYZE equipment;
