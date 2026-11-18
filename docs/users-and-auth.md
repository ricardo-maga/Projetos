# Utilizadores e autenticação

## Fonte de verdade

- `auth.users` é gerida pelo Supabase Auth. Criação, login e mudança de password passam pelas APIs Auth. A aplicação nunca grava passwords nem hashes próprios em `public.users`.
- `public.users` é o perfil da aplicação. `auth_user_id` liga-o à conta Auth. O login só aceita perfis ligados, aprovados, não eliminados e não externos.
- `public.user_roles`, `roles`, `role_permissions` e `permissions` definem as permissões. `role_id` e `is_admin` em `public.users` ainda são usados por compatibilidade; não os remover sem migrar todos os consumidores.

## Colunas de `public.users`

| Coluna | Utilização atual |
| --- | --- |
| `id` | Identificador interno e referências das entidades da aplicação |
| `auth_user_id` | Ligação à conta Auth; nulo nos perfis históricos sem login |
| `name`, `email`, `type` | Diretório, apresentação e restrição de contas externas |
| `approved`, `deleted` | Portas de acesso e estado do perfil |
| `role_id`, `is_admin` | Compatibilidade com a autorização e interfaces existentes |
| `created_at` | Histórico de criação |
| `sync_version` | Controlo de concorrência da sincronização legada |

Não existe coluna `password` em `public.users`. O SQL legado que a recriava foi removido.

## Utilizadores sem acesso

Na criação administrativa, a password é opcional. Sem password, é criado apenas o perfil em `public.users`, com `auth_user_id` nulo, mantendo a atribuição de funções. Não é criada uma conta Auth nem enviado um convite. O perfil pode ser usado nas associações da aplicação, mas não permite login.

Os dados de um perfil sem Auth podem ser editados sem definir password; isso mantém o utilizador sem acesso. Uma password vazia na criação ou edição equivale a não fornecer password. Para contas já ligadas, deixar a password em branco mantém a atual.

## Ativação de perfis sem Auth

O formulário de edição assinala os perfis sem `auth_user_id`. Para ativar um, o administrador define uma password de pelo menos 12 caracteres e mantém inicialmente o email existente. A API cria a conta Auth, liga-a ao perfil e preserva o `id` interno, as funções e as referências existentes. Se o email já pertencer a outra conta Auth, a operação falha e exige análise individual. Não associar contas apenas por coincidência de nomes nem gerar passwords em lote.

Depois de ativar cada perfil, confirmar o login com a pessoa responsável pela conta e verificar as funções atribuídas. Não usar contas marcadas como `deleted` para esta validação.
