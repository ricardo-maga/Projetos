-- Script de atualização da base de dados SQL (Supabase / PostgreSQL)
-- Executar no SQL Editor do Supabase para suporte completo às novas funcionalidades

-- 1. Criar a tabela de materiais por projeto (project_materials)
CREATE TABLE IF NOT EXISTS project_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  supplier TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  reference TEXT,
  budget NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  sale_price NUMERIC DEFAULT 0,
  expected_delivery_date DATE,
  status TEXT DEFAULT 'encomendado', -- 'encomendado' ou 'em_stock'
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexação para pesquisas rápidas por projeto e fornecedor
CREATE INDEX IF NOT EXISTS idx_project_materials_project_id ON project_materials(project_id);
CREATE INDEX IF NOT EXISTS idx_project_materials_supplier ON project_materials(supplier);
CREATE INDEX IF NOT EXISTS idx_project_materials_status ON project_materials(status);

-- 2. Adicionar a coluna is_milestone na tabela tasks para suportar "Novo marco"
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

-- Comentários explicativos
COMMENT ON TABLE project_materials IS 'Linhas de encomenda/material necessário por projeto';
COMMENT ON COLUMN tasks.is_milestone IS 'Indica se a tarefa é um Novo Marco (sem utilizador nem tempos previstos)';
