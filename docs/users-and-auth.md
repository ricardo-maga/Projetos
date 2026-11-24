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

## Gestão de contas privilegiadas

A edição administrativa de credenciais e a ativação de perfis existentes exigem `users.credentials.manage`, inicialmente atribuída só a `SUPER_ADMIN`. Editar ou eliminar outra conta `ADMIN`, `SUPER_ADMIN` ou com `is_admin` exige também `roles.manage`. A palavra-passe da própria conta é alterada nas definições do perfil, com verificação da palavra-passe atual. Os pedidos de edição idênticos ao estado atual não escrevem dados.

O sync legado aceita perfis apenas para leitura. A edição e a eliminação usam a API de contas, que protege a própria conta contra eliminação e impede que a edição, a eliminação ou a alteração de funções retire o último Super Administrador elegível.

Aplicar a migração `20261124102000_protect_privileged_accounts` antes de publicar código que use os novos RPCs. Validar em staging com perfis de teste dedicados.

Uma falha ambígua do Auth pode deixar uma reserva em `private.user_profile_changes`. O registo contém o perfil, o operador, o identificador da operação e a data. Antes de libertar uma reserva, confirmar que a execução terminou e reconciliar o perfil com o estado da conta Auth. O identificador da operação deve corresponder ao da reserva que se pretende libertar. A auditoria da aplicação regista falhas parciais, autor, alvo e nomes dos campos alterados.
