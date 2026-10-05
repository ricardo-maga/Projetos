# Preparação dos cinco requisitos de promoção — 2026-10-05

Estado: preparação técnica validada; cutover NÃO iniciado. A janela foi autorizada
pelo utilizador apenas depois de todas as verificações. Falta autenticar o CLI
Vercel e confirmar a ligação ao projeto/deploy/env antes de suspender escritas.
Produção continua sem mutações de schema/dados/configuração.

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
Auth. Este risco residual deve ser aceite explicitamente no fecho do cutover ou
resolvido mediante decisão sobre plano, não falsamente marcado como corrigido.
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

CLI Vercel 62.2.0 verificado: Logged out. Utilizador recebeu pedido de executar
login sem fornecer passwords/tokens na conversa. Sem confirmar autenticação,
projeto/env, suspensão dos writers/jobs/inbound e mecanismo de promoção/rollback
do deploy, NÃO aplicar as migrations em produção nem abrir manutenção.

Leaked-password protection indisponível no Free continua uma decisão de risco/plano.
Referências: https://supabase.com/docs/guides/platform/backups e docs/rls-cutover.md.
