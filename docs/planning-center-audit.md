# Centro de Planeamento — auditoria inicial e estado de implementação

Base: `origin/main` em `dd58ecb6a60904156280f45439e76504af0e08e4`, worktree isolada
`codex/planning-center-20261102`. O checkout original tinha alterações de outros
trabalhos e não foi alterado. Esta auditoria cobre os contratos que a primeira
entrega usa; as fases de catálogo de requisitos e instalações exigem auditoria
adicional antes de modificar os respetivos automatismos e esquema.

| Funcionalidade | Fonte e consumidores | Constatação / risco | Decisão | Verificação |
| --- | --- | --- | --- | --- |
| Criação e edição de tarefas | `app/api/v1/tasks`, `lib/tasks/taskService`, `lib/taskOperations`, `useERP`, formulário, calendário | RPCs atómicas e versão já existem; o sync legado ainda pode alterar data e responsáveis | Preservar APIs e RPCs; invalidar blocos explícitos quando uma edição legada altera data ou responsáveis | Typecheck, suite global, ensaio SQL em staging |
| Conflitos | `lib/taskConflicts`, `lib/taskOperations`, `OperationalUserCalendar` | Uma regra avisa por coincidência de tarefas; outra soma horas com 8 h fixas | Motor novo considera blocos, ausência e horário; migração dos ecrãs antigos permanece gradual | Quatro testes do motor |
| Datas | `lib/utils`, `lib/operationalCalendar`, timeline e feed | Calendário antigo usa data real de início quando há início/fim; isso não representa planeamento | Centro usa apenas blocos ou `estimated_date` legado, sem alterar datas reais | Testes temporais existentes e ensaio SQL |
| Pedidos especiais | `work_request_tasks`, triggers e RPCs próprias de Presales/desenho | Escrita genérica contornaria autorização e eventos do pedido | Centro mostra contexto, mas impede atribuição direta destas tarefas | Guarda na RPC e UI |
| Horários e ausências | `resource_work_schedules`, `work_schedule_periods`, `user_absences` | Não há horário individual validado para todos; horas totais da tarefa não identificam esforço diário por técnico | Sem horário completo, capacidade indeterminada; ausência de dia inteiro é bloqueante | Testes do motor e esquema staging |
| Modelos | `default_tasks`, automação SQL `create_default_tasks` | Automatismo cria todos os modelos apenas se o projeto não tiver qualquer tarefa; preenche também datas reais com o dia atual e não usa identificadores de requisito | Não alterar sem catálogo e migração de compatibilidade próprios | Auditoria SQL; fase ainda pendente |
| Localizações | `clients.location`, projetos e pedidos | Localização do cliente é texto indicativo, sem instalações reutilizáveis | Mostrar contexto indicativo e «local desconhecido»; não inferir deslocação | Revisão da API; modelo de instalações pendente |
| RBAC e RLS | `requirePermission`, `has_permission`, catálogo RBAC | Leitura de tarefas não basta para autorizar o Centro | Permissões `planning_center.read` e `.write`; RLS sem acesso direto à tabela de blocos | Grants e advisors de staging |

## Baseline e validação desta etapa

- A worktree iniciou limpa. `npm ci --ignore-scripts` instalou dependências sem alterar o lockfile.
- `npm run typecheck:app`, `npm run lint`, `npm run build`, `npm run check:openapi` e `npm run check:migrations` passaram. O lint conserva quatro avisos de hooks em componentes não alterados.
- `npm run test:ci`: 1042 passaram, 4 ignorados, 3 falharam; o gate classificou as 3 como conhecidas e encontrou **0 falhas novas**. A suite não está totalmente verde.
- Quatro testes específicos do motor passaram com `node --experimental-strip-types --test`.
- Em `solprojetos-staging` (`caaiydcycrnwcqefdldz`) foram aplicadas, por ordem, `intelligent_planning_blocks`, `fix_planning_assignee_validation` e `reset_planning_write_guard`. A primeira falha foi detetada e corrigida por migration adicional; nenhuma migration aplicada foi reescrita.
- Ensaio da RPC com `BEGIN … ROLLBACK` devolveu versão 2; a edição legada posterior na mesma transação removeu o bloco. Após rollback, a tarefa permaneceu na versão 1, com data original e zero blocos.
- `task_plan_blocks` tem RLS ativo; `anon` e `authenticated` não têm `SELECT`, nem `EXECUTE` na RPC. `service_role` tem ambos. O advisor de staging regista RLS sem política, que neste caso representa negação de acesso direto.
- Rota local sem sessão: página 404 e API de leitura 401. Teste autenticado da interface e Preview Vercel ainda pendentes.

## Entrega e próximos gates

Acesso experimental: `/internal/planning-preview`, sem entrada no menu e desativado
por omissão. Ativar `PLANNING_PREVIEW_ENABLED=true` apenas em desenvolvimento ou
Preview protegido; a produção devolve 404 independentemente do flag.

Antes de declarar a implementação completa: concluir o catálogo de requisitos
por categoria, a correção segura do automatismo, o modelo de várias instalações,
a integração gradual do motor nos ecrãs atuais, os testes autenticados de UI e
segurança, e validar a proteção e o alvo de dados do Preview. A reconciliação
histórica documentada em `database-baseline.md` e `migration-reconciliation.md`
continua a impedir `db push` indiscriminado e promoção automática para produção.
