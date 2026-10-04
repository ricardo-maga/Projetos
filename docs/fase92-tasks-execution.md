# FASE 92 — Execução de Tasks e consistência Tasks / Projects

## Estado

PASS WITH FINDINGS.

Implementação local e verificações focadas realizadas. Não equivale a aprovação da suite global, conclusão do build ou validação de persistência na base de dados de produção. Não foi publicado qualquer commit/deploy nesta fase.

## Workspace e ficheiros alterados nesta fase

Workspace utilizado: `Material3-implementation`, que contém o percurso canónico Tasks/API/service/RPC da versão publicada. A pasta `App` não contém esse mesmo percurso. As alterações preexistentes de Material 3, incluindo Calendar e My Focus, foram preservadas; não são alterações desta fase.

1. `components/TaskSection.tsx`
2. `components/TaskDetailsModal.tsx`
3. `components/ProjectSection.tsx`
4. `components/ui/SingleChoice.tsx` — novo componente Foundation.
5. `tests/fase92-task-execution.test.tsx` — 13 testes novos.
6. `tests/fixtures/fase92-preview.tsx` — QA local, dados fictícios e atualizações exclusivamente em memória.
7. `docs/fase92-tasks-execution.md` — este relatório.

## Auditoria anterior à implementação

- Lista e abertura Execute: `TaskSection`, `openTaskModal(t, 'execute')`; o mesmo `TaskDetailsModal` continua a ser utilizado.
- Submit: `TaskDetailsModal.handleSave` → callback `useERP.updateTask` → `lib/taskOperations.apiUpdateTask` → PATCH `/api/v1/tasks/:id` → `lib/tasks/taskService.updateTaskServer` → `update_task_atomic`.
- API: `app/api/v1/tasks/[id]/route.ts`, validação parcial, autorização `tasks_write`, verificação da versão, datas finais e referências/assignees.
- Service: distingue ausência de projeto/assignees/datas de atualizações explícitas; envia `p_update_project_id`, `p_update_assignees`, `p_update_dates` e `p_expected_version`.
- RPC auditada: `supabase/migrations/20261002000000_task_temporal_integrity_constraints.sql`; campos omitidos são preservados, versão incrementada e assignees sincronizados na transação. A migration seguinte de foreign key não substitui esta RPC.
- Assignees: selector existente com grupos elegíveis/Team, seguido da validação na API e sincronização canónica em `task_assignees`. Não foi introduzido fallback para todos os utilizadores.
- Configuração: `task_status` → carregamento existente de `state.taskStatuses` → props em `app/page.tsx`; cores resolvidas pelo `getTaskStatusStyle`/`getStatusColorInfo` existente.
- Foundation: auditados Button, IconButton, Badge, Dialog, Input, Select, Textarea e padrões de seleção existentes. Não existia um equivalente Foundation completo com semântica radio, roving tab stop e navegação por setas. O novo SingleChoice compõe Button; não cria uma segunda implementação de botão ou dependência.

## Tasks — Lista

- Título do separador e da lista: **Lista de tarefas**.
- Responsáveis: Badge Foundation com iniciais canónicas, geometria circular de 32×32 px e nome acessível. Mantidos três responsáveis visíveis, ordem, resolução de utilizadores e indicador `+N`.
- Editar, Duplicar e Eliminar mantidos. Eliminar usa IconButton ghost, sem fundo vermelho permanente, com cor de perigo em hover/focus.
- Confirmação da lista, confirmação do modal e callbacks de eliminação preservados. Não foi alterado o percurso de eliminação.

## Execute Mode

Tabela aplicável quando `canWrite` permite escrita; em View/sem permissão os campos ficam em leitura.

| Campo / Grupo | Editável | Bloqueado |
|---|---:|---:|
| Estado da tarefa | Sim | Não |
| Técnicos Alocados | Sim | Não |
| Horas Reais Consumidas | Sim | Não |
| Data de Início e Hora de Início | Sim | Não |
| Data de Fim e Hora de Fim | Sim | Não |
| Descrição / Notas de Execução | Sim | Não |
| Título | Não | Sim |
| Projeto e cliente derivado | Não | Sim |
| Tipo de tarefa | Não | Sim |
| Data Planeada e Horas Previstas | Não | Sim |
| Descrição / Instruções de Planeamento | Não | Sim |
| Outros atributos não apresentados, incluindo prioridade | Não | Não enviados |

Preservados os handlers de datas, a validação temporal, a sugestão de horas reais a partir das previstas, os erros e callbacks de sucesso. O submit também impede escrita sem `canWrite` e submissão enquanto `isSubmitting` está ativo.

## Segurança do payload

Foi confirmado um problema real: Execute reenviava projeto, título, descrição, tipo e estimativas a partir do formulário completo.

Agora o handler utiliza `getTaskUpdatePayload`, uma allowlist na UI, que devolve exclusivamente:

`statusId`, `assigneeIds`, `actualHours`, `startDate`, `startTime`, `endDate`, `endTime`, `notes`.

Mesmo que os valores locais de planeamento sejam alterados programaticamente, não entram no payload Execute. Edit/Create mantêm os seus contratos. O título em leitura deixa de ser validado como campo a preencher no Execute.

O hook existente acrescenta a versão atual. `apiUpdateTask` serializa apenas propriedades definidas e transforma `assigneeIds` em `assignedUserIds`. A API conserva validações e autorização; o service envia `p_update_project_id=false`, campos de planeamento nulos/omitidos, atualização de assignees e datas quando fornecidas. A RPC conserva o planeamento através das flags/COALESCE existentes. OCC e SQLSTATE mapping não foram alterados.

Esta allowlist define a operação Execute da UI; não é uma nova permissão server-side. Utilizadores com `tasks_write` continuam a poder editar planeamento pela operação Edit existente.

## Estado da tarefa

- Uma única representação funcional, antes de Dados de Planeamento. Select antigo removido.
- Opções/nome vêm de `taskStatuses`, excluindo estados eliminados; IDs legacy são comparados pelo helper canónico.
- Cores suaves, texto e border vêm de `getTaskStatusStyle`. Não existem mapas locais novos.
- SingleChoice: `radiogroup`, `radio`, `aria-checked`, uma opção selecionada, um tab stop, setas com wrap e Home/End. Enter/Space mantêm o comportamento nativo do Button.
- Seleção identificada por ring na cor do estado; font-weight, altura e largura não mudam com a seleção. Focus visível e disabled em View/sem escrita/durante submissão.
- Flex-wrap permite acomodar as opções em ecrãs estreitos.

## Projects → Tasks

O badge de estado no separador Tasks usa agora Badge Foundation e `getTaskStatusStyle(task.statusId, taskStatuses).badgeClass`, exatamente a fonte utilizada na lista principal. Nenhum mapa cromático específico foi acrescentado a ProjectSection.

## Persistência e domínios excluídos

Não foram alterados SQL, migrations, RPC, API, service, RLS, RBAC, roles, permissions, autenticação, sessão, middleware, modelo de dados, Projects persistence, Tasks persistence architecture, supabaseSync ou sincronização global.

Planning, Calendar, Tickets e Materials/BOM não foram modificados nesta fase. A única alteração de percurso de escrita é a restrição do payload no submit do modal existente.

## Verificação final

Pesquisa nos quatro ficheiros de produção alterados. Valores abaixo são número de linhas correspondentes no código, não quantidade de elementos renderizados.

| Pesquisa | TaskSection | TaskDetailsModal | SingleChoice | ProjectSection |
|---|---:|---:|---:|---:|
| Lista Operacional de Tarefas | 0 | 0 | 0 | 0 |
| `<button` | 0 | 0 | 0 | 61 |
| `<select` | 0 | 0 | 0 | 14 |
| `<input` | 0 | 0 | 0 | 35 |
| `<textarea` | 0 | 0 | 0 | 5 |
| text-[9px] | 0 | 0 | 0 | 8 |
| text-[10px] | 0 | 0 | 0 | 75 |
| text-[11px] | 0 | 0 | 0 | 25 |
| text-xs | 0 | 0 | 0 | 103 |
| bg-slate | 0 | 0 | 0 | 131 |
| text-slate | 0 | 0 | 0 | 326 |
| border-slate | 0 | 0 | 0 | 198 |
| bg-blue | 0 | 0 | 0 | 33 |
| text-blue | 0 | 0 | 0 | 50 |
| bg-indigo | 0 | 0 | 0 | 4 |
| bg-rose | 0 | 0 | 0 | 13 |
| bg-emerald | 0 | 0 | 0 | 18 |

Classificação:

- TaskDetailsModal utiliza os controlos Foundation; o único fieldset adicionado é uma estrutura semântica nativa para bloquear conjuntamente o AssigneeSelector em leitura. Não existe equivalente Foundation para fieldset.
- Os inputs/checkboxes nativos internos ao AssigneeSelector existente não foram modificados. A elegibilidade e o comportamento anterior foram preservados.
- SingleChoice utiliza Button Foundation com semântica radio, não um botão nativo reconstruído.
- Os controlos diretos de ProjectSection são legado preexistente: formulários, filtros, paginação, calendários internos, materiais/riscos e upload/range. Não foram introduzidos por esta fase; a sua migração transversal está fora do âmbito.
- O select antigo de estado e a representação funcional duplicada no modal têm zero ocorrências. O select restante é exclusivamente de tipo de tarefa, via Foundation.
- Há um mapa legado de cores de estado no calendário/planeamento interno de ProjectSection, perto de 2127–2132. Não está no badge do separador Tasks alterado nesta fase; foi registado e preservado para respeitar a exclusão de Planning/Calendar.
- Cores calculadas pelo helper canónico são uma exceção legítima; o helper não foi alterado.
- `git diff --check`: sem erros após limpeza de whitespace nas linhas alteradas.

## Validação

- Testes novos: **13 pass / 0 fail**, incluindo renderer real de responsáveis, confirmação/submit reais extraídos do código, allowlist, SSR do modal/seletor, PATCH serializado, flags da RPC e SQLSTATE mapping. API/RPC usam doubles; não há chamadas à produção.
- Testes focados: **129 pass / 0 fail**, 8 ficheiros; inclui testes existentes de responsáveis, operações Tasks, integridade temporal, RPC e elegibilidade RBAC.
- Suite global: executada, **820 pass / 54 fail / 1 error**, 874 testes em 56 ficheiros. Não passou.
- Lint: `npm run lint` executado inicialmente; produziu avisos de patch do lockfile por `spawnSync cmd.exe EPERM` e terminou com zero warnings/errors de ESLint. Reexecutado diretamente com `NEXT_IGNORE_INCORRECT_LOCKFILE=1`, `next lint --no-cache`: **sem warnings/errors**. Verificação focada dos seis ficheiros de código também sem warnings/errors.
- Build: executado através de Node com variáveis de ambiente equivalentes ao script POSIX. **Compiled successfully**, mas falhou depois com **Error: spawn EPERM** ao iniciar o worker. Build completo não aprovado. A configuração existente ignora validação de tipos e lint no build; por isso foram executadas verificações separadas.
- TypeScript adicional: `tsc --noEmit --incremental false` falha em problemas existentes do workspace e na ausência de tipos `bun:test`. Não há diagnósticos de TaskDetailsModal/SingleChoice; nenhum problema de produção novo foi identificado nessa pesquisa.
- QA no browser com o modal real e fixture: Execute abre, planeamento em leitura, técnicos/horas/notas editáveis, submissão em memória com exatamente oito campos e sem planeamento; View bloqueia o selector de estado e técnicos; Edit mantém título editável. Navegação por ArrowRight altera seleção/foco. Larguras/alturas dos três botões idênticas antes/depois. A 390 px, opções fazem wrap e `scrollWidth === clientWidth` no grupo (245 px). Não foi validada uma sessão real nem uma transação na BD de produção.

## Findings não corrigidos

1. Falhas globais em Tickets/Sync/Materials com Supabase não configurado/expectativas não satisfeitas. O erro de carregamento da FASE 79 é `supabaseUrl is required.`. Esses ficheiros não foram alterados.
2. Dois testes estáticos usam `/` na comparação de paths e falham neste Windows: FASE 59 não normaliza paths antes de comparar com a allowlist; FASE 65-D recebe `\\lib\\planning\\allocationService.ts` quando espera `/lib/planning/allocationService.ts`.
3. Limitação do ambiente: build bloqueado por `spawn EPERM`. Não se deve apresentar a compilação como um build concluído.
4. Problemas TypeScript preexistentes: por exemplo `setShowAddTaskForm` não definido em ProjectSection, filtro `completed_this_week` fora da união em TaskSection, e tipos `bun:test` ausentes. Não foram corrigidos oportunisticamente.
5. Controlo/estilo legado e mapa cromático do calendário interno de ProjectSection descritos acima. Apenas o badge Tasks em âmbito foi normalizado.
6. Validação de persistência contra PostgreSQL/Supabase real e regressão autenticada end-to-end continuam pendentes. A implementação passou verificações locais, mas esta fase não está aprovada integralmente para produção.
