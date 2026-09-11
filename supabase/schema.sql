-- ============================================================================
-- GESTÃO DE PROJETOS E ERP - SUPABASE DATABASES SCHEMA & DATA MIGRATION SCRIPT
-- ============================================================================
-- Este script respeita INTEGRALMENTE e com PRECISÃO ABSOLUTA a estrutura de base de dados
-- que partilhou: nomes de tabelas, nomes de colunas, restrições e tipos exatos (UUID, interval, bool, etc.).
--
-- INSTRUÇÕES DE INSTALAÇÃO NO SUPABASE:
-- 1. Aceda ao painel do Supabase (https://supabase.com).
-- 2. Selecione o seu projeto.
-- 3. Vá a "SQL Editor" no menu lateral esquerdo.
-- 4. Clique em "New Query".
-- 5. Copie e cole todo o conteúdo deste ficheiro e clique em "Run".
-- ============================================================================

-- Ativar extensão de UUIDs caso não esteja ativa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Limpeza de tabelas antigas para permitir reconstrução limpa (Descomentar se desejar limpar)
-- DROP TABLE IF EXISTS portal_erp_snapshots CASCADE;
-- DROP TABLE IF EXISTS equipment CASCADE;
-- DROP TABLE IF EXISTS bill_of_materials CASCADE;
-- DROP TABLE IF EXISTS quotes CASCADE;
-- DROP TABLE IF EXISTS material CASCADE;
-- DROP TABLE IF EXISTS app_configuration CASCADE;
-- DROP TABLE IF EXISTS user_absences CASCADE;
-- DROP TABLE IF EXISTS comments CASCADE;
-- DROP TABLE IF EXISTS task_assignees CASCADE;
-- DROP TABLE IF EXISTS tasks CASCADE;
-- DROP TABLE IF EXISTS project_partners_link CASCADE;
-- DROP TABLE IF EXISTS project_category_link CASCADE;
-- DROP TABLE IF EXISTS project_teams_link CASCADE;
-- DROP TABLE IF EXISTS project_priority_link CASCADE;
-- DROP TABLE IF EXISTS project_risk_link CASCADE;
-- DROP TABLE IF EXISTS projects CASCADE;
-- DROP TABLE IF EXISTS clients CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS task_status CASCADE;
-- DROP TABLE IF EXISTS project_partners CASCADE;
-- DROP TABLE IF EXISTS project_teams CASCADE;
-- DROP TABLE IF EXISTS project_priority CASCADE;
-- DROP TABLE IF EXISTS project_risk CASCADE;
-- DROP TABLE IF EXISTS project_category CASCADE;
-- DROP TABLE IF EXISTS project_status CASCADE;
-- DROP TABLE IF EXISTS user_groups CASCADE;

-- ==========================================
-- 0. TABLE `portal_erp_snapshots` (Para Sincronização do ERP)
-- ==========================================
CREATE TABLE IF NOT EXISTS portal_erp_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    state JSONB NOT NULL
);

-- Habilitar Row Level Security (RLS) para o portal_erp_snapshots
ALTER TABLE portal_erp_snapshots ENABLE ROW LEVEL SECURITY;

-- Criar políticas de acesso público permissivo para desenvolvimento / sincronização
CREATE POLICY "Permitir leitura pública de snapshots" ON portal_erp_snapshots FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de snapshots" ON portal_erp_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de snapshots" ON portal_erp_snapshots FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminação pública de snapshots" ON portal_erp_snapshots FOR DELETE USING (true);

-- ==========================================
-- 1. TABLE `user_groups`
-- ==========================================
CREATE TABLE IF NOT EXISTS user_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 2. TABLE `project_status`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT4 NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 3. TABLE `project_category`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_category (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 4. TABLE `project_risk`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_risk (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT4 NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 5. TABLE `project_priority`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_priority (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT4 NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 6. TABLE `project_teams`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 7. TABLE `project_partners`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 8. TABLE `task_status`
-- ==========================================
CREATE TABLE IF NOT EXISTS task_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT4 NULL
);

-- ==========================================
-- 9. TABLE `users`
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NULL UNIQUE,
    role_id UUID NULL REFERENCES user_groups(id) ON DELETE SET NULL,
    approved BOOLEAN DEFAULT FALSE,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 10. TABLE `clients`
-- ==========================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name TEXT NOT NULL,
    short_name TEXT NULL,
    location TEXT NULL,
    tax_id TEXT NULL,
    contact_person TEXT NULL,
    contact_email TEXT NULL,
    contact_phone TEXT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 11. TABLE `projects`
-- ==========================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    demo BOOLEAN DEFAULT FALSE,
    client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
    project_title TEXT NOT NULL,
    project_description TEXT NULL,
    category_id UUID NULL REFERENCES project_category(id) ON DELETE SET NULL,
    status_id UUID NULL REFERENCES project_status(id) ON DELETE SET NULL,
    project_manager_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    field_manager_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    sales_rep_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    start_date DATE NULL,
    delivery_date DATE NULL,
    estimated_date DATE NULL,
    scheduled_date DATE NULL,
    install_project_no TEXT NULL,
    sf_opportunity_no TEXT NULL,
    documents TEXT NULL, -- Comma-separated or single document path string as per schema
    budget_value NUMERIC NULL,
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    client_contact_name TEXT NULL,
    client_contact_email TEXT NULL,
    client_contact_phone TEXT NULL
);

-- ==========================================
-- 12. TABLE `project_risk_link`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_risk_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    risk_id UUID REFERENCES project_risk(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, risk_id)
);

-- ==========================================
-- 13. TABLE `project_priority_link`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_priority_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    priority_id UUID REFERENCES project_priority(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, priority_id)
);

-- ==========================================
-- 13.5. TABLE `project_category_link`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_category_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category_id UUID REFERENCES project_category(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, category_id)
);

-- ==========================================
-- 14. TABLE `project_teams_link`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_teams_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID REFERENCES project_teams(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
);

-- ==========================================
-- 15. TABLE `project_partners_link`
-- ==========================================
CREATE TABLE IF NOT EXISTS project_partners_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES project_partners(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, partner_id)
);

-- ==========================================
-- 16. TABLE `tasks`
-- ==========================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_title TEXT NOT NULL,
    status_id UUID NULL REFERENCES task_status(id) ON DELETE SET NULL,
    estimated_date DATE NULL,
    task_description TEXT NULL,
    estimated_hours INTERVAL NULL, -- Postgres native interval
    actual_hours INTERVAL NULL,    -- Postgres native interval
    start_date DATE NULL,
    start_time TIME NULL,
    end_date DATE NULL,
    end_time TIME NULL,
    notes TEXT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 17. TABLE `task_assignees`
-- ==========================================
CREATE TABLE IF NOT EXISTS task_assignees (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

-- ==========================================
-- 18. TABLE `comments`
-- ==========================================
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 19. TABLE `user_absences`
-- ==========================================
CREATE TABLE IF NOT EXISTS user_absences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    absence_start_date DATE NOT NULL,
    absence_end_date DATE NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 20. TABLE `app_configuration`
-- ==========================================
CREATE TABLE IF NOT EXISTS app_configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_name TEXT NULL,
    app_description TEXT NULL,
    footer_text TEXT NULL,
    logo_url TEXT NULL,
    logo_image_path TEXT NULL,
    footer_copyright_text TEXT NULL,
    theme_name TEXT NULL
);

-- ==========================================
-- 20a. TABLE `special_days`
-- ==========================================
CREATE TABLE IF NOT EXISTS special_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 20b. TABLE `default_tasks`
-- ==========================================
CREATE TABLE IF NOT EXISTS default_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NULL,
    estimated_hours INTERVAL NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 21. TABLE `material`
-- ==========================================
CREATE TABLE IF NOT EXISTS material (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    reference TEXT NULL,
    manufacturer_reference TEXT NULL,
    unit TEXT NULL,
    unit_cost NUMERIC NULL,
    supplier TEXT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 22. TABLE `quotes`
-- ==========================================
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
    status TEXT NULL,
    version INT4 NOT NULL DEFAULT 1,
    total_value NUMERIC NULL,
    valid_until DATE NULL,
    responsible_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 23. TABLE `bill_of_materials`
-- ==========================================
CREATE TABLE IF NOT EXISTS bill_of_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NULL REFERENCES quotes(id) ON DELETE CASCADE,
    material_id UUID NULL REFERENCES material(id) ON DELETE SET NULL,
    quantity NUMERIC NOT NULL DEFAULT 1.00,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 24. TABLE `equipment`
-- ==========================================
CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number TEXT NULL,
    brand TEXT NULL,
    model TEXT NULL,
    project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
    status TEXT NULL,
    installation_date DATE NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================================
-- SEED DATA DE FACTO (COM CONVERSÃO DE IDS EM MEMÓRIA PARA UUIDS CONSISTENTES)
-- ============================================================================

-- 1. Seed user_groups
INSERT INTO user_groups (id, name, deleted) VALUES
('00000000-0000-0000-0000-000000000001', 'Administrator', FALSE),
('00000000-0000-0000-0000-000000000002', 'Project Manager', FALSE),
('00000000-0000-0000-0000-000000000003', 'Technician', FALSE),
('00000000-0000-0000-0000-000000000004', 'Viewer', FALSE);

-- 2. Seed project_status
INSERT INTO project_status (id, name, scale, deleted) VALUES
('33333333-3333-3333-3333-333333333301', 'Planning', 1, FALSE),
('33333333-3333-3333-3333-333333333302', 'Procurement', 2, FALSE),
('33333333-3333-3333-3333-333333333303', 'Preparation', 3, FALSE),
('33333333-3333-3333-3333-333333333304', 'Testing/FAT', 4, FALSE),
('33333333-3333-3333-3333-333333333305', 'Installation/SAT', 5, FALSE),
('33333333-3333-3333-3333-333333333306', 'Follow-up', 6, FALSE),
('33333333-3333-3333-3333-333333333307', 'On hold', 7, FALSE),
('33333333-3333-3333-3333-333333333308', 'Improvements', 8, FALSE);

-- 3. Seed project_category
INSERT INTO project_category (id, name, deleted) VALUES
('44444444-4444-4444-4444-444444444401', 'Internal', FALSE),
('44444444-4444-4444-4444-444444444402', 'Standard', FALSE),
('44444444-4444-4444-4444-444444444403', 'Labeling', FALSE),
('44444444-4444-4444-4444-444444444404', 'Weighing', FALSE),
('44444444-4444-4444-4444-444444444405', 'Vision/Scanner', FALSE),
('44444444-4444-4444-4444-444444444406', 'Cross-team support', FALSE),
('44444444-4444-4444-4444-444444444407', 'Other', FALSE);

-- 4. Seed project_risk
INSERT INTO project_risk (id, name, scale, deleted) VALUES
('55555555-5555-5555-5555-555555555501', 'Low', 1, FALSE),
('55555555-5555-5555-5555-555555555502', 'Medium', 2, FALSE),
('55555555-5555-5555-5555-555555555503', 'High', 3, FALSE);

-- 5. Seed project_priority
INSERT INTO project_priority (id, name, scale, deleted) VALUES
('66666666-6666-6666-6666-666666666601', 'Medium', 1, FALSE),
('66666666-6666-6666-6666-666666666602', 'High', 2, FALSE),
('66666666-6666-6666-6666-666666666603', 'Urgent', 3, FALSE);

-- 6. Seed project_teams
INSERT INTO project_teams (id, name, deleted) VALUES
('77777777-7777-7777-7777-777777777701', 'Software', FALSE),
('77777777-7777-7777-7777-777777777702', 'Installations', FALSE),
('77777777-7777-7777-7777-777777777703', 'Repairs', FALSE),
('77777777-7777-7777-7777-777777777704', 'Partner', FALSE);

-- 7. Seed project_partners
INSERT INTO project_partners (id, name, deleted) VALUES
('88888888-8888-8888-8888-888888888801', 'JDG', FALSE),
('88888888-8888-8888-8888-888888888802', 'Machserv', FALSE),
('88888888-8888-8888-8888-888888888803', 'Inovasense', FALSE),
('88888888-8888-8888-8888-888888888804', 'TSMaq', FALSE),
('88888888-8888-8888-8888-888888888805', 'Make Industry', FALSE),
('88888888-8888-8888-8888-888888888806', 'Aidomotic', FALSE),
('88888888-8888-8888-8888-888888888807', 'Dibal', FALSE),
('88888888-8888-8888-8888-888888888808', 'FFonseca', FALSE);

-- 8. Seed task_status
INSERT INTO task_status (id, name, scale) VALUES
('99999999-9999-9999-9999-999999999901', 'Not started', 1),
('99999999-9999-9999-9999-999999999902', 'In progress', 2),
('99999999-9999-9999-9999-999999999903', 'Completed', 3),
('99999999-9999-9999-9999-999999999904', 'On hold', 4);

-- 9. Seed users
INSERT INTO users (id, type, name, email, role_id, approved, deleted, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'Team', 'Ricardo', 'Ricardo75@gmail.com', '00000000-0000-0000-0000-000000000001', TRUE, FALSE, '2026-01-10T09:00:00Z'),

-- 10. Seed clients
INSERT INTO clients (id, client_name, short_name, location, tax_id, contact_person, contact_email, contact_phone, deleted, created_at) VALUES
('22222222-2222-2222-2222-222222222221', 'Lactícinios do Norte, S.A.', 'LactNorte', 'Porto, Portugal', 'PT501234567', 'Manuel Sousa', 'm.sousa@lactnorte.pt', '+351 912 345 678', FALSE, '2026-01-05T08:00:00Z'),
('22222222-2222-2222-2222-222222222222', 'Supermercados Globais Portugal', 'SuperGlobais', 'Lisboa, Portugal', 'PT509876543', 'Ana Rita', 'arrita@superglobais.pt', '+351 931 987 654', FALSE, '2026-01-11T12:00:00Z'),
('22222222-2222-2222-2222-222222222223', 'Indústria Metalúrgica do Ave', 'IMAve', 'Guimarães, Portugal', 'PT505555555', 'Rui Costa', 'rcosta@imave.pt', '+351 253 111 222', FALSE, '2026-02-10T15:30:00Z');

-- 11. Seed projects
INSERT INTO projects (id, demo, client_id, project_title, project_description, category_id, status_id, project_manager_id, field_manager_id, sales_rep_id, start_date, delivery_date, estimated_date, scheduled_date, install_project_no, sf_opportunity_no, documents, budget_value, created_by, deleted, created_at, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', FALSE, '22222222-2222-2222-2222-222222222221', 'Implementação de Linha de Pesagem e Rotulagem Automática', 'Projeto para instalar um sistema integrado de pesagem em contínuo com aplicador automático de etiquetas de peso/preço para a linha de embalamento de queijos.', '44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111114', '2026-05-01', '2026-08-30', '2026-08-15', '2026-08-10', 'IP-2026-088', 'SF-OPP-99221', 'Esquema_Eletrico_v1.pdf,Layout_Linha_Pesagem.dwg', 18500.00, '11111111-1111-1111-1111-111111111111', FALSE, '2026-03-01T10:00:00Z', '2026-07-09T12:00:00Z'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', TRUE, '22222222-2222-2222-2222-222222222222', 'Sistema de Visão Artificial para Inspeção de Garrafas', 'Demonstrador tecnológico de inspeção de integridade de tampas e nível de enchimento em garrafas de vidro a alta velocidade utilizando câmaras inteligentes Cognex.', '44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111114', '2026-07-01', '2026-10-15', '2026-10-01', '2026-09-25', 'IP-2026-104', 'SF-OPP-10492', 'Estudo_Luminosidade_Cognex.pdf', 8900.00, '11111111-1111-1111-1111-111111111111', FALSE, '2026-06-15T15:00:00Z', '2026-07-05T10:30:00Z');

-- 12. Seed project_risk_link
INSERT INTO project_risk_link (project_id, risk_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555502'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '55555555-5555-5555-5555-555555555501');

-- 12.5. Seed project_category_link
INSERT INTO project_category_link (project_id, category_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444404'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '44444444-4444-4444-4444-444444444405');

-- 13. Seed project_priority_link
INSERT INTO project_priority_link (project_id, priority_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666602'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '66666666-6666-6666-6666-666666666601');

-- 14. Seed project_teams_link
INSERT INTO project_teams_link (project_id, team_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777701'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777702'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '77777777-7777-7777-7777-777777777701');

-- 15. Seed project_partners_link
INSERT INTO project_partners_link (project_id, partner_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888807'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888804'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '88888888-8888-8888-8888-888888888803');

-- 16. Seed tasks (Using standard Postgres interval values like '40 hours' / '18 hours 30 minutes')
INSERT INTO tasks (id, project_id, task_title, status_id, estimated_date, task_description, estimated_hours, actual_hours, start_date, start_time, end_date, end_time, notes, deleted, created_at) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Programação do PLC Siemens S7-1200', '99999999-9999-9999-9999-999999999902', '2026-07-15', 'Desenvolvimento do programa de controlo em TIA Portal para as esteiras de pesagem, integração com o protocolo Dibal e controlo do cilindro pneumático de rejeição.', '40 hours', '18 hours 30 minutes', '2026-07-01', '09:00:00', NULL, NULL, 'Lógica das esteiras concluída. Falta implementar rotina de comunicação Modbus TCP com o aplicador de etiquetas.', FALSE, '2026-06-20T09:00:00Z'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Montagem Mecânica da Estrutura de Pesagem', '99999999-9999-9999-9999-999999999903', '2026-06-30', 'Fixação das células de carga e montagem do quadro elétrico de comando na estrutura principal em aço inox.', '16 hours', '14 hours 45 minutes', '2026-06-28', '08:30:00', '2026-06-29', '17:30:00', 'Montagem efetuada com sucesso. Células calibradas inicialmente com pesos padrão de 5kg e 10kg.', FALSE, '2026-06-20T09:15:00Z'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'Configuração da Câmara Cognex e Algoritmo OCR', '99999999-9999-9999-9999-999999999901', '2026-07-25', 'Configuração de lentes, focagem, filtros de col polarizadores e criação da rotina de deteção de presença/ausência de tampa na ferramenta Cognex In-Sight Explorer.', '12 hours', '0 hours', NULL, NULL, NULL, NULL, 'Aguarda chegada das amostras físicas de garrafas pelo cliente LactNorte para testes de reflexão de luz.', FALSE, '2026-06-25T11:00:00Z');

-- 17. Seed task_assignees
INSERT INTO task_assignees (task_id, user_id) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba', '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111113'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', '11111111-1111-1111-1111-111111111112');

-- 18. Seed comments
INSERT INTO comments (id, project_id, author_id, comment, created_at) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111112', 'Reunião com o parceiro TSMaq correu muito bem. Confirmaram que entregam a impressora Zebra no nosso armazém até ao fim desta semana.', '2026-07-05T14:22:00Z'),
('cccccccc-cccc-cccc-cccc-cccccccccccd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111113', 'Células de carga calibradas com sucesso. Desvio linear está abaixo de 0.1%. Pronto para testes dinâmicos.', '2026-07-08T16:45:00Z');

-- 19. Seed user_absences
INSERT INTO user_absences (id, user_id, absence_start_date, absence_end_date, reason, created_at) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111113', '2026-07-20', '2026-07-24', 'Vacation', '2026-06-10T09:00:00Z'),
('dddddddd-dddd-dddd-dddd-ddddddddddde', '11111111-1111-1111-1111-111111111112', '2026-07-12', '2026-07-13', 'Sick leave', '2026-07-11T18:00:00Z');

-- 20. Seed app_configuration
INSERT INTO app_configuration (id, app_name, app_description, footer_text, logo_url) VALUES
('33333333-4444-5555-6666-777777777777', 'Gestão de Projetos e ERP', 'Plataforma integrada de planeamento, orçamentação e controlo de projetos industriais.', '© 2026 Gestão de Projetos e ERP. Todos os direitos reservados.', '');

-- 21. Seed material
INSERT INTO material (id, name, reference, manufacturer_reference, unit, unit_cost, supplier, deleted, created_at) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'Módulo PLC Siemens S7-1200', '6ES7214-1AG40-0XB0', 'Siemens CPU 1214C', 'pcs', 350.00, 'FFonseca', FALSE, '2026-01-15T09:00:00Z'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'Cabo de Rede Ethernet Cat6 LSZH', 'CAB-ETH-CAT6-100', 'General Cable', 'm', 1.25, 'FFonseca', FALSE, '2026-01-15T09:10:00Z'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3', 'Célula de Carga 50kg Inox', 'HBM-PW15AH-50KG', 'HBM LoadCells', 'pcs', 185.00, 'Dibal', FALSE, '2026-01-20T11:00:00Z'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4', 'Câmara de Visão Artificial 5MP', 'COGNEX-ISM8402', 'Cognex In-Sight', 'pcs', 1450.00, 'Inovasense', FALSE, '2026-01-22T14:30:00Z'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'Impressora Aplicadora de Etiquetas Industrial', 'ZEBRA-ZE511', 'Zebra Technologies', 'pcs', 3200.00, 'TSMaq', FALSE, '2026-02-01T10:00:00Z');

-- 22. Seed quotes
INSERT INTO quotes (id, project_id, status, version, total_value, valid_until, responsible_id, deleted, created_at) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approved', 1, 5625.00, '2026-06-15', '11111111-1111-1111-1111-111111111114', FALSE, '2026-04-10T10:00:00Z'),
('ffffffff-ffff-ffff-ffff-fffffffffffa', NULL, 'Draft', 1, 1450.00, '2026-08-30', '11111111-1111-1111-1111-111111111114', FALSE, '2026-07-01T15:00:00Z');

-- 23. Seed bill_of_materials
INSERT INTO bill_of_materials (id, quote_id, material_id, quantity, deleted, created_at) VALUES
('11111111-2222-3333-4444-555555555551', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 1, FALSE, '2026-04-10T10:15:00Z'),
('11111111-2222-3333-4444-555555555552', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 100, FALSE, '2026-04-10T10:16:00Z'),
('11111111-2222-3333-4444-555555555553', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3', 4, FALSE, '2026-04-10T10:17:00Z'),
('11111111-2222-3333-4444-555555555554', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 1, FALSE, '2026-04-10T10:18:00Z'),
('11111111-2222-3333-4444-555555555555', 'ffffffff-ffff-ffff-ffff-fffffffffffa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4', 1, FALSE, '2026-07-01T15:10:00Z');

-- 24. Seed equipment
INSERT INTO equipment (id, serial_number, brand, model, project_id, status, installation_date, deleted, created_at) VALUES
('22222222-1111-4444-3333-999999999991', 'EQ-SN-99120', 'Dibal', 'Dibal LS-4000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Active', '2026-06-29', FALSE, '2026-06-29T11:00:00Z'),
('22222222-1111-4444-3333-999999999992', 'EQ-SN-10294', 'Cognex', 'In-Sight 8402', NULL, 'Inactive', NULL, FALSE, '2026-07-05T09:00:00Z');


-- ============================================================================
-- SEGURANÇA: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_risk_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_priority_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_category_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_teams_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_partners_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE material ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_tasks ENABLE ROW LEVEL SECURITY;

-- Criação de Políticas Permissivas para Desenvolvimento (acesso total para utilizadores autenticados)
CREATE POLICY "Full access to auth users on user_groups" ON user_groups FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_status" ON project_status FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_category" ON project_category FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_risk" ON project_risk FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_priority" ON project_priority FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_teams" ON project_teams FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_partners" ON project_partners FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on task_status" ON task_status FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on users" ON users FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on clients" ON clients FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on projects" ON projects FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_risk_link" ON project_risk_link FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_priority_link" ON project_priority_link FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_category_link" ON project_category_link FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_teams_link" ON project_teams_link FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on project_partners_link" ON project_partners_link FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on tasks" ON tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on task_assignees" ON task_assignees FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on comments" ON comments FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on user_absences" ON user_absences FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on app_configuration" ON app_configuration FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on material" ON material FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on quotes" ON quotes FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on bill_of_materials" ON bill_of_materials FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on equipment" ON equipment FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on special_days" ON special_days FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access to auth users on default_tasks" ON default_tasks FOR ALL TO authenticated USING (true);
