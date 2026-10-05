# Manutenção e bloqueio de escritas — 2026-10-05

Janela de produção executada e encerrada em 2026-10-05.
Release de produção: dpl_5Q5gq87Pm5PGTDuPk8T2UuNhfseC / commit 36a169b.
Migrations/RLS aplicados, backup novo privado sob freeze concluído e
55 triggers temporários removidos; schema cutover_control ausente.
Página/configuração 200 e acesso protegido/login inválido 401 após reabertura.
Utilizador confirmou login válido, listas de projetos/tarefas e edição/gravação
de projeto após o cutover. Validação funcional final concluída.
Ver evidência e versões remotas em docs/production-readiness.md.
Utilizador confirmou login e listagens Projects/Tasks após revogação legacy,
antes deste cutover; essa confirmação não valida a nova release.

## Mecanismos

- `ERP_CUTOVER_MAINTENANCE=true`: middleware devolve 503/no-store/Retry-After
  antes da sessão para página, login e APIs, incluindo inbound/sync.
  Switch ausente/false mantém o handler de sessão original.
- `cutover-freeze-enable.sql`: transação guardada, 55 tabelas públicas,
  locks por ordem estável, timeout 5s/30s, triggers BEFORE STATEMENT para
  INSERT/UPDATE/DELETE/TRUNCATE. Nenhum row write/owner/RLS/RBAC é alterado.
  REST/session_user preservado através de SECURITY DEFINER; só administração
  direta postgres/supabase_admin sem contexto REST fica disponível.
- `cutover-freeze-disable.sql`: remove exatamente os 55 triggers e função/schema
  privados, sem CASCADE ou reativação de grants. Falha se o inventário divergir.
- Em ambos inserir `SET LOCAL app.cutover_freeze_reviewed='on';` depois de BEGIN
  na MESMA transação. Não há bypass por header, utilizador ou token da aplicação.

O bloqueio cobre escritas nas tabelas operacionais, incluindo URLs antigos;
não congela o Auth gerido, leituras, administração SQL ou nextval de sequences.
Reservas não persistidas podem consumir números; gaps continuam permitidos.
Não usar a página de manutenção como prova de isolamento da base de dados.

## Evidência

- 4 testes de switch, 23 asserções: PASS.
- Suite global: 1003 pass, 4 skip, zero fail / 1007, 79 ficheiros.
- Tipo runtime e lint: PASS. Build verificando tipos/lint: PASS.
  Next reporta tentativa falhada de autopatch do lockfile SWC (`os` undefined);
  build finalizou com exit 0. Não alteradas dependências/lockfile para silenciar.
- Offline: 18 verificações, 55 triggers, claims anon/authenticated/service_role,
  INSERT/UPDATE/DELETE/TRUNCATE e SECURITY DEFINER; contagens preservadas,
  objetos removidos completamente.
- Contenção offline: writer em curso causa lock timeout; rollback integral,
  nenhum trigger/schema parcial; repetição após drain passa.
- REST real STAGING: SELECT de ID inexistente 200, DELETE desse ID 503;
  guard removido em finally e inventário confirma ausência de objetos temporários.
  Duas entradas operacionais de migration documentam instalação/remoção em staging.
- Build real localhost: página, login, inbound, sync e tasks devolvem 503 com
  no-store/Retry-After; processo de teste encerrado após verificação.
- Recuperação real offline do dump com guard: public/auth/cutover_control,
  55 triggers restaurados; contagens users/auth users/projects/tasks/comments/risks
  coincidem; unfreeze passa na cópia recuperada e na origem.
  Base recuperada retida sem rede/portas: cutover_freeze_restore_1791227870631.

## Execução e recuperação

1. Identificar/preservar deployment hotfix atual e publicar commit revisto.
2. Preparar deployment de manutenção sem promoção automática; verificar 503.
3. Só após gates verdes, promover manutenção e instalar freeze; timeout implica
   rollback completo e não autoriza avançar antes do drain.
4. Backup NOVO privado de schema/data/roles sob freeze. Incluir cutover_control
   no schema dump: triggers de public dependem da função privada. Dump public/auth
   sem esse schema não é uma recuperação completa durante a janela.
5. Aplicar somente as três migrations revistas, backend correspondente e os
   dois SQLs RLS/RPC com guard. Não executar db push histórico indiscriminado.
6. Validar código/schema/ACL/advisors e chamadas negadas; remover freeze apenas
   após invariantes verificadas. Promover release/abrir tráfego de forma coordenada.
7. Em falha manter freeze/manutenção; não reativar chave exposta, DISABLE RLS
   nem grants públicos genéricos. Recovery completa usa backup exato e owner/ACL.
   Restaurar o guard privado com o schema, remover depois através do SQL revisto.

Backups durante manutenção continuam snapshots lógicos public/auth, não snapshots
físicos de todos os serviços nem backup de binários Storage. Storage não é alterado.
