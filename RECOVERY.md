# Manual de Recuperação de Acesso e Procedimentos de Emergência (ERP)

Este documento descreve os procedimentos operacionais de segurança para restabelecer o acesso ao sistema ERP em situações de contingência, bloqueio de credenciais, perda de acesso administrativo ou problemas de permissões.

---

## 1. Procedimento de Bootstrap Administrativo (Emergência)

Quando a aplicação é instalada de raiz ou quando **não existe nenhum administrador ativo** registado no sistema, o mecanismo de bootstrap seguro permite provisionar a primeira conta `SUPER_ADMIN`.

### Requisitos Prévios (Variáveis de Ambiente)
No painel de configuração / variáveis de ambiente (Secrets) do projeto:
- `ERP_BOOTSTRAP_ENABLED="true"`
- `ERP_BOOTSTRAP_SECRET="<GERAR_CHAVE_COM_MINIMO_32_CARACTERES_ALEATORIOS>"`
- `ERP_BOOTSTRAP_ADMIN_EMAIL="admin@empresa.pt"`
- `SUPABASE_SERVICE_ROLE_KEY="<chave_service_role_do_supabase>"`

### Execução do Bootstrap
Envie um pedido HTTP `POST` server-side para o endpoint `/api/auth/bootstrap`:

```bash
curl -X POST https://seu-dominio.com/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<VALOR_EXATO_DE_ERP_BOOTSTRAP_SECRET>",
    "adminEmail": "admin@empresa.pt",
    "adminPassword": "<PASSWORD_SEGURA_MINIMO_8_CHARS>",
    "adminName": "Administrador Principal"
  }'
```

### Regras de Segurança do Bootstrap:
1. **One-Time / Desativação Automática**: O bootstrap recusa a operação (retorna `403 Forbidden`) se já existir um administrador ativo no sistema.
2. **Proteção de Força Bruta**: Rate limiting estrito (máximo 5 tentativas por IP por hora).
3. **Comparação Segura**: O secret é validado com `crypto.timingSafeEqual` para mitigar ataques de timing.
4. **Desativação Permanente**: Após a configuração do primeiro administrador, defina `ERP_BOOTSTRAP_ENABLED="false"` nas variáveis de ambiente.

---

## 2. Recuperação de Acesso via Consola Supabase

Se tiver acesso à consola Web do Supabase (`https://supabase.com/dashboard/project/<PROJECT_ID>`):

### Redefinição de Password de Utilizador
1. Aceda a **Authentication** > **Users**.
2. Localize o utilizador pelo email (ex: `ricardo.magalhaes@domino-portugal.com`).
3. Clique em **Actions** (`...`) > **Send password recovery** OU **Auto Confirm Email**.
4. Em alternativa, use a opção **Reset Password** para definir uma nova credencial temporária.

### Verificação de Permissão Administrativa na Base de Dados
No **SQL Editor** do Supabase, execute para verificar o estado do utilizador:

```sql
SELECT id, name, email, is_admin, approved, deleted, role_id 
FROM users 
WHERE email = 'ricardo.magalhaes@domino-portugal.com';
```

Para garantir que o utilizador tem permissões de administrador ativo:

```sql
UPDATE users 
SET is_admin = true, 
    approved = true, 
    deleted = false, 
    role_id = '00000000-0000-0000-0000-000000000001'
WHERE email = 'ricardo.magalhaes@domino-portugal.com';
```

---

## 3. Desbloqueio em Caso de Erro de Políticas RLS (Lockout)

Se alguma migração ou alteração de RLS bloquear inadvertidamente o acesso dos utilizadores:

1. No **SQL Editor** do Supabase, verifique as políticas ativas:
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
   FROM pg_policies 
   WHERE schemaname = 'public';
   ```

2. Para restaurar temporariamente o acesso autenticado a uma tabela durante manutenção de emergência:
   ```sql
   -- Exemplo para a tabela users
   DROP POLICY IF EXISTS "allow_auth_users_read" ON users;
   CREATE POLICY "allow_auth_users_read" ON users FOR SELECT TO authenticated USING (true);
   ```

3. Re-execute a migration segura correspondente localizada na pasta `supabase/migrations/004_rls_hardening.sql`.

---

## 4. Reset de Password Diretamente pela Aplicação

1. Na janela de login do ERP, clique em **"Recuperar Palavra-passe"**.
2. Introduza o endereço de email registado.
3. O sistema envia um link seguro com token PKCE para o email.
4. Ao clicar no link, o utilizador é redirecionado para `/auth/callback?next=/` onde pode definir a nova palavra-passe.

---

## 5. Auditoria de Ações Administrativas

Todas as ações críticas (início de sessão, alteração de privilégios, recuperação de acesso, bootstrap e modificação de permissões) são automaticamente registadas na tabela `audit_logs`:

```sql
SELECT created_at, action, user_id, ip, details 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 50;
```
As passwords, tokens, hashes e segredos são sanitizados e nunca gravados em texto ou log.
