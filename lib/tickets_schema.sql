-- ==============================================================================
-- SISTEMA DE TICKETS & PEDIDOS DE SUPORTE
-- Script de Criação e Configuração de Base de Dados (PostgreSQL / Supabase)
-- ==============================================================================

-- 1. Tabela Auxiliar: Estados de Tickets (ticket_statuses)
CREATE TABLE IF NOT EXISTS public.ticket_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    color VARCHAR(50) DEFAULT 'blue',
    scale INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Garantir que as colunas existem mesmo se a tabela já tiver sido criada anteriormente
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT 'blue';
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS scale INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.ticket_statuses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Inserção dos Estados Iniciais Predefinidos (apenas se a tabela estiver vazia)
INSERT INTO public.ticket_statuses (name, scale, sort_order, color)
SELECT * FROM (VALUES 
    ('Validação Pendente', 1, 1, 'amber'),
    ('Aberto', 2, 2, 'blue'),
    ('Em Análise', 3, 3, 'purple'),
    ('Convertido em Tarefa', 4, 4, 'indigo'),
    ('Resolvido', 5, 5, 'emerald'),
    ('Cancelado', 6, 6, 'slate')
) AS v(name, scale, sort_order, color)
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_statuses);

-- 2. Tabela Principal: Tickets (tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Canal de Entrada (manual, email, teams, phone)
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_details TEXT,
    
    -- Prioridade (Ligada à configuração de Prioridades dos campos auxiliares)
    priority VARCHAR(100) NOT NULL,
    
    -- Tipo de Tarefa (Ligada aos Tipos de Tarefa dos campos auxiliares)
    task_type_id UUID REFERENCES public.task_types(id) ON DELETE SET NULL,
    category VARCHAR(100), -- Campo legado / designação textual
    
    -- Estado do Ticket (Ligada à tabela de ticket_statuses)
    status VARCHAR(100) NOT NULL DEFAULT 'aberto',
    status_id UUID REFERENCES public.ticket_statuses(id) ON DELETE SET NULL,
    
    -- Associação a Cliente (opcional ou novo cliente criado dinamicamente)
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    
    -- Técnico Responsável (Ligado aos Utilizadores das tarefas)
    assigned_to_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    
    -- Utilizador que registou o ticket
    created_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    
    -- Dados de Contacto do Solicitante
    requester_name VARCHAR(255),
    requester_email VARCHAR(255),
    requester_phone VARCHAR(50),
    
    -- Conversão em Tarefa de Obra
    converted_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    converted_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    
    -- Notas de Triagem e Resolução
    validation_notes TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    
    -- Metadados de Controlo
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Garantir colunas no caso da tabela tickets já existir previamente
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS priority_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS task_type_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS status_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS source_details TEXT;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS assigned_to_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS created_by_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS requester_name VARCHAR(255);
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS requester_email VARCHAR(255);
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS requester_phone VARCHAR(50);
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS converted_task_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS converted_project_id UUID;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- 3. Sequência e Função para Geração Automática do Número do Ticket (ex: TCK-2026-001)
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT := to_char(CURRENT_DATE, 'YYYY');
    seq_num TEXT;
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        seq_num := lpad(nextval('ticket_number_seq')::TEXT, 4, '0');
        NEW.ticket_number := 'TCK-' || current_year || '-' || seq_num;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_ticket_number ON public.tickets;
CREATE TRIGGER trg_generate_ticket_number
BEFORE INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_number();

-- 4. Função e Trigger para Atualização Automática de updated_at
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_ticket_timestamp ON public.tickets;
CREATE TRIGGER trg_update_ticket_timestamp
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION update_ticket_timestamp();

-- 5. Índices de Otimização e Performance
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tickets_task_type ON public.tickets(task_type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_deleted ON public.tickets(deleted);

-- 6. Políticas de Segurança (Row Level Security - RLS)
ALTER TABLE public.ticket_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de estados de tickets a utilizadores autenticados"
ON public.ticket_statuses FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Permitir escrita de estados de tickets a administradores/gestores"
ON public.ticket_statuses FOR ALL
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY "Permitir leitura de tickets a utilizadores autenticados"
ON public.tickets FOR SELECT
TO authenticated
USING (deleted = FALSE);

CREATE POLICY "Permitir inserção e atualização de tickets a utilizadores autenticados"
ON public.tickets FOR ALL
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);
