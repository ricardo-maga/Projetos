-- Migration 003: Roles and Granular RBAC Permissions
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    module TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed Core System Roles
INSERT INTO roles (id, code, name, description) VALUES
('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Super Administrador', 'Acesso total e irrestrito a todo o sistema e parametrizações'),
('00000000-0000-0000-0000-000000000002', 'ADMIN', 'Administrador', 'Gestão global de projetos, tarefas, utilizadores e configurações'),
('00000000-0000-0000-0000-000000000003', 'PROJECT_MANAGER', 'Gestor de Projetos', 'Criação e gestão de projetos, tarefas e equipas'),
('00000000-0000-0000-0000-000000000004', 'TECHNICIAN', 'Técnico / Equipa', 'Visualização de projetos e atualização de tarefas atribuídas'),
('00000000-0000-0000-0000-000000000005', 'VIEWER', 'Visualizador', 'Acesso apenas de leitura aos dados autorizados')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Seed Standard Permissions
INSERT INTO permissions (code, module, description) VALUES
('projects:read', 'projects', 'Visualizar projetos'),
('projects:write', 'projects', 'Criar e editar projetos'),
('projects:delete', 'projects', 'Eliminar projetos'),
('tasks:read', 'tasks', 'Visualizar tarefas'),
('tasks:write', 'tasks', 'Criar e editar tarefas'),
('tasks:delete', 'tasks', 'Eliminar tarefas'),
('clients:read', 'clients', 'Visualizar clientes'),
('clients:write', 'clients', 'Criar e editar clientes'),
('clients:delete', 'clients', 'Eliminar clientes'),
('admin:access', 'admin', 'Aceder à área administrativa'),
('config:manage', 'config', 'Gerir configurações globais do ERP')
ON CONFLICT (code) DO NOTHING;
