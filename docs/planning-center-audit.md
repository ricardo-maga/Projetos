# Centro de Planeamento — auditoria inicial e estado de implementação

Base: `origin/main` em `dd58ecb6a60904156280f45439e76504af0e08e4`, worktree isolada
`codex/planning-center-20261102`. O checkout original tinha alterações de outros
trabalhos e não foi alterado. A matriz explicita os contratos auditados e os
limites desta entrega; a integração dos consumidores antigos permanece gradual.

| Funcionalidade | Fonte e consumidores | Constatação / impacto / risco | Decisão | Verificação |
| --- | --- | --- | --- | --- |
| Criação, duplicação, edição e eliminação de tarefas | `app/api/v1/tasks`, `lib/tasks/taskService`, `lib/taskOperations`, `useERP`, formulário, calendário, integrações v1 | RPCs atómicas e versão já existem; o sync legado ainda pode alterar data e responsáveis. Alterar contratos públicos seria risco alto | Manter APIs e RPCs; invalidar blocos explícitos quando edição legada altera data ou responsáveis | Suite global, segurança, SQL com rollback em staging; faltam E2E autenticados |
| Atribuição e conflitos | `task_assignees`, `lib/taskConflicts`, `lib/taskOperations`, `OperationalUserCalendar`, `AssigneeSelector`, projetos | Coincidência de tarefas é tratada como conflito nalguns consumidores; outros somam horas com 8 h fixas. Risco alto de falsa capacidade | Motor estruturado considera blocos, ausência e horário; Centro usa RPC transacional e versão; migrar consumidores antigos gradualmente | Quatro testes do motor, SQL de atribuição, regressão existente |
| Datas de prazo, planeamento e execução | `tasks.estimated_date`, blocos novos, `lib/operationalCalendar`, timeline, feed | Calendário antigo pode usar início efetivo; horas totais não exprimem esforço diário. Risco alto de confundir conceitos | Blocos de execução em meios-dias; datas reais nunca derivadas de blocos; horas exibidas como indeterminadas sem distribuição | Ensaios SQL de atualização e invalidade, testes temporais |
| Pedidos especiais e tarefas sem projeto | `work_request_tasks`, Presales, desenho mecânico, assistência, RPCs de pedidos | Escrita genérica pode contornar autorização e eventos do pedido. Risco alto | Mostrar as tarefas no contexto; bloquear escrita do Centro nas tarefas associadas a pedidos | Guarda RPC/UI; falta E2E dos fluxos especiais |
| Horários e ausências | `resource_work_schedules`, `work_schedule_periods`, `user_absences` | Horários individuais incompletos; ausências parciais não têm granularidade suficiente. Risco médio | Capacidade indeterminada sem horário; ausência integral bloqueia, parcial avisa | Testes do motor e esquema staging |
| Modelos e automatismo | `default_tasks`, `automation_rules`, SQL `create_default_tasks`, projetos | Legado cria modelos sem referência estável e pode preencher datas reais; atribuição automática de requisito por título seria insegura. Risco alto | Catálogo por categoria e estado por identificador; criação idempotente; se automação legada estiver ativa num projeto com tarefas, exigir associação explícita | Transação de criação repetida e rollback em staging; integração automática do legado ainda pendente |
| Localizações | `clients.location`, novos `client_sites`, projetos, tarefas | Texto do cliente não é morada validada; mudanças de cliente/site podem deixar referência cruzada. Risco médio | Sites reutilizáveis por cliente, herança projeto/tarefa, triggers de integridade; avisos determinísticos sem distâncias | Testes puros, transações e rollback em staging |
| RBAC, RLS e menu | `requirePermission`, `has_permission`, catálogo RBAC, `RolePermissionSection` | `tasks_read` por si só não autoriza o Centro. Risco alto de exposição | `planning_center.read` e `.write` dedicadas; RLS sem acesso direto; rota privada e sem menu | Grants staging e APIs sem sessão; falta teste autenticado por perfil |

## Baseline e validação desta etapa

- A worktree iniciou limpa. `npm ci --ignore-scripts` instalou dependências sem alterar o lockfile.
- `npm run typecheck:app`, `npm run lint`, `npm run build`, `npm run check:openapi` e `npm run check:migrations` passaram. O lint conserva quatro avisos de hooks em componentes não alterados.
- `npm run test:ci`: 1048 passaram, 4 ignorados, 3 falharam; o gate classificou as 3 como conhecidas e encontrou **0 falhas novas**. A suite não está totalmente verde.
- Dez testes específicos do motor, requisitos e geografia passaram com `node --experimental-strip-types --test`.
- `npm run test:security` não encontra `bun` no PATH neste Windows. A mesma seleção de 7 ficheiros correu com `npx --yes bun@1.3.1 test` e passou: 37 testes, 0 falhas.
- Em `solprojetos-staging` (`caaiydcycrnwcqefdldz`) foram aplicadas, por ordem, as migrations de blocos, duas correções de RPC, catálogo, guarda de automação legada, instalações e integridade das referências de instalações. Nenhuma migration aplicada foi reescrita.
- Ensaio da RPC com `BEGIN … ROLLBACK` devolveu versão 2; a edição legada posterior na mesma transação removeu o bloco. Após rollback, a tarefa permaneceu na versão 1, com data original e zero blocos.
- `task_plan_blocks` tem RLS ativo; `anon` e `authenticated` não têm `SELECT`, nem `EXECUTE` na RPC. `service_role` tem ambos. O advisor de staging regista RLS sem política, que neste caso representa negação de acesso direto.
- Criação repetida de tarefa por requisito, atribuição de instalação do projeto/tarefa e rejeição de instalação de outro cliente foram ensaiadas em transações com rollback. As tabelas `task_plan_blocks`, `project_task_requirements` e `client_sites` ficaram vazias após os ensaios.
- Rota local sem sessão: página 404; API de leitura e cinco APIs de escrita devolvem 401. No Preview Vercel, o acesso sem SSO redireciona para a autenticação Vercel; com acesso técnico ao deployment mas sem sessão da aplicação, a API devolve 401 e a página 404. Testes autenticados de interface e perfis RBAC ainda pendentes.

## Entrega e próximos gates

Acesso experimental: `/internal/planning-preview`, sem entrada no menu e desativado
por omissão. Ativar `PLANNING_PREVIEW_ENABLED=true` apenas em desenvolvimento ou
Preview protegido; a produção devolve 404 independentemente do flag.

O deployment Preview da branch usa variáveis Supabase de staging restritas a
`codex/planning-center-20261102`. A proteção SSO está ativa para o URL do
deployment. O primeiro build falhou porque `ERP_STAGING=true` alterava `distDir`
para `.next-staging`; esta variável foi ajustada para `false` apenas nesta branch,
e o segundo build ficou `READY`. URL validado:
`https://projex-qq2hgyip4-gestao-de-projetos.vercel.app/internal/planning-preview`.

Um ensaio de login no Preview revelou que staging não continha os objetos da
migration histórica `distributed_rate_limits`, embora a aplicação já chamasse
`consume_rate_limit`. A migration aditiva
`restore_distributed_rate_limits_staging_compat` repõe a definição original em
staging sem enfraquecer o limite de tentativas. Um login com credenciais fictícias
inválidas passou de 500 para 401 no mesmo deployment; o acesso direto à RPC
continua negado a `authenticated` e permitido a `service_role`. Ainda falta
confirmar um login válido e a interface com uma sessão de staging autorizada.

Antes de declarar a implementação completa: integrar com segurança o automatismo
legado de modelos e os restantes ecrãs consumidores do motor, validar os testes
autenticados de UI/RBAC. O
catálogo está inicialmente vazio: um configurador autorizado deve associar modelos
a categorias antes de aparecerem requisitos de projeto. A reconciliação
histórica documentada em `database-baseline.md` e `migration-reconciliation.md`
continua a impedir `db push` indiscriminado e promoção automática para produção.
