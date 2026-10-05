# Staging local

Projeto exclusivo `caaiydcycrnwcqefdldz` / solprojetos-staging.
Produção não é alvo dos scripts. Iniciar com:

```powershell
node scripts/staging.mjs dev
```

Abrir http://127.0.0.1:3110. O launcher obtém chaves pelo CLI autenticado e
mantém-nas em memória, sem `.env` nem impressão de valores. Recusa ficheiros
dotenv locais para evitar mistura de ambientes; usa cache `.next-staging`.
Bootstrap está desativado e o segredo inbound é aleatório/não partilhado.

Fixtures: admin.staging@example.com (super-admin), viewer.staging@example.com
(viewer), 1 cliente, 1 projeto, 1 tarefa com 1 responsável. Tudo fictício.
Contas confirmadas via Auth API, sem emails. Não reutilizar utilizadores reais.
As passwords aleatórias estão em test-credentials.json numa pasta temporária
solprojetos-staging-* do Windows, fora de OneDrive/Git, com ACL restrita ao
utilizador corrente. O caminho exato foi indicado no relatório da execução.
Não partilhar nem publicar esse ficheiro. Se for eliminado pela limpeza do
Windows, redefinir apenas passwords de staging. O seed recusa contas existentes.

```powershell
$env:STAGING_CREDENTIALS_FILE='CAMINHO_LOCAL_DO_FICHEIRO'
node scripts/check-staging.mjs
```

23 verificações reais das APIs locais passaram, antes e depois do endurecimento: login, leitura de projetos e
tarefas por ambos os perfis, 401 sem sessão, 403 para escrita de projeto e
auditoria pelo viewer, leitura de auditoria pelo admin e identidade server-side
em CLIENT_EVENT. Login Supabase, RBAC e criação por create_task_atomic também
validados. Branding fictício SOLPROJETOS — STAGING confirmado na API pública.
CRUD de projetos/tarefas, rejeição OCC com 409, substituição de responsáveis e
soft-delete também passaram. Cookies/restauração, UI integral e sincronização
global ainda não validados; suite global/typecheck não estão verdes.

RLS foi ativado nas 40 tabelas da proposta apenas em staging; existem agora zero
tabelas públicas sem RLS e 40 políticas restritivas backend_only_no_direct_api.
As seis RPCs de mutação de projetos/tarefas são exclusivas de service_role.
24 tentativas reais de leitura/RPC direta foram negadas com 42501 (anon e duas
contas fictícias). Executar: node scripts/staging.mjs check-access.
Não adicionar dados reais nem publicar scripts como endpoints. Produção intacta.
Ainda falta rever autorização por campo no payload de sync: service_role
contorna RLS e não substitui RBAC. Este staging não constitui aprovação de produção.

## Revisão adicional do sync (2026-10-05)

Proteção não-admin ampliada a todas as 18 entidades administrativas/referências.
Branding omitido já não provoca escrita nem acesso a appConfig indefinido.
Falha de consulta das ausências de terceiros interrompe o pedido com 503,
antes de qualquer gravação. Payload não-objeto é recusado com 400.
10 testes focados passaram; lint sem erros ESLint, com aviso do Next sobre
patch do lockfile SWC (não foi corrigido nesta fase).
Em staging, seis payloads administrativos isolados foram recusados com 403,
array recusado com 400 e branding confirmado inalterado.
A repetição integral da regressão parou: viewer.staging@example.com tem agora
role Gestor de Projeto (...0003), não Visualizador (...0007), e projects:write=true.
Não redefinimos esse role. Os 23 testes anteriores continuam sendo evidência
da execução anterior, não uma aprovação desta nova execução.
Pendentes: autorização dos restantes domínios/snapshots mistos e cobertura de
eliminação por omissão. Produção não alterada; alterações locais não publicadas.

Após autorização explícita, viewer.staging@example.com foi reposto como
Visualizador (...0007), is_admin=false; projects:write=false confirmado por RPC.
A repetição de scripts/check-staging.mjs concluiu com 32 verificações aprovadas,
incluindo os bloqueios novos do sync, branding, CRUD/OCC e responsáveis.
Os registos QA foram removidos por soft-delete nas APIs. Nenhuma conta nova
foi criada; passwords e produção não foram alteradas. Isto não cobre ainda
os snapshots mistos nem todos os domínios da aplicação.

## Snapshots mistos — primeira proteção por domínio

Sync POST consulta estado canónico e has_permission antes da primeira escrita.
Dez coleções operacionais têm permissões explícitas; linhas unchanged são
removidas do payload por comparação por ID. deleted exige também permissão delete.
Notificações próprias existentes podem alterar apenas isRead sem config:write.
Removida eliminação por omissão de comments, user_absences, special_days e
default_tasks no writer partilhado, inclusive nas chamadas dos outros handlers.
Impacto: retirar estes registos do snapshot já não os elimina. É necessário
comando explícito de eliminação autorizado, ainda não criado.
38 verificações de API passaram (seis payloads mistos recusados com 403);
13 testes focados passaram. Suite global: 897 pass, 62 fail, 1 error,
959 testes/70 ficheiros. Não demonstrado que todas as falhas são anteriores.
Lint passou antes do último ajuste de notificações, com aviso SWC do lockfile.
Build não executado nesta etapa. Não promover produção.
Pendentes: GET sync com projeção por permissão, autorização por entidade/autor,
relações dependentes de referências retiradas e regressão autorizada dos outros
domínios. Sync não é transacional nem tem OCC: a comparação não resolve a
concorrência de snapshots antigos. Produção/GitHub não alterados.

## Eliminações explícitas

DELETE /api/supabase/sync/entity suporta apenas comments, userAbsences,
specialDays e defaultTasks, com ID UUID único e permissões canónicas.
Configurações exigem config:write e admin:access; ausências exigem
absences:delete e, para não-admin, predicado user_id no próprio DELETE.
Comentários exigem projects:delete. Falta de sessão=401, permissão=403,
pedido inválido=400, inexistente/inacessível=404; erro de autorização=503.
useERP chama o endpoint e só altera a cache após confirmação. Confirmações
visuais existentes não foram removidas. Estas quatro ações não usam saveState.
19 verificações reais passaram, incluindo isolamento do ID e repetição 404;
15 testes focados passaram e lint passou (aviso SWC continua).
Foram criados e eliminados cinco registos QA, sem tocar nas fixtures base.
Eliminação física conforme comportamento legado; não é soft-delete recuperável.
O script check-staging-deletes.mjs requer preparação das cinco fixtures QA com
IDs 92000000-0000-4000-8000-000000000001 até 005; não recria dados automaticamente.
Primeira preparação falhou no CHECK de reason da ausência e teve rollback;
foi repetida omitindo reason, respeitando o schema existente.
Ainda pendente: projeção de leitura por permissões, auditoria das eliminações,
concorrência e testes de UI/roles intermédios. Produção/GitHub não alterados.

## Projeção de leitura do sync

GET /api/supabase/sync avalia has_permission para cada código de leitura usado
na projeção; erro de autorização devolve 503 sem resposta parcial com dados.
Coleções operacionais sem permissão são devolvidas como arrays vazios.
AutomationRules, auditLogs e notificationSettings exigem admin:access.
Notificações limitadas ao próprio destinatário ou userId=all, também para admins.
Passwords removidas sempre. Sem users:read, outros utilizadores são apenas um
diretório mínimo (id, nome, tipo, role, approved/deleted; email/data vazios).
Referências de estados/cores/grupos e configuração de apresentação continuam
disponíveis para permitir etiquetas e seleção de responsáveis existentes.
40 verificações de API em staging e 17 testes focados passaram; lint passou com
o aviso SWC conhecido. Testes unitários usam dados não vazios para recusas de
coleções e notificações de terceiros; dados reais de staging são fictícios.
GET continua a consultar o agregado completo no servidor antes de projetar a
resposta; não é um filtro SQL/RLS por utilizador. POST usa baseline interno,
não a projeção de apresentação. Outros endpoints precisam de revisão própria.
Suite global e build não repetidos nesta etapa; resultados anteriores não são
aprovação desta versão. Permanecem pendentes autorização por entidade/autor,
concorrência do sync e regressão de UI/dos restantes domínios. Produção intacta.

## Identidade dos comentários

Depois de projects:write e antes do writer, novos comentários recebem authorId
da sessão e createdDate do servidor. Autor diferente submetido é recusado com
403. Comentários existentes não podem trocar authorId/projectId; createdDate
original é preservada. Projetos associados devem existir e não estar eliminados.
Falha de consulta dos projetos interrompe antes da escrita com 503.
Writer preserva author_id mesmo sem users no snapshot, em vez de o tornar null.
A FK continua a validar a identidade; não houve SQL/migration nem mudanças em RLS.
46 verificações de API passaram, incluindo persistência real de autor/projeto/data
e recusa de troca de autor/projeto. 21 testes focados passaram, incluindo os
testes existentes de associação de comentários. Lint passou (aviso SWC residual).
Comentário QA eliminado explicitamente; projeto/tarefa QA por soft-delete.
Não corrigidos dados históricos/orfãos. Esta proteção não implementa OCC para
comentários nem resolve a corrida entre validação e upsert. Outros handlers que
chamam o writer partilhado precisam de auditoria independente. Não foram criadas
regras novas de acesso por equipa/projeto: aplica-se projects:write existente.
Suite global/build não repetidos nesta etapa; produção/GitHub não alterados.

## Regressão Tickets / materiais de projeto

POST /api/v1/tickets gera UUID imediatamente: ID devolvido é igual ao persistido
e usado em GET/PATCH/DELETE. Antes devolvia genId(tck) mas o writer persistia
stringToUUID(id), impossibilitando a leitura pelo ID devolvido.
PUT de materiais usa allowlist editável e preserva id/createdDate/deleted.
Materiais já eliminados não são editáveis. Não alterado schema/modelo de dados.
18 verificações reais de staging passaram: CRUD dos dois domínios, relações,
persistência, 401/403, soft-delete e campos protegidos ignorados no PUT.
23 testes focados passaram. Dois registos QA em cada execução positiva foram
soft-deleted via API; fixtures base não modificadas.
Servidor local apresentou 500 por EBUSY no .next-staging/static/chunks/webpack.js.
Foi parado e o cache movido (não apagado) para a pasta ignorada
.staging-transfer/next-staging-cache-20261005-recovery; servidor reiniciado em
3110, staging exclusivamente, com chaves em memória. Testes repetidos passaram.
Suites tickets-operational + tickets-validation isoladas: 6 pass / 42 fail.
Estas suites simulam auth e sync mas não a nova dependência de cliente server;
também não configuram o indicador isSupabaseConfigured. Não removidas/relaxadas
asserções. É necessário adequar o harness antes de avaliar asserções de negócio.
Não classificar todas as falhas globais como este único problema.
Pendentes: numeração concorrente dos tickets (baseada em contagem), inbound,
writer legado que regrava agregado completo, regressão dos riscos/ausências e
validação global/typecheck/build. Produção e GitHub continuam sem alterações.

## Contenção dos writers operacionais — 2026-10-05

Tickets (POST/PATCH/DELETE e inbound) e project-materials (POST/PUT/DELETE)
passam um scope explícito ao writer existente: apenas a linha alterada e,
na criação de ticket, apenas notificações novas. O snapshot não volta a gravar
utilizadores, configuração, comentários, outros tickets ou materiais antigos.
Upserts vazios de users/material também deixam de emitir pedidos.
Não alterados SQL, RPCs, RLS, permissões ou OCC de Projects/Tasks.

Validação: 13 testes focados passaram, incluindo execução do writer com cliente
instrumentado que confirma uma única tabela/linha; 18 verificações reais de
Tickets/materials em staging passaram, com limpeza dos registos QA por soft-delete.
git diff --check sem erros. Suite global e build não repetidos nesta etapa.

Esta contenção não resolve updates simultâneos sobre a mesma linha, atomicidade
ticket/notificação, numeração por contagem nem o writer global de sync.
Esses pontos e a adequação do harness legado continuam pendentes; não considerar
o sistema pronto para cutover. Produção e GitHub não foram alterados.

## Fecho de contenção, concorrência e regressão — 2026-10-05

Esta secção substitui os pendentes das etapas anteriores, conservadas acima para
rastreabilidade. Estado: PASS WITH FINDINGS em staging, sem alterações em produção
ou publicação GitHub.

### Implementação

- Snapshot legado passa a exprimir apenas linhas realmente alteradas no cliente;
  omissões não eliminam registos nem regravam domínios alheios. O servidor mantém
  autorização por domínio, proteção administrativa e autoria de comentários.
- `write_legacy_batch` grava atomicamente 28 tabelas legadas permitidas com OCC
  (`sync_version`), locks determinísticos e rollback completo. Projects/Tasks e
  os seus links não entram neste boundary. Acks atualizam apenas revisões locais
  sem reduzir versões já recebidas. Conflito 409 não é repetido automaticamente.
- Tickets/materials continuam limitados à linha pretendida; callbacks retornam
  revisão. Tickets usam `reserve_ticket_number`, não contagem. Inbound usa UUID.
- Riscos mantêm projeto/categoria/owner/status/prioridade; ausências preservam
  user_id. FKs rejeitam referências inválidas em vez de as transformar em NULL.
- Quatro RPCs canónicas de Projects/Tasks passam a usar FOR UPDATE antes de OCC;
  parâmetros, update flags, sincronização de assignees e regras temporais mantidos.
- Hardened search_path em oito funções; btree_gist movida para extensions;
  acesso anon a is_admin/is_approved revogado. Helpers autenticados necessários às
  políticas continuam disponíveis e ligados à identidade real.

Migrations aplicadas apenas a `caaiydcycrnwcqefdldz`:
`20261005160525_legacy_atomic_writes.sql`,
`20261005161953_security_function_hardening.sql`,
`20261005162756_legacy_conflict_http_status.sql`.

A primeira execução concorrente expôs retries infinitos com SQLSTATE 40001 no
PostgREST 14. A terceira migration corrige para PT409. Após correção, os mesmos
testes passaram. Não omitir esta terceira migration numa promoção.
Referência oficial: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

### Validação executada

- Suite global final: 996 pass, 4 skip, 0 fail (1000 testes / 77 ficheiros).
  Os quatro skips são testes destrutivos de BD, com opt-in obrigatório e guard
  de URL/key para staging. Execução separada `staging.mjs test-integrity`:
  15 pass, 0 fail, incluindo os quatro cenários reais de integridade.
- Guards adicionais de SQL/OCC e writer: 8 pass, 0 fail.
- Regressão principal staging: 46 verificações passaram.
- Tickets/materials: 18 verificações reais passaram.
- Concorrência: 34 verificações passaram, incluindo duas escritas simultâneas
  (um sucesso/um conflito), lote inválido sem gravação parcial, vínculos de
  riscos/ausências, versões de tickets e OCC/assignees canónicos Projects/Tasks.
  Apenas fixtures sintéticas criadas pelo próprio teste foram limpas.
- Acesso direto: 30 recusas verificadas para anon/admin/viewer, sete tabelas e
  três RPCs (delete_project_transaction, write_legacy_batch, reserve_ticket_number).
- Inventário real: 55 tabelas públicas; zero sem RLS. Quatro RPCs canónicas com
  row lock confirmado em pg_get_functiondef.
- Lint: sem warnings/erros. Build Next 15.4.9: exit 0, páginas/API geradas.
  No Windows foi usado o comando Node equivalente ao script build, com limite
  de memória e NEXT_IGNORE_INCORRECT_LOCKFILE=1. Sandbox inicialmente bloqueou
  workers com EPERM; repetição autorizada passou. Configuração já existente
  ignora lint/tipos no build; lint foi executado separadamente.
  Repetição final encontrou EINVAL/readlink em `.next/diagnostics` no OneDrive;
  cache movido para `.staging-transfer/next-build-cache-20261005-final`, sem
  apagamento, e build reconstruído de raiz.

Harness de testes legados foi adequado à dependência explícita de cliente server,
ao planeamento diário sem allocations e a paths Windows. Asserções de segurança
não foram removidas para obter sucesso; os cenários destrutivos têm execução real
separada, não são contados como passes na suite normal.

### Findings e fronteira de conclusão

Typecheck independente falha em código/testes preexistentes fora deste âmbito
(ex.: BentoDashboard, OperationalUserCalendar, ProjectSection, TaskSection e
tipos de testes Bun). A falta de declarações `bun:test` também afeta os testes
novos; nenhum erro de tipos foi encontrado nos novos helpers/boundaries de runtime.
O mapper preexistente de Project.version em supabaseSync também admite NULL.
Não considerar o build como typecheck verde.
Lockfile SWC tem dependências incompletas: evitar um rewrite oportunista nesta fase.

OCC descrito acima cobre a gravação por batch e os RPCs canónicos. O endpoint
de DELETE físico explícito de comments/absences/specialDays/defaultTasks conserva
a semântica por ID e a condição de ownership no próprio DELETE; não exige uma
revisão enviada pelo cliente. Não generalizar os resultados de OCC dos updates
para esse contrato de eliminação. UI de reset/clearAllData ainda promete limpeza
global, mas omissão num snapshot já não é comando de eliminação: rever essa
mensagem/ação numa fase própria, sem devolver eliminações implícitas ao writer.

Advisor de segurança mantém três helpers SECURITY DEFINER autenticados e leaked
password protection desligada. Nenhum erro de RLS/search_path/extension pública
permanece na consulta final. Helpers foram mantidos deliberadamente; ativação da
proteção de passwords depende da configuração/disponibilidade de Auth.
Remediação: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Plano de promoção e recuperação em `docs/rls-cutover.md`. Backup, autorização de
publicação/cutover e janela de manutenção continuam necessários. Não executar
scripts de staging em produção nem desligar RLS como rollback genérico.
