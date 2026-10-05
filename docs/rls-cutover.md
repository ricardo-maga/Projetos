# Proposta RLS — acesso às 40 tabelas exclusivamente pelo backend

Estado: **aplicada e testada apenas em staging; produção bloqueada**.
Resumo atual: contenção/concorrência/regressão concluídas com findings em staging;
Preparação posterior dos cinco pontos em `docs/production-readiness.md`: tipos
runtime/build validados, backup restaurado e cutover ensaiado offline. Não iniciar
promoção sem acesso Vercel confirmado e fecho da limitação Auth do plano Free.
ver «Fecho das fases em staging» abaixo para resultados e ordem de promoção.
Os parágrafos intermédios registam etapas anteriores, não pendentes atuais.
Revisão adicional: sync não-admin remove todas as referências administrativas;
ausências falham fechado em erro de consulta e branding omitido não é gravado.
10 testes focados passaram. Nova regressão parcial confirmou bloqueios do sync,
mas não concluiu: conta viewer foi entretanto configurada como Gestor de Projeto.
Role existente preservado. Não interpretar a nova execução como PASS integral.
Atualização posterior autorizada: conta viewer reposta como Visualizador,
sem privilégio administrativo; regressão de API repetida com 32 verificações
aprovadas. Bloqueio de produção mantém-se para os restantes riscos do sync.
Revisão subsequente: permissões canónicas por domínio antes da primeira escrita,
remoção de dados unchanged e das quatro eliminações por omissão no writer.
38 verificações API/13 testes focados aprovados; suite global 897 pass/62 fail/
1 error. Ver staging-local.md para impactos e riscos ainda pendentes.
Em 2026-10-05: zero tabelas públicas sem RLS, 40 políticas restritivas,
seis RPCs de mutação acessíveis apenas pelo backend. Corpos/OCC não alterados.
23 testes reais de API passaram antes/depois; 24 acessos diretos foram recusados
com 42501. O teste usa SELECT * porque task_assignees não tem coluna id.
Não houve alteração de tabelas/dados de produção nesta etapa.
Falta revisão integral do payload de sync e regressão dos restantes domínios.
Avisos residuais do advisor: 8 search_path mutáveis, btree_gist em public,
helpers SECURITY DEFINER acessíveis (2 anon/3 authenticated) e proteção contra
passwords comprometidas desativada. Não revogar helpers cegamente.
Código local em preparação: rotas de sync/tickets/project-materials injetam agora
um cliente administrativo explícito; o writer não faz fallback para chave pública.
Auditoria de browser passa por `/api/audit`: leitura com `admin:access`, eventos
de cliente rotulados `CLIENT_EVENT` e identidade derivada da sessão. Logger de
servidor usa as colunas reais de audit_logs e não faz fallback público.
Ainda falta revisão integral das permissões de payload do sync e testes funcionais
dos restantes domínios. Estes avanços NÃO autorizam o cutover de produção.
Validação desta iteração: 7 testes focados passaram; lint passou; suite global
883 pass / 59 fail / 1 error. Typecheck global falhou. Build interrompido após
permanecer na compilação sem resultado; não confirmado. Não publicado.
Após autorização explícita, staging recebeu 229 registos em 12 tabelas:
roles, permissions, role_permissions, project_status, task_status, task_types,
project_priority, project_risk, project_category, risk_categories, risk_priorities,
risk_statuses. Contagens e hashes do conteúdo coincidem com produção.
Utilizadores/Auth e dados operacionais não foram copiados. Produção foi apenas
consultada nesta transferência. A proposta RLS foi aplicada apenas em staging.
O relatório fornecido contém 40 tabelas: authenticated tem grants em todas;
anon tem grants em 35 (não em clients, project_materials, projects, task_assignees, tasks).

## Antes de aplicar

1. Fazer backup e guardar schema/ACL/políticas atuais (por exemplo schema-only dump
   com ferramenta PostgreSQL apropriada). Executar/exportar `supabase/security-drafts/20261005_rls_preflight.sql`.
   O inventário é mais amplo que a alteração, intencionalmente.
2. Corrigir `saveActiveStateToSupabase` em `lib/supabaseSync.ts`: atualmente utiliza
   cliente público mesmo em chamadas do servidor. Injetar cliente administrativo
   validado nos handlers de sync, tickets, inbound e project-materials, sem importar
   módulos server-only para bundles de browser. Falhar fechado sem service key.
   Não basta alterar só o cliente de leitura de `/api/supabase/sync`.
3. Remover acessos diretos a audit_logs do browser: `fetchAuditLogsFromSupabase`
   e `logAuditEventToSupabase`, utilizados em AuditLogSection, useERP e page.
   Leitura exige endpoint autenticado e permissão de auditoria; escrita deve
   derivar identidade no servidor, não aceitar user_id arbitrário do browser.
   Rever também fallback público de `lib/audit.ts`.
4. Rever todas as APIs que utilizam service_role: autenticação, RBAC, isolamento
   por entidade e payload permitido. Service role contorna RLS; estas políticas
   não substituem autorização no servidor. Confirmar configuração da chave apenas
   no servidor, nunca NEXT_PUBLIC nem frontend.
5. Rever RPCs SECURITY DEFINER, views, grants herdados, sequences e default ACLs
   do preflight. RPC acessível que exponha dados sem autorização continua sendo
   um bypass mesmo depois desta proposta. Não revogar todas as RPCs cegamente:
   preservar has_permission, update_task_atomic e demais contratos autorizados.
6. Testar uma cópia staging com os mesmos roles/grants e dados representativos.
   Não usar o utilizador eliminado ricardo75@gmail.com em testes.

## O que o SQL faz

Transação única e lista explícita das 40 tabelas reportadas. Ativa RLS; revoga
grants de tabela e de coluna de PUBLIC/anon/authenticated, incluindo TRUNCATE,
REFERENCES e TRIGGER. Adiciona política RESTRICTIVE false para os dois roles de
API, conservando políticas antigas para rastreabilidade. Garante DML a
service_role sem revogar os seus privilégios existentes. A operação administrativa
de auditoria continua possível; não é uma política append-only para service_role.
Falha integralmente perante tabela ausente, role inesperado ou grants efetivos
residuais herdados. Não altera FORCE RLS, proprietários, dados, SQL de negócio,
auth, storage, app_configuration, RPCs ou default privileges.

Não protege automaticamente futuras tabelas, partições expostas separadamente,
views ou funções. Auditar essas superfícies e tornar a verificação recorrente.
`erp_projects` e `erp_tasks` são protegidas sem presumir que podem ser apagadas.

## Aplicação controlada

Após TODOS os pré-requisitos, inserir a linha de aprovação comentada no próprio
SQL, depois de BEGIN. Não executar SET LOCAL separadamente. O bloqueio é uma
confirmação manual, não uma prova automática de que o backend está corrigido.
Executar primeiro em staging; só então promover para migrations e produção.
Lock timeout/statement timeout causam rollback; rever contenção antes de repetir.

## Verificação e regressão

- Reexecutar inventário: as 40 tabelas com relrowsecurity=true, grants diretos de
  browser removidos e política restritiva presente. Confirmar também privilégios
  efetivos com has_table_privilege e has_any_column_privilege.
- Com clientes reais anon/authenticated, tentativas de leitura/escrita direta
  devem ser negadas. Não testar como postgres/owner ou service_role.
- APIs autorizadas: login, sessão restaurada, branding público, listagens,
  criação/edição de tarefas e OCC, responsáveis, projetos, comentários associados,
  riscos, tickets/inbound, material, configurações, notificações e auditoria.
- APIs sem sessão/sem permissão devem continuar recusadas. Confirmar que nenhuma
  view/RPC acessível recupera ou altera dados indevidamente.
- Testar escritas apenas em staging, verificar na base de dados e limpar fixtures
  pelo fluxo normal. Não declarar sucesso de produção a partir de testes estáticos.

## Recuperação

Erro antes de COMMIT: ROLLBACK completo. Após COMMIT, priorizar correção do backend.
Se indispensável restaurar, usar o backup exato de RLS/ACL/políticas de cada tabela,
em transação revista, removendo apenas a política criada nesta proposta e
restaurando os grants originais necessários. Não fornecer rollback genérico que
desligue RLS ou conceda acesso público a dados sensíveis.

## Fecho das fases em staging — 2026-10-05

Estado: PASS WITH FINDINGS em staging; NÃO é aprovação de cutover em produção.
Os pré-requisitos de backend/auditoria acima foram implementados e exercitados.
O relatório cronológico e as ressalvas estão em `docs/staging-local.md`.
Produção ProjectTool (`lydxxrzbytfzrsuxptsm`) e GitHub não foram modificados.

### Ordem de promoção proposta (exige autorização e janela de manutenção)

1. Rever diff e findings; identificar o commit exato a publicar. Não incluir
   credenciais, `.staging-transfer`, caches, `.temp/linked-project.json` ou
   artefactos gerados. Confirmar chaves service-role apenas no servidor.
2. Fazer backup de dados/schema/ACL/políticas/funções e verificar recuperação.
   Executar o preflight em produção sem mutações. Comparar corpos e assinaturas
   das RPCs, extensão e histórico de migrations com staging. Não executar
   `supabase db push` indiscriminadamente: o schema copiado e os SQL aprovados
   manualmente não provam alinhamento do histórico de produção.
3. Suspender temporariamente escritas, incluindo inbound/jobs e sessões antigas.
   Preparar o backend compatível; não abrir tráfego enquanto código e schema
   forem incompatíveis. Confirmar ausência de operações concorrentes pendentes.
4. Aplicar, por ordem, as migrations:
   - `20261005160525_legacy_atomic_writes.sql`;
   - `20261005161953_security_function_hardening.sql`;
   - `20261005162756_legacy_conflict_http_status.sql`.
   A terceira é OBRIGATÓRIA antes de permitir qualquer writer: converte o conflito
   funcional de `40001` para `PT409`, evitando retries infinitos do PostgREST 14.
   Executar através do mecanismo de migrations controlado, validar conclusão
   integral e registar as versões efetivas. Se qualquer passo falhar, manter a
   janela fechada e rever o erro; não continuar para RLS ou abrir tráfego parcial.
5. Publicar o backend revisto e verificar login/sessão/branding, leitura e API.
   Aplicar `security-drafts/20261005_backend_only_rls.sql` e
   `security-drafts/20261005_backend_rpc_access.sql` com o approval guard inserido
   em CADA transação. Os dois drafts já foram exercitados em staging; conservam
   o bloqueio explícito para evitar uma execução acidental em produção.
6. Revalidar inventário RLS/ACL, chamadas anon/authenticated (incluindo novas RPCs),
   advisors e smoke tests autorizados. Só reabrir escritas após sucesso.
   Não executar scripts de fixtures staging em produção: recusam esse destino.
7. Monitorizar 401/403/409/5xx, conflitos, referências de comentários/riscos e
   numeração dos tickets. Falha operacional não justifica desligar RLS ou
   devolver service-role ao browser; usar o procedimento de recuperação acima.

### Alterações e decisões registadas

- 28 tabelas legadas ganham revisão `sync_version` e trigger. A nova RPC recebe
  apenas linhas alteradas; valida a revisão e grava todo o lote numa transação.
- Projects/Tasks continuam no boundary canónico, com `p_update_*`, assignees e
  versionamento existentes. Quatro RPCs passam a bloquear a linha antes de OCC;
  corrige uma corrida real sem reimplementar regras de negócio.
- Numeração de tickets usa a sequência existente; gaps são normais e permitidos.
- 55 tabelas públicas em staging têm RLS ativo, sem FORCE RLS novo.
- Três helpers SECURITY DEFINER autenticados são mantidos por necessidade das
  políticas existentes; identidade deriva de `auth.uid()`. O aviso do advisor
  deve permanecer documentado, não ser silenciado revogando helpers cegamente.
- Leaked-password protection continua desligada. Rever disponibilidade/plano
  e ativação em Auth antes do fecho de segurança de produção.
- Build passa, mas a configuração existente ignora tipos; o typecheck independente
  tem findings fora deste âmbito. Não tratar build como prova de ausência deles.

Referências: https://supabase.com/docs/guides/database/postgres/row-level-security
e https://www.postgresql.org/docs/current/ddl-rowsecurity.html.
