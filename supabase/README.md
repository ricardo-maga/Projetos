# Guia de Transição para Base de Dados Supabase (PostgreSQL)

Este diretório contém o script SQL e as diretrizes completas para migrar a estrutura de dados atual em memória do ERP/Gestor de Projetos para uma base de dados na cloud **Supabase** (PostgreSQL).

---

## 📂 Ficheiros Disponíveis
- `schema.sql`: Script completo de DDL (criação de tabelas com chaves primárias, estrangeiras e RLS) e DML (seed/importação de todos os dados de demonstração atuais de forma fidedigna).

---

## 🚀 Como Configurar no Supabase

1. **Criar Conta e Projeto**:
   - Vá a [Supabase](https://supabase.com) e crie um projeto.
   - Guarde a palavra-passe da base de dados e anote o **Project URL** e a **API Anon Key**.

2. **Executar o Script SQL**:
   - No painel lateral do Supabase, clique em **SQL Editor** (ícone `SQL`).
   - Clique em **New Query** (Nova consulta).
   - Abra o ficheiro `/supabase/schema.sql` deste projeto, copie todo o conteúdo e cole-o no SQL Editor do Supabase.
   - Clique em **Run** (Executar).
   - *Sucesso!* Todas as tabelas, relacionamentos, políticas de segurança e dados de demonstração serão provisionados instantaneamente.

---

## 🛠️ Conectar a Aplicação Next.js ao Supabase

### 1. Instalar a Dependência Oficial
No terminal do projeto, execute o seguinte comando para adicionar o cliente oficial do Supabase:
```bash
npm install @supabase/supabase-js
```

### 2. Adicionar as Variáveis de Ambiente
No seu ficheiro `.env` ou `.env.local`, adicione as credenciais obtidas no painel do Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-id-de-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica-anonima
```

### 3. Criar o Cliente Supabase em Código
Crie um ficheiro em `lib/supabaseClient.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## 🔄 Mapeamento e Sincronização em `useERP.ts`

Para substituir o `localStorage` por queries diretas à base de dados, poderá ajustar o hook `useERP.ts` para ler e gravar diretamente nas tabelas usando o cliente `supabase`.

### Exemplo de Carregamento de Dados (Fetch)
```typescript
import { supabase } from '../lib/supabaseClient';

// Exemplo de como carregar os projetos no useEffect:
const fetchProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('deleted', false)
    .order('created_date', { ascending: false });

  if (!error && data) {
    // Nota: Como o Postgres retorna snake_case por defeito nas colunas,
    // pode mapear os campos ou simplesmente ler os dados correspondentes.
    setProjects(data);
  }
};
```

### Exemplo de Criação de Registo (Insert)
```typescript
const addProject = async (newProject) => {
  const { data, error } = await supabase
    .from('projects')
    .insert([
      {
        title: newProject.title,
        description: newProject.description,
        client_id: newProject.clientId,
        category_id: newProject.categoryId,
        status_id: newProject.statusId,
        project_manager_id: newProject.projectManagerId,
        // ... restantes campos mapeados
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar projeto:', error);
  } else {
    // Atualizar estado local do React
    setProjects(prev => [data, ...prev]);
  }
};
```

---

## 🛡️ Segurança e Row Level Security (RLS)

O script `schema.sql` ativa o **Row Level Security (RLS)** por omissão em todas as tabelas e cria políticas permissivas que exigem que o utilizador esteja autenticado (`authenticated`).

Quando implementar a autenticação do Supabase (por exemplo, login por email/password ou OAuth), as políticas garantirão que apenas utilizadores legítimos possam ver ou modificar os dados do seu ERP.
