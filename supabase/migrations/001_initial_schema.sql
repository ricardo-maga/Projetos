-- Migration 001: Initial Schema Baseline
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS user_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL DEFAULT 'Team',
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
    approved BOOLEAN DEFAULT FALSE,
    deleted BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    notes TEXT,
    color TEXT DEFAULT '#3b82f6',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    install_project_no TEXT,
    project_title TEXT NOT NULL,
    description TEXT,
    status_id TEXT,
    category_id TEXT,
    priority_id TEXT,
    risk_id TEXT,
    project_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_date DATE,
    delivery_date DATE,
    scheduled_date DATE,
    completed_date DATE,
    is_urgent BOOLEAN DEFAULT FALSE,
    color TEXT,
    notes TEXT,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_title TEXT NOT NULL,
    task_description TEXT,
    status_id TEXT,
    task_type_id TEXT,
    estimated_hours INTERVAL DEFAULT '0 hours',
    actual_hours INTERVAL DEFAULT '0 hours',
    start_date DATE,
    start_time TIME,
    end_date DATE,
    end_time TIME,
    estimated_date DATE,
    completed_date DATE,
    notes TEXT,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);
