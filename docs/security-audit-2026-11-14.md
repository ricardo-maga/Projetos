# Auditoria de segurança — 2026-11-14

## Âmbito e resultado

Auditoria ao checkout `codex/security-audit-hardening`, às rotas `/api`, aos schemas de entrada, ao bundle cliente compilado e aos projetos Supabase de produção (`lydxxrzbytfzrsuxptsm`) e staging (`caaiydcycrnwcqefdldz`). A aplicação usa Supabase Auth e RBAC no servidor. Não há chamadas de IA ou pagamentos no código atual; por isso não há chave desses fornecedores ou orçamento de IA para migrar.

O único ficheiro `.env*` versionado é `.env.example`, sem valores. O `.gitignore` exclui `.env*` e abre apenas esse exemplo. A pesquisa do código, histórico Git e bundle atual não confirmou uma credencial secreta ainda exposta. **Histórico relevante:** `docs/production-readiness.md` regista uma chave legacy `service_role` exposta num bundle público anterior. O mesmo registo documenta a substituição da variável pública pela publishable key, a desativação da chave legacy e uma chamada real que devolveu `401`. Não reativar essa chave. A presente auditoria não encontrou nova exposição que exija outra revogação.

## Base de dados e acesso

| Ambiente | Tabelas `public` | Sem RLS | Sem política | Grants `anon` em tabelas |
| --- | ---: | ---: | ---: | ---: |
| Produção | 67 | 0 | 15 | 0 |
| Staging | 71 | 0 | 19 | 0 |

As tabelas sem política continuam fechadas ao acesso direto; não foi criada política genérica que pudesse expor dados partilhados. Em ambos os ambientes, `authenticated` tem grants em apenas `permissions` e `role_permissions`, sujeitos a RLS. Não foi necessária migração nem foi alterada a base de produção ou staging nesta auditoria.

Tabelas sem política em produção: `api_idempotency`, `api_integrations`, `calendar_feed_tokens`, `mechanical_design_details`, `mechanical_design_other_managers`, `presales_assets`, `presales_details`, `presales_document_revisions`, `presales_document_templates`, `presales_items`, `presales_origins`, `work_request_events`, `work_request_tasks`, `work_requests`, `work_task_events`.

Tabelas sem política em staging: `automation_executions`, `calendar_feed_tokens`, `client_sites`, `mechanical_design_details`, `mechanical_design_other_managers`, `presales_assets`, `presales_details`, `presales_document_revisions`, `presales_document_templates`, `presales_items`, `presales_origins`, `project_task_requirement_events`, `project_task_requirement_state`, `project_task_requirements`, `task_plan_blocks`, `work_request_events`, `work_request_tasks`, `work_requests`, `work_task_events`.

## Rotas e medidas

As rotas de negócio exigem Supabase Auth e verificam a permissão no servidor. Exceções intencionais: login, registo e recuperação de password; bootstrap condicionado ao segredo de instalação e desativado em produção; branding público em `/api/supabase/config`; descrições OpenAPI; logout e consulta de sessão; feeds de calendário por token; MCP por bearer e allowlist; integrações v1 por chave de integração. Os tokens de feeds, MCP e integrações têm limites próprios além do limite geral por IP.

O middleware valida URL, query e tamanho real do corpo antes de encaminhar a rota. O limitador atómico Supabase aplica 600 pedidos/minuto por IP a `/api`, 120/minuto adicionais a v1, e 240 leituras ou 60 escritas/minuto por utilizador autenticado. Login, registo e recuperação mantêm limites mais baixos. Rejeições devolvem `429` e `Retry-After`; indisponibilidade do armazenamento de limites devolve `503`.

Os schemas foram limitados para nomes, descrições, emails, listas, pesquisas e identificadores. As expressões `.or()` de pesquisa passam a citar e escapar texto do utilizador. Uploads de imagens Presales verificam assinatura PNG/JPEG/WebP, tamanho e nome; downloads rejeitam formatos inconsistentes. O logótipo SVG é apresentado como imagem, sem inserir HTML na árvore da página. O módulo JWT de sessão próprio, sem utilização, foi removido. O bootstrap não reutiliza perfis existentes ou eliminados. A conta `ricardo75@gmail.com` permaneceu eliminada e não foi usada.

## Verificações

- `npm run typecheck:app`, `npm run build`, `npm run check:migrations`, `npm run check:openapi` e `git diff --check`: passaram.
- `npm run test:ci`: 1077 testes executados, 0 falhas novas face à baseline.
- `node tests/security-hardening.test.mjs`: 7 testes passaram, incluindo pesquisa, IDs, assinaturas de imagem, SVG, HTML de comentários, IP e resposta de quota.
- `npm audit --json`: 0 vulnerabilidades em 680 dependências.
- Staging local: branding `200`; projetos/tarefas sem sessão `401`; pesquisa com carácter de controlo `400`; 10 logins fictícios inválidos `401` e o 11.º `429` com `Retry-After: 60`.
- Staging autenticado: sessões temporárias em memória para `admin.staging@example.com` e `viewer.staging@example.com`, sem redefinir passwords; ambos leram perfil, projetos e tarefas (`200`); auditoria `200` para admin e `403` para viewer; escrita de projeto pelo viewer `403`; leitura direta da tabela `projects` recusada com `42501` para ambos. As sessões foram terminadas após as verificações.

## Pendentes antes de publicar

Esta versão não teve teste de escrita administrativa, upload autorizado ou UI completa em staging. Confirmar esses fluxos e a configuração do preview antes de promover. A branch atual não tem variáveis Vercel próprias: um preview normal herdaria as variáveis de produção. Não usar esse preview para testes de escrita até o associar explicitamente ao Supabase de staging.

Os avisos de segurança Supabase continuam a indicar `Leaked Password Protection Disabled` em produção e staging. A proteção requer um plano que a disponibilize; a decisão anterior foi manter o plano Free. Ativar se o plano mudar. Sem funcionalidade de IA, não existe orçamento de créditos a configurar.
