# Planeamento diário — retirada de alocações

## Implementado

- Calendário semanal por técnico reutiliza `OperationalUserCalendar`, sem alterações às suas regras de datas, ausências, elegibilidade, preferências e drag/drop.
- Timeline por projeto mostra tarefas por dia e horas previstas usando `isTaskOnDate` e `estimatedHours`; abre o mesmo `TaskDetailsModal` para criação, consulta e edição.
- Removidos os consumidores de alocações/capacidade de `app/page.tsx`, `TaskSection` e `useERP`: não há pedidos automáticos de Planning nessas vistas.
- Removidos três componentes sem consumidores: `PlanningAllocationModal`, `ResourceDayDetailModal`, `ResourceCapacityBar`. Recuperáveis pelo histórico Git.
- Removidos cartões, legendas e filtros CONFIRMED/DRAFT e classificação de tarefas sem alocações como não planeadas.
- Não foi introduzido um novo campo draft/confirmado.

## Segunda etapa — implementada localmente

Os endpoints `/api/v1/planning-allocations` (GET/POST), `/api/v1/planning-allocations/[id]` (GET/PATCH/DELETE), `/api/v1/planning/capacity`, `/resource-load` e `/availability` (GET) devolvem HTTP 410 com `PLANNING_RETIRED`, depois das verificações de acesso existentes. Não fazem consultas nem escritas de alocações. As bibliotecas antigas permanecem apenas para histórico/testes, sem consumidores nas rotas, componentes ou hooks ativos.

Retirada a consulta de bloqueio à tabela de alocações na API de eliminação de Tasks. O serviço mantém a chamada a `delete_task_atomic`, com a mesma assinatura, expected version e mapeamento de erros. Preparada `20261005000000_retire_task_allocation_delete_guard.sql`: substitui a função removendo apenas o guard de alocações, preservando autorização, OCC, soft-delete e grants. Um teste compara o corpo SQL com a migration anterior excluindo apenas esse guard. Nenhuma migration foi executada em produção; até a aplicação da migration, a RPC antiga continua a bloquear tarefas com alocações ativas.

### Aplicação em produção

1. Publicar e confirmar o deploy que descontinua os endpoints, evitando novas alocações.
2. Aplicar a nova migration pelo processo habitual do Supabase. Não reaplicar a migration antiga.
3. Verificar em ambiente de teste a eliminação de uma tarefa com alocações históricas, rejeição por falta de permissão e conflito de versão. Confirmar que a tarefa é soft-deleted e o histórico de alocações permanece.

Não foram eliminadas tabelas, linhas históricas ou alteradas políticas RLS/roles. Não foi introduzido um flag draft/confirmado. PostgreSQL runtime não foi validado nesta execução.

A nova timeline é deliberadamente simples (sem matriz de capacidade, reservas horárias, gaveta de alocações ou fullscreen). Navegação semanal, pesquisa de projetos/clientes, abertura do projeto e criação/edição de tarefas permanecem disponíveis. A regra existente de usar data real de início quando início/fim estão preenchidos foi preservada.

## Validação

- 77 testes focados passaram, incluindo calendário operacional, drag/drop, preferências, execução, retirement HTTP e boundary de Planning.
- O teste de boundary do frontend foi atualizado para o novo contrato (ausência de operações de alocação), preservando a cobertura dos serviços históricos.
- Typecheck global não passou: erros existentes de `completed_this_week` e variante `error` de Badge em TaskSection. Não houve diagnóstico de tipos em CalendarSection/useERP/page na verificação filtrada.
- Build e verificação visual em browser não executados; deploy e Supabase de produção não alterados.

## Findings da segunda etapa

- Suite global após a retirada das rotas: 861 pass, 59 fail, 1 error. Antes desta etapa: 860 pass, 55 fail, 1 error. Não declarar a suite global aprovada.
- Existem testes antigos que ainda exigem bloqueio de DELETE por alocações ativas ou operação dos endpoints retirados (por exemplo fase66-b-tasks-boundary-decoupling, tasks-simplicity-robustness e CRUD transversal). Esses contratos precisam de adaptação com mocks coerentes com a nova RPC. Não foram removidos para ocultar falhas.
- O teste histórico de permissões das rotas foi atualizado para verificar a delegação ao handler descontinuado e a manutenção de `requirePermission` nesse handler.
- A migration foi validada estruturalmente por testes, não executada num PostgreSQL de teste ou de produção.
