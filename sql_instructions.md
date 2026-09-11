Para implementar as notificações no sistema de base de dados (Supabase/PostgreSQL), terás de usar os seguintes comandos SQL. Podes usar a aba "SQL Editor" na consola do Supabase:

```sql
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  days_before INT DEFAULT 0,
  target_group VARCHAR(50) NOT NULL -- 'all', 'allocated', 'managers'
);

INSERT INTO notification_settings (type, name, enabled, days_before, target_group) VALUES
('new_project', 'Novo Projeto', true, 0, 'all'),
('project_allocation', 'Alocação de utilizadores a projeto', true, 0, 'allocated'),
('task_allocation', 'Alocação de utilizador a tarefa', true, 0, 'allocated'),
('task_due_date', 'Data limite da tarefa (aviso prévio)', true, 2, 'allocated'),
('project_due_date', 'Prazo de entrega do projeto (aviso prévio)', true, 5, 'managers'),
('project_scheduled_date', 'Data agendada do projeto (aviso prévio)', true, 2, 'managers');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  link_url VARCHAR(255)
);
```

Na aplicação, acabei de criar o sistema de notificações in-app:
- Adicionei o sino de **Notificações** à barra de navegação no topo, para listar e marcar as notificações como lidas.
- Criei uma nova aba **Notificações** dentro de "Configurações", onde os gestores podem ativar ou desativar os vários tipos de notificação e decidir a antecedência (em dias) e o público alvo.
