# Preparação dos cinco requisitos de promoção — 2026-10-05

Estado: hotfix de credenciais e revogação legacy concluídos e verificados.
Cutover RLS NÃO iniciado. A janela foi autorizada pelo
utilizador apenas depois de todas as verificações.
Schema/RLS de produção continuam sem mutações. Variáveis Vercel corrigidas com
autorização explícita; hotfix de credenciais separado da promoção de RLS.

## 1. Tipos, lint e testes

Corrigidos os erros da aplicação: projectId nullable no Dashboard, callback async
do calendário, setter removido no import de modelos, preset completed_this_week,
tipo string do role, title do Badge e NULL em Project.version. Sem redesign ou
alteração das regras de autenticação/RBAC.

`tsconfig.application.json` verifica todo o runtime app/components/hooks/lib e
tipos gerados Next. Next usa esse ficheiro; ignoreBuildErrors e ignoreDuringBuilds
agora false. Typecheck independente passou e build passou verificando tipos/lint.

Suite global final: 999 pass, 4 skip, 0 fail / 1003 testes, 78 ficheiros.
Um primeiro scan transversal excedeu 5 segundos com Docker a arrancar; repetição
com timeout 15 segundos passou, sem remover asserções. Quatro casos destrutivos
continuam opt-in staging e foram exercitados separadamente na etapa anterior.

Avaliação formal: tipagem de fixtures Bun/previews não faz parte do artefacto
de produção; o tsconfig raiz continua a reportar falta de tipos bun:test e fixtures
incompletas. Não foram silenciados por any adicional nem declarados verdes. Testes
de runtime continuam todos executados. Isto não dispensa uma fase futura para a
tipagem dos testes, mas já não oculta erros da aplicação no build de produção.

## 2. Segurança

has_permission em produção/staging tem o mesmo corpo. Cliente authenticated não
pode escolher identidade através de p_user_id; auth.uid() é primário. Sem UID,
perfil aprovado/ativo ou role válido falha fechado. is_admin/is_approved também
derivam identidade da sessão. Os três helpers SECURITY DEFINER autenticados foram
mantidos intencionalmente porque as políticas existentes dependem deles. Schema
public/extensions não é writable por anon/authenticated. Não há views públicas.

Work tem plano Free. Leaked-password protection exige Pro ou superior segundo
documentação atual. Limitação registada; NÃO feito upgrade pago nem alteração de
Auth. O utilizador aceitou explicitamente manter Free e esta limitação por agora.
https://supabase.com/docs/guides/auth/password-security

## 3. Comparação de produção/staging

Produção ProjectTool lydxxrzbytfzrsuxptsm e staging caaiydcycrnwcqefdldz:
- 55 tabelas públicas; produção tem 40 sem RLS, staging zero.
- Só 28 sync_version adicionais em staging. Zero colunas existentes divergentes
  ou ausentes; constraints idênticas.
- Nove assinaturas de RPC/helpers comparadas: idênticas. Diferenças de corpo são
  exclusivamente search_path fixo e FOR UPDATE nas quatro RPCs de OCC revistas.
- Produção Postgres 17.6; btree_gist relocatable no public, conforme esperado.
- Histórico de produção vazio; staging tem registros MCP com versões de execução
  diferentes dos timestamps dos ficheiros. NÃO executar db push em massa nem
  reaplicar migrations históricas. Promover apenas a lista explicitamente revista
  em docs/rls-cutover.md e registar as versões efetivas.

## 4. Backup, recuperação e janela

Backup de public/auth (schema/ACL/funções/dados/sequences) e roles obtido via CLI
2.119.0. Dados/roles em pasta Temp privada, ACL apenas do utilizador local, fora
do Git/OneDrive. Nunca publicados. Dumps não cobrem objetos binários Storage,
nem constituem snapshot físico de todos os serviços internos; esta promoção não
altera Storage. Managed roles são providos pela imagem Supabase no restore.

SHA256:
- schema.sql: C52984F311E3F2AF1C86AFFB8D5DA24215F1E4A4434B8D067980B5FF8BA2C8FD
- data.sql: 895BC41C9087CB8E5BB7DEB2CBC683E129CCBC3C4D50087044C0552AC2BC3762
- roles.sql: 25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD

Recuperação real local: imagem public.ecr.aws/supabase/postgres:17.11.0.002,
database cutover_restore, network none, sem portas. Schema e dados restaurados
com ON_ERROR_STOP; owners/ACL/funções/constraints preservados. Primeiro uso do
role postgres não tinha privilégio para SET ROLE supabase_admin; repetição com
o administrador real da imagem passou. Sem usar qualquer conta real para login.

Ensaio offline `scripts/rehearse-cutover.mjs` aplica as três migrations e os dois
SQLs RLS/RPC sobre a cópia restaurada: PASS, 55 tabelas/zero sem RLS/28 versões,
quatro locks canónicos, conflito PT409, zero grants de browser nas oito RPCs de
mutação, contagens de users/auth users/projects/tasks/comments/risks preservadas.

Antes do cutover repetir backup sob janela fechada: este backup de preparação
não garante cobertura de alterações feitas depois. Rollback é recuperação
controlada de código/DDL/ACL do backup, não DISABLE RLS ou grants públicos genéricos.
Não restaurar indiscriminadamente um backup antigo por cima de novas escritas.

## 5. Publicação e deploy

Branch de preparação: security/staging-cutover-20261005, baseada em main
3954daf292f6f0c90d1a7aa897cdd694e04443f6. Não publicar em main enquanto o novo
backend depende de migrations ainda ausentes em produção. A identificação exata
do commit é entregue no relatório da execução.

CLI Vercel 62.2.0 autenticado; projeto projex, organização gestao-de-projetos.
Deployment atual Ready: dpl_9Cy3mCo5m3Pp68TRHyMNBZPJJ1no.
Exportação privada de ambiente autorizada pelo utilizador, fora de Git/OneDrive:
URL e ref correspondem a ProjectTool. Contudo NEXT_PUBLIC_SUPABASE_ANON_KEY
contém JWT com role service_role, confirmado sem imprimir a chave. O código
lib/supabase/client.ts e lib/supabaseClient.ts consome esta variável no cliente.
Exposição de credencial privilegiada confirmada posteriormente nos bundles
públicos do deployment anterior, conforme o registo do hotfix abaixo.
SUPABASE_SERVICE_ROLE_KEY é Sensitive e não exportável; não se tentou contornar.
O finding exigiu autorização própria para corrigir a variável pública e revogar
a chave exposta. Autorização recebida e correção descrita no registo abaixo;
revogação efetiva concluída pelo utilizador e verificada abaixo.
Preparação posterior de manutenção/freeze/recuperação validada em
`docs/cutover-maintenance.md`; execução da janela e promoção RLS ainda pendentes.
Dry-run de upload passou com .vercelignore excluindo env, dumps e caches.

### Hotfix de credenciais autorizado

O utilizador autorizou a correção/revogação após o finding. A inspeção dos 11
bundles públicos do site confirmou uma ocorrência da chave legacy service_role.
Foram configuradas as chaves modernas já existentes do projeto: publishable em
NEXT_PUBLIC_SUPABASE_ANON_KEY e secret em SUPABASE_SERVICE_ROLE_KEY (Sensitive).
As variáveis são partilhadas entre production/preview/development; a atualização
Vercel preservou os targets, afetando futuros builds nesses três ambientes.
Nenhum valor foi publicado; os exports temporários foram eliminados.

Rebuild isolado do MESMO commit de produção 3954daf:
dpl_CUjZHwJpgu4fCwHJMgC9ZwABmtRr,
https://projex-eeed2x77v-gestao-de-projetos.vercel.app.
READY; autoAssignCustomDomains=false. Verificação autenticada vercel curl:
página 200; 11 assets; zero JWT service_role; zero sb_secret; uma publishable;
API branding 200/configured=true; login fictício inválido 401.
Login válido com conta de produção não testado pelo agente.
Posteriormente o utilizador confirmou login normal e listagens Projects/Tasks.
Sem alterações de código da aplicação/migrations neste rebuild.
Promoção oficial Vercel concluída com sucesso. Validação no domínio público
solprojetos.vercel.app: página 200, 11 assets, zero service_role/secret, uma
publishable, API branding 200/configured=true. Hotfix está ativo em produção.

Inventário de consumidores conhecidos: zero Edge Functions, cron.job ausente,
zero triggers de webhook HTTP e zero funções públicas com net.http/chave em URL.
Isto não prova ausência de integrações externas desconhecidas.
Revogação legacy CONCLUÍDA pelo utilizador no Dashboard.
Verificação posterior: plugin reporta anon legacy disabled=true e publishable
disabled=false. Pedido REST usando a chave service_role antiga, com apikey e
Authorization Bearer, select=id&limit=0, devolveu HTTP 401. Nenhuma linha lida.
Site público HTTP 200; API branding HTTP 200/configured=true com as novas chaves.
O CLI não forneceu o campo disabled da service_role; a rejeição real HTTP 401
é a confirmação funcional da invalidação. Nenhum valor de chave foi impresso.
Controlo utilizado: API Keys > Legacy > Disable JWT-based API keys.
Não reativar a chave exposta como rollback. Deployments históricos e cópias de
bundles só deixam de ter acesso privilegiado após a revogação efetiva.
Referências: https://supabase.com/docs/guides/platform/backups e docs/rls-cutover.md.

### Cutover de produção executado — 2026-10-05

Commit 36a169be7422348766eb7eba27e6a731a232e200 compilado pela Vercel
em preview e novamente para production. Release promovida:
dpl_5Q5gq87Pm5PGTDuPk8T2UuNhfseC,
https://projex-an2z9ygpx-gestao-de-projetos.vercel.app.
Alterações locais novas do Dashboard foram preservadas e excluídas do release.

Manutenção estática de produção dpl_3ohzDMLDV2cZig9eMtHEG6oeybAa foi
validada com 503/no-store/Retry-After e promovida antes do freeze.
A primeira promoção do preview estático falhou (NEXT_NO_VERSION), sem alterar
o site público; build production com parâmetros estáticos explícitos corrigiu.
Freeze de 55 tabelas confirmado, incluindo rejeição PT503 de DELETE WHERE false
com contexto REST simulado, sem alterar linhas.

Backup NOVO sob freeze, privado fora de Git/OneDrive, pasta final-20261005:
schema.sql 184895 bytes / SHA256 D8BD1147646112EC0B74CBF24856C865A55D8CC08531D516A5F8CFDFF9501B45;
data.sql 256444 bytes / SHA256 AA80C4E7E48C0EB7889F52FD6342C69BF50F2B38B866D5D46212F688F2AB4DCC;
roles.sql 297 bytes / SHA256 25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD.
Inclui public/auth/cutover_control. Recuperação sob freeze ensaiada anteriormente
offline; este novo dump não foi restaurado durante a janela.

Migrations remotas aplicadas, por ordem:
20261005194702 production_temporary_write_freeze_enable;
20261005194930 legacy_atomic_writes;
20261005194935 security_function_hardening;
20261005194942 legacy_conflict_http_status;
20261005194958 backend_only_rls;
20261005195004 backend_rpc_access;
20261005195358 production_temporary_write_freeze_disable.

Verificado: zero tabelas public sem RLS (55 totais), 40 políticas backend-only,
zero privilégios efetivos browser nessas 40 tabelas, 28 sync_version,
oito RPCs de escrita com execute apenas service_role, quatro RPCs OCC com
FOR UPDATE, PT409 no writer e btree_gist em extensions.
Contagens preservadas: projects 61, tasks 86, users 29, comments 17, risks 10.
Após promover release: página 200, configuração 200/isConfigured=true,
tasks sem sessão 401. Onze bundles públicos: zero JWT service_role e nenhuma
chave sb_secret; uma ocorrência literal somente do prefixo sb_secret_ (10 chars)
é código de validação, não credencial. Publishable aparece em dois bundles.
Freeze removido com sucesso: zero triggers e schema cutover_control ausente;
RLS permanece ativo. Sem reativação de chaves legacy ou grants públicos.

Avisos residuais: três helpers SECURITY DEFINER usados por políticas existentes
e leaked-password protection no Free (limitação expressamente aceite).
Validação funcional pós-cutover CONFIRMADA pelo utilizador: login válido,
listas de projetos e tarefas, edição e gravação de projeto. Não foram usados
utilizadores reais pelo agente para testes de escrita. Esta confirmação refere-se
à release nova, não apenas ao hotfix anterior.

## Relatório final — PASS WITH FINDINGS

Entrada em produção concluída; manutenção encerrada. Relatório publicado no
PR #1 para integração da branch security/staging-cutover-20261005 na main.
Esta atualização é exclusivamente documental; não altera código runtime,
migrations, permissões ou dados. Alterações locais do Dashboard excluídas.

Validação técnica anteriormente executada no commit de segurança: 1003 testes
pass, quatro skip, zero fail; typecheck runtime, lint e build PASS.
Build Vercel production do commit 36a169b READY e promovido. Não foram repetidos
testes de código para esta atualização exclusivamente documental.

Findings aceites/documentados: três helpers de políticas SECURITY DEFINER;
leaked-password protection indisponível no Free (aceite pelo utilizador);
aviso não fatal de autopatch SWC do Next. Não há novo SQL a executar para fechar
esta promoção. A integração na main pode desencadear um rebuild automático
Vercel; não deve executar novamente migrations de produção.
