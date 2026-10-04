# FASE 92-B — Auditoria de regressões

## Estado

**PASS WITH FINDINGS**.

**Nenhuma regressão atribuível à FASE 92 foi encontrada.** A comparação executada demonstra que as 53 assertions falhadas e o erro de carregamento já ocorriam no commit imediatamente anterior. Os 13 testes novos passam. Não equivale a certificar o sistema inteiro: o ambiente impede completar o build e executar todos os testes de integração.

Nesta fase apenas foi criado este relatório. Não foram alterados produto, testes, mocks, configuração, SQL, migrations, API, services, RPC, RLS, RBAC, autenticação ou sessão. Não foram feitos commit nem push.

## Baseline

- Repositório local auditado: `Material3-implementation`, branch `main`; working tree inicialmente limpa.
- Baseline: `799829c7ee78eb647639c39322568e65acf9ae83`, 2026-10-04 21:06:56 +01:00.
- FASE 92 / HEAD: `c65e50c397a7ce64030cf4866e0168399483c0e1`, 2026-10-04 21:58:14 +01:00.
- A baseline é o pai imediato de HEAD, não um relatório anterior nem a pasta antiga `App`.
- Baseline extraída com `git archive 799829c`, sem mudar a branch ou sobrescrever ficheiros locais. `node_modules` ligado por junction à mesma instalação do checkout atual.
- Mesmo Windows, PowerShell, Node v26.7.0, Bun 1.4.2 (744846f84), Next 15.4.9 e instalação de dependências; nenhuma credencial acrescentada para fazer testes passar.
- Artefactos comparativos: `../fase92b-audit-a873c47a80dc4b5fb7dd4fa008bd4767/baseline-global.xml` e `current-global.xml`. A cópia baseline também foi preservada nesse diretório, fora do checkout.

## Diff FASE 92

Comando: `git diff 799829c c65e50c`. Exatamente **7 ficheiros, 581 inserções e 118 remoções**.

| Ficheiro | Diff | Classificação |
|---|---:|---|
| components/TaskSection.tsx | 15 linhas +/- | Dois títulos “Lista de tarefas”; responsáveis circulares; +N preservado; tooltip/title passado para span interno; Delete ghost com perigo só hover/focus. Confirmação e handler preservados. |
| components/TaskDetailsModal.tsx | 239 linhas +/- | Allowlist Execute, bloqueio de planeamento, estado primeiro/SingleChoice, assignees fora de planeamento; adoção de Input/Select/Textarea e tokens Foundation. |
| components/ProjectSection.tsx | 7 linhas +/- | Apenas import Badge e substituição do span de estado em Projects → Tasks pelo Badge/helper canónico. |
| components/ui/SingleChoice.tsx | 63 linhas novas | Primitive UI genérico, controlado, com semântica radio e navegação por teclado. |
| tests/fase92-task-execution.test.tsx | 197 linhas novas | 13 testes: payload, submit, SSR, SingleChoice, HTTP mock/OCC e RPC mock. |
| tests/fixtures/fase92-preview.tsx | 33 linhas novas | Fixture de apresentação; não é um novo persistence boundary. |
| docs/fase92-tasks-execution.md | 145 linhas novas | Relatório da fase anterior; não usado como prova de baseline. |

Alterações adicionais que não se resumem aos três requisitos da lista: o modal normaliza labels, tipografia, cores, raios e botão de duplicação; o guard `!canWrite || isSubmitting` também protege create/edit; validação de título passa a ser dispensada em Execute porque esse campo não é editável. Foram revistas explicitamente, não omitidas do inventário. São mudanças locais de Foundation/segurança de submissão, sem refactor de outros domínios.

Não há diff em `hooks`, `lib`, `app` ou `supabase`. Dívida visual de ProjectSection (slate/blue, text-[10px], outras representações antigas de estado) já existe na baseline; não foi criada pela FASE 92.

## Suite global

Comando nas duas cópias, a partir da respetiva raiz:

```powershell
.\node_modules\@oven\bun-windows-x64\bin\bun.exe test tests --reporter=junit --reporter-outfile=<ficheiro-absoluto>
```

O reporter só acrescenta evidência; escopo e execução da suite não foram alterados.

| Medida | Baseline 799829c | FASE 92 c65e50c |
|---|---:|---:|
| Ficheiros/suites de topo percorridos pelo runner | 55 | 56 |
| Suites incluindo describe aninhados no JUnit | 353 | 356 |
| Testes contabilizados pelo runner | 861 | 874 |
| PASS | 807 | 820 |
| FAIL | 54 | 54 |
| ERROR | 1 | 1 |
| Skipped registados no JUnit | 0 | 0 |
| Assertions | 2054 | 2157 |
| Duração Bun | 2,83 s | 5,37 s |
| Exit code | 1 | 1 |

Comparação automática dos **53 nomes completos de assertions falhadas e respetivas mensagens/stacks**: iguais, após substituir apenas a raiz absoluta da cópia por `<ROOT>`. Mesmas linhas de teste. Nenhuma falha nova ou desaparecida. Delta de PASS = +13, correspondente aos novos testes.

Reexecução adicional sem reporter (`bun test tests`) no HEAD: **820 PASS / 54 FAIL / 1 ERROR**, 874 testes, 56 ficheiros, 15,25 s. A duração varia; o conjunto de falhas mantém-se.

### Reconciliação rigorosa dos “54 FAIL + 1 ERROR”

O JUnit contém 53 failures em 873 testcases (baseline: 860). O erro ao importar FASE 79 não aparece como testcase JUnit.

A execução isolada de `tests/fase79-physical-integrity-and-project-boundary.test.ts` nas duas cópias prova **0 PASS / 1 FAIL / 1 ERROR / Ran 1 test**. Portanto, o mesmo incidente de carregamento acrescenta um FAIL e um ERROR à contagem textual do Bun. Não existem 54 assertions independentes mais um segundo incidente.

A matriz abaixo tem as **55 entradas solicitadas dos contadores**: 53 assertions + FAIL de carregamento + ERROR correspondente. As linhas 54 e 55 representam o mesmo incidente; não inventam testes nem causas diferentes. “Skipped=0” não significa que os testes internos da FASE 79 foram executados: o módulo nem chegou a carregar.

## Matriz das 55 ocorrências

“Sim” foi confirmado por execução comparativa, não inferido do domínio. ENVIRONMENT é a classificação primária exclusiva; todas estas ocorrências também são preexistentes temporalmente. Não duplicamos contagens na categoria PREEXISTING.

| # | Teste | Domínio | Tipo / diagnóstico | Existia antes da 92? | Relação com ficheiros 92 | Classificação |
|---:|---|---|---|---|---|---|
| 1 | devolve HTTP 404 ao tentar criar material para projeto inexistente — `tests/bola-idor-auth.test.ts:128:26` | Materials / BOLA | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 2 | devolve HTTP 400 ao associar cliente ou responsável inexistente/eliminado — `tests/bola-idor-auth.test.ts:156:33` | Tickets / BOLA | FAIL: Expected to contain: "cliente"; Received: "supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 3 | nenhum ficheiro fora da lista de exceções legacy consome saveActiveStateToSupabase() — `tests/fase59-sync-boundary.test.ts:161:35` | Sync / arquitetura | FAIL: Lista legacy rejeitada por paths Windows absolutos | Sim: mesmo teste e diagnóstico na baseline | Leitura transversal de fontes; diferença 92 não causa a falha de paths | ENVIRONMENT |
| 4 | garante que apenas lib/planning/allocationService.ts executa escritas (INSERT/UPDATE/DELETE) em planning_allocations — `tests/fase65-d-runtime-integrity-verification.test.ts:48:24` | Planning / integridade | FAIL: Esperava /lib/planning/...; recebeu \\lib\\planning\\... | Sim: mesmo teste e diagnóstico na baseline | Leitura transversal de fontes; diferença 92 não causa a falha de paths | ENVIRONMENT |
| 5 | deve devolver HTTP 401 e não devolver quaisquer dados internos da aplicação — `tests/sync-auth.test.ts:13:26` | Sync / auth | FAIL: Expected: 401; Received: 500 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 6 | deve rejeitar com HTTP 401 para Bearer token inválido sem expor dados internos — `tests/sync-auth.test.ts:41:26` | Sync / auth | FAIL: Expected: 401; Received: 500 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 7 | bloqueia utilizador não autenticado no POST /api/supabase/sync com HTTP 401 — `tests/sync-auth.test.ts:68:26` | Sync / auth | FAIL: Expected: 401; Received: 500 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 8 | bloqueia utilizador não-admin que tenta alterar exclusivamente dados administrativos com HTTP 403 — `tests/sync-auth.test.ts:126:28` | Sync / auth | FAIL: Expected: 403; Received: 500 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 9 | isola entidades com APIs próprias (projects, tasks, clients) impedindo a sua escrita pelo Global Sync — `tests/sync-auth.test.ts:175:28` | Sync / auth | FAIL: Expected: 200; Received: 500 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 10 | Lista tickets ativos e omite tickets eliminados — `tests/tickets-operational.test.ts:133:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 11 | Permite consultar um ticket específico por ID no endpoint individual — `tests/tickets-operational.test.ts:146:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 12 | Retorna 404 para consulta de ticket eliminado — `tests/tickets-operational.test.ts:155:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 13 | Cria ticket operacional completo com servidor como fonte de verdade — `tests/tickets-operational.test.ts:179:26` | Tickets | FAIL: Expected: 201; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 14 | Rejeita criação de ticket associado a cliente inválido ou inexistente (400) — `tests/tickets-operational.test.ts:211:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 15 | Atualiza estado, responsável, prioridade e descrição de ticket existente (200) — `tests/tickets-operational.test.ts:229:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 16 | Preserva estritamente campos imutáveis (id, ticketNumber, createdById, createdDate) em atualizações — `tests/tickets-operational.test.ts:251:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 17 | Permite transição de validação -> aberto — `tests/tickets-operational.test.ts:269:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 18 | Permite transição de aberto -> em_analise — `tests/tickets-operational.test.ts:280:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 19 | Permite transição de em_analise -> resolvido — `tests/tickets-operational.test.ts:291:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 20 | Permite transição para cancelado — `tests/tickets-operational.test.ts:302:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 21 | Permite transição para convertido e associação a projeto — `tests/tickets-operational.test.ts:313:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 22 | Executa soft delete ao eliminar ticket (200) — `tests/tickets-operational.test.ts:324:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 23 | Cria ticket com sucesso quando os dados e permissões são válidos (201) — `tests/tickets-validation.test.ts:139:26` | Tickets | FAIL: Expected: 201; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 24 | Rejeita título vazio ou constituído apenas por espaços em branco (400) — `tests/tickets-validation.test.ts:155:28` | Tickets | FAIL: Expected to contain: "Título do ticket é obrigatório"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 25 | Rejeita associação a cliente inexistente (400) — `tests/tickets-validation.test.ts:167:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 26 | Rejeita associação a cliente eliminado (400) — `tests/tickets-validation.test.ts:179:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 27 | Rejeita associação a utilizador responsável inexistente (400) — `tests/tickets-validation.test.ts:191:28` | Tickets | FAIL: Expected to contain: "utilizador responsável"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 28 | Rejeita associação a utilizador responsável eliminado/inativo (400) — `tests/tickets-validation.test.ts:203:28` | Tickets | FAIL: Expected to contain: "utilizador responsável"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 29 | Rejeita associação a projeto convertido inexistente (400) — `tests/tickets-validation.test.ts:215:28` | Tickets | FAIL: Expected to contain: "projeto"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 30 | Rejeita associação a projeto convertido eliminado (400) — `tests/tickets-validation.test.ts:227:28` | Tickets | FAIL: Expected to contain: "projeto"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 31 | Rejeita submissão de estado inválido (400) — `tests/tickets-validation.test.ts:239:28` | Tickets | FAIL: Expected to contain: "Estado de ticket inválido"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 32 | Enforça createdById com a identidade do utilizador autenticado e ignora body.createdById (Segurança) — `tests/tickets-validation.test.ts:252:26` | Tickets | FAIL: Expected: 201; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 33 | Atualiza ticket existente com sucesso (200) — `tests/tickets-validation.test.ts:273:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 34 | Retorna 404 para Ticket inexistente — `tests/tickets-validation.test.ts:287:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 35 | Retorna 404 para Ticket eliminado — `tests/tickets-validation.test.ts:297:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 36 | Protege campos imutáveis/controlados pelo servidor (id, ticketNumber, createdDate, createdById) no PATCH (400 / preservação) — `tests/tickets-validation.test.ts:313:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 37 | Rejeita cliente inválido/inexistente no PATCH (400) — `tests/tickets-validation.test.ts:341:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 38 | Rejeita cliente eliminado no PATCH (400) — `tests/tickets-validation.test.ts:353:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 39 | Rejeita responsável inexistente no PATCH (400) — `tests/tickets-validation.test.ts:365:28` | Tickets | FAIL: Expected to contain: "utilizador responsável"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 40 | Rejeita responsável eliminado/inativo no PATCH (400) — `tests/tickets-validation.test.ts:377:28` | Tickets | FAIL: Expected to contain: "utilizador responsável"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 41 | Rejeita projeto associado inexistente no PATCH (400) — `tests/tickets-validation.test.ts:389:28` | Tickets | FAIL: Expected to contain: "projeto"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 42 | Rejeita projeto associado eliminado no PATCH (400) — `tests/tickets-validation.test.ts:401:28` | Tickets | FAIL: Expected to contain: "projeto"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 43 | Rejeita estado inválido no PATCH (400) — `tests/tickets-validation.test.ts:413:28` | Tickets | FAIL: Expected to contain: "Estado de ticket inválido"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 44 | Atualiza ticket com relações válidas (cliente, responsável e projeto ativos) com sucesso (200) — `tests/tickets-validation.test.ts:429:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 45 | Devolve estado persistido pelo servidor após UPDATE (server-authoritative) — `tests/tickets-validation.test.ts:449:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 46 | Elimina ticket existente com soft-delete (200) e mantém o registo com deleted: true — `tests/tickets-validation.test.ts:476:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 47 | Retorna 404 ao tentar eliminar ticket inexistente — `tests/tickets-validation.test.ts:491:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 48 | Retorna 404 ao tentar eliminar ticket já eliminado — `tests/tickets-validation.test.ts:499:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 49 | GET individual de ticket eliminado devolve 404 — `tests/tickets-validation.test.ts:515:26` | Tickets | FAIL: Expected: 404; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 50 | GET individual de ticket ativo devolve 200 com os dados corretos — `tests/tickets-validation.test.ts:526:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 51 | Listagem (GET /api/v1/tickets) não apresenta tickets eliminados — `tests/tickets-validation.test.ts:538:26` | Tickets | FAIL: Expected: 200; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 52 | Rejeita criação de Ticket associado a Cliente inexistente (400 Bad Request) — `tests/transversal-crud-integrity.test.ts:332:28` | Tickets | FAIL: Expected to contain: "cliente"; Received: "Supabase não configurado." | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 53 | Se gravação de persistência de Ticket falhar, não devolve 200/201 (retorna 500) — `tests/transversal-crud-integrity.test.ts:349:26` | Tickets | FAIL: Expected: 500; Received: 400 | Sim: mesmo teste e diagnóstico na baseline | Sem cadeia de imports para os quatro componentes 92 | ENVIRONMENT |
| 54 | Carregamento de `tests/fase79-physical-integrity-and-project-boundary.test.ts:9:12` | Supabase / Projects → Tasks | FAIL de carregamento contabilizado pelo Bun; createClient com URL vazia | Sim: reproduzido isoladamente em ambos | Sem import direto/transitivo dos componentes 92 | ENVIRONMENT |
| 55 | Unhandled error between tests — mesmo módulo/linha da entrada 54 | Supabase / infraestrutura | ERROR: supabaseUrl is required | Sim: mesmo erro em ambos | Mesmo incidente da entrada 54, sem relação com o diff 92 | ENVIRONMENT |

### Evidência das causas

- Tickets e Project Materials: guards `isSupabaseConfigured` devolvem HTTP 400 / “Supabase não configurado.” antes das validações pretendidas. Os testes fazem spy de auth/sync, mas não tornam verdadeiro esse guard. Configuração depende de URL e anon key em `lib/supabaseClient.ts:3-6`. Mesma implementação e sintomas antes/depois.
- Sync: `app/api/supabase/sync/route.ts:10-16` testa configuração **antes** de auth e devolve HTTP 500. Explica 401/403/200 esperados versus 500 observados, sem atribuir a falha à UI.
- FASE 59: `tests/fase59-sync-boundary.test.ts:149` remove `process.cwd() + "/"`; paths Windows usam backslashes e não são relativizados, quebrando a comparação com a allowlist.
- FASE 65-D: `tests/fase65-d-runtime-integrity-verification.test.ts:48` procura `/lib/planning/allocationService.ts` num path `\\lib\\planning\\allocationService.ts`.
- FASE 79: `createClient(url, key)` executado no topo do módulo com URL vazia, antes de qualquer teste. Não foram fornecidas credenciais nem acionadas operações na base de dados de produção.

Não há prova de contratos funcionais obsoletos para estes 55 contadores; por isso TEST_OBSOLETE=0. Os testes impedidos pelos guards não foram validados contra a base de dados real.

## Auditoria de dependências

Inspeção de imports/exports e imports dinâmicos através da resolução TypeScript (incluindo aliases), recursivamente em módulos locais, sem seguir código de node_modules:

| Ficheiro de testes com ocorrências | Módulos locais percorridos | Dependência dos quatro componentes 92 |
|---|---:|---|
| bola-idor-auth.test.ts | 24 | Nenhuma |
| fase59-sync-boundary.test.ts | 25 | Nenhuma por imports |
| fase65-d-runtime-integrity-verification.test.ts | 13 | Nenhuma por imports |
| fase79-physical-integrity-and-project-boundary.test.ts | 4 | Nenhuma |
| sync-auth.test.ts | 10 | Nenhuma |
| tickets-operational.test.ts | 15 | Nenhuma |
| tickets-validation.test.ts | 15 | Nenhuma |
| transversal-crud-integrity.test.ts | 26 | Nenhuma |

A ausência de imports, sozinha, não fundamenta a decisão: FASE 59 e 65-D fazem leitura transversal do filesystem e podem observar UI alterada. A falha concreta é a normalização de paths, reproduzida com mensagem idêntica na baseline. Os sete ficheiros 92 não acrescentam writers de planning nem chamadas ao global sync.

Foi pesquisada utilização de snapshots, mocks, fixtures e nomes dos componentes nos oito ficheiros. Não foram encontradas snapshots ou fixtures 92 consumidas pelas assertions falhadas. Os spies de Tickets/auth/sync têm dependências partilhadas, mas a origem do guard sem configuração foi verificada diretamente.

Os testes novos importam efetivamente TaskDetailsModal/SingleChoice, helpers e taskService; leem TaskSection/ProjectSection como fontes. Não usam `mock.module`. Os mocks temporários de `globalThis.fetch` são repostos em `afterEach`. Partilham módulos com outros testes, portanto não se assume isolamento absoluto: a comparação global demonstra que não introduziram falhas adicionais nesta execução.

Testes de Tasks, Projects Tasks e Foundation foram executados separadamente, além da suite global.

## Execute Payload

Cadeia auditada no código atual:

`TaskDetailsModal.handleSave` → `getTaskUpdatePayload` → `updateTask` em useERP → `apiUpdateTask` → PATCH /api/v1/tasks/[id] → `updateTaskServer` → `update_task_atomic`.

### Campos enviados

Allowlist real de `components/TaskDetailsModal.tsx:38-50`:

- `statusId`;
- `assigneeIds`;
- `actualHours`;
- `startDate`, `startTime`;
- `endDate`, `endTime`;
- `notes`.

useERP acrescenta **version** da tarefa local para OCC. No HTTP, `assigneeIds` é convertido em `assignedUserIds`; horas reais são convertidas pelo parser existente. Identidade do ator é acrescentada no servidor, não no formulário.

### Campos excluídos

`title`, `projectId`, `description`, `taskTypeId`, `estimatedDate`, `estimatedHours`, `completedDate`, `priority`, `isMilestone`, cliente derivado e quaisquer atributos fora da allowlist.

O handler constrói valores também de planeamento, mas passa-os pela allowlist **antes** de chamar updateTask. useERP não repõe os campos omitidos: as propriedades correspondentes ficam undefined. apiUpdateTask só serializa propriedades definidas. A API faz merge apenas das datas reais para validar/manter a integridade temporal; não repõe título, projeto ou dados estimados no PATCH.

Estado é o primeiro campo funcional. Planeamento é read-only em Execute; técnicos e todos os seis campos de execução real permanecem editáveis. O modal existente é reutilizado.

Esta proteção evita mutação acidental no fluxo Execute; não é uma permissão de servidor diferenciada por “modo”, nem impede um utilizador com tasks_write de enviar um PATCH de edição autorizado. Nenhum novo boundary de segurança foi prometido ou acrescentado.

## OCC

Sem alterações relativamente à baseline nas camadas posteriores ao modal:

- useERP usa version da tarefa existente; conserva tratamento de 409 e atualização pela resposta autoritativa.
- apiUpdateTask preserva campos omitidos e devolve `isConflict` em 409.
- API valida versão e chama o service com update parcial.
- Service envia `p_expected_version`, `p_update_project_id`, `p_update_assignees` e `p_update_dates` com a mesma semântica.
- Execute não envia projectId: `p_update_project_id=false`. Envia assignees: `p_update_assignees=true`. Envia datas reais: `p_update_dates=true`.
- RPC canónica em `supabase/migrations/20261002000000_task_temporal_integrity_constraints.sql`: compara versão, incrementa version, preserva campos omitidos por COALESCE/flags; atualiza task_assignees na mesma operação.
- SQLSTATE P0001→409, 23514→400, 42501→403 e P0002→404 mantidos; resposta relê task_assignees.
- Nenhuma alteração de SQL, migration, RPC, API, service, RLS ou RBAC.

Contrato coberto por testes focados e doubles de transporte/RPC. Não executado um update contra PostgreSQL real nesta auditoria.

## SingleChoice

Primitive puramente UI, controlado por `value/options/onChange`; apenas ref local para foco. Não tem fetch, storage, store global, regras Tasks nem persistência. Importa `cn` de utils, sem consumir helpers de domínio dentro do primitive.

- `radiogroup` com nome acessível; filhos Button com `role="radio"` e `aria-checked`.
- Um único índice selecionado e um único tab stop. Se valor não estiver nas opções: nenhuma opção checked e primeira focável, sem inventar estado.
- ArrowRight/ArrowDown avançam e fazem wrap; ArrowLeft/ArrowUp recuam; Home/End selecionam extremos; preventDefault e foco no radio correspondente.
- Click/Space/Enter beneficiam do botão nativo; disabled nativo e guard bloqueiam callbacks.
- Button fornece focus-visible; `aria-disabled` no grupo.
- Border/font/tamanho constantes; seleção acrescenta ring (não ocupa espaço de layout); flex-wrap permite responsividade.
- SSR/testes existentes verificam seleção única/disabled; **8 assertions adicionais em execução Bun -e** validaram todas as teclas, wrap, tecla não tratada e lista vazia, sem criar/alterar testes.

Limitação: movimento real de foco no DOM e navegação com leitor de ecrã foram revistos no código, não exercitados num browser autenticado. Não se declara teste E2E que não foi realizado.

## Status SSOT

Mesma cadeia nas três apresentações auditadas:

`taskStatuses` → `getTaskStatusStyle(statusId, taskStatuses)` → `badgeClass`.

- Modal: opções `taskStatuses.filter(s => !s.deleted)`, value=id, label=name; cor através do helper canónico; disabled para view/sem write/submissão.
- Tasks lista: Badge consome helper já existente.
- Projects → Tasks: Badge recém-normalizado usa helper para classe e nome.
- Nenhum mapa local novo done/pending→cor nos ficheiros 92.
- O helper central mantém os seus fallbacks legacy por ID/nome/scale quando configuração falta; esses fallbacks já existiam. Não foram removidos nem duplicados nesta fase.
- ProjectSection tem outras zonas legacy; o diff de 7 linhas não as alterou.

## Testes focados

Executado no HEAD:

```text
bun test tests/fase92-task-execution.test.tsx
  tests/tasksection-operational-table.test.ts
  tests/project-task-assignees-presentation.test.ts
  tests/phase30-task-operations-centralization.test.ts
  tests/fase87-b-tasks-temporal-patch.test.ts
  tests/fase73-tasks-temporal-integrity.test.ts
  tests/fase68-tasks-rpc-canonical-alignment.test.ts
  tests/fase75-b-rbac-eligibility.test.ts
```

Acima representa **um comando** com oito argumentos de ficheiro, usando o Bun local: **129 PASS / 0 FAIL**, 422 assertions, oito ficheiros, **2,03 s**, exit 0.

Segundo comando: `bun test tests/fase85-ui-foundation-normalization.test.ts tests/material3-workspace.test.tsx`: **21 PASS / 0 FAIL**, 78 assertions, dois ficheiros, **0,585 s**, exit 0.

Total focado: **150 PASS / 0 FAIL**; mais oito assertions ad hoc de teclado. Os 13 testes novos estão incluídos nos 129, não somados novamente.

## Build

Comando efetivamente executado nas duas cópias (PowerShell; script npm tem atribuições POSIX não portáveis):

```powershell
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NEXT_IGNORE_INCORRECT_LOCKFILE='1'
$env:NODE_ENV='production'
node --max-old-space-size=4096 node_modules\next\dist\bin\next build
```

HEAD:

```text
✓ Compiled successfully in 18.0s
Skipping validation of types
Skipping linting
> Build error occurred
[Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

**Categoria B: depois da compilação**, na criação de processo/worker. Build completo **não passou** (exit 1). EPERM é falha de spawn/permissões no ambiente, não um diagnóstico de TS/webpack dos componentes 92. Não há evidência de relação causal com o diff 92. A restrição exata de Windows/sandbox não foi contornada nem identificada ao nível da política do sistema.

Build da cópia baseline também foi iniciado, mas ficou sem progresso adicional após “Creating an optimized production build”; foi interrompido após cerca de cinco minutos. Não se afirma que compilou, passou ou reproduziu EPERM. Essa tentativa é uma limitação adicional, não uma prova comparativa de build.

A configuração **já existente** ignora type-check e lint no build; “Compiled successfully” não certifica TypeScript. Lint e tsc foram por isso executados separadamente.

### TypeScript — ressalva ao relatório anterior

Executado `node node_modules/typescript/bin/tsc --noEmit --incremental false` em ambos:

- baseline: exit 2, **203 linhas de diagnóstico error TS**;
- HEAD: exit 2, **202 linhas de diagnóstico error TS**;
- comparação retirando apenas coordenadas linha/coluna: removidos dois TS2322 de `title` em Badge de TaskSection;
- acrescentado **um TS2307** em `tests/fase92-task-execution.test.tsx:1`: tipos de `bun:test` não encontrados.

A deficiência de tipos Bun já afeta inúmeros testes na baseline, mas **a ocorrência no novo ficheiro foi introduzida pelo acréscimo desse teste**. Logo, não é rigoroso dizer que todos os diagnósticos atuais são literalmente anteriores à 92. Não é uma das 55 ocorrências da suite Bun e não demonstra regressão de runtime; é finding de type-check. Não foram instalados tipos nem alterado tsconfig.

## Lint

`node node_modules/next/dist/bin/next lint --no-cache`, com TELEMETRY_DISABLED/IGNORE_INCORRECT_LOCKFILE: **PASS**, exit 0, “No ESLint warnings or errors”. Não foi usado apenas o build que ignora lint.

## Verificação de estrutura/UI

- TaskSection já não contém “Lista Operacional de Tarefas”; ambos os títulos alterados.
- Select de estado antigo removido do modal; uma única representação editável via SingleChoice.
- Pesquisa em TaskDetailsModal e SingleChoice por controlos nativos `<button/<select/<input/<textarea` e classes text-[9/10/11px], text-xs, slate/blue/indigo/rose/emerald indicadas: **zero ocorrências**.
- Native fieldset é legítimo para propagar disabled ao AssigneeSelector existente; Button/Input/Select/Textarea continuam a renderizar elementos HTML nativos através da Foundation.
- TaskSection/ProjectSection conservam código legado fora dos hunks 92. Não foi feita limpeza cega nem imputada essa dívida ao commit auditado.
- Confirmação de Delete, limite de três responsáveis e +N mantidos no diff e testes.
- Guards e modos create/edit/view revistos; não foram alterados handlers de eliminação ou regras de negócio nesta auditoria.

## Resumo estatístico

Classificação primária dos contadores da suite global; não inclui lint/build/tsc.

| Classificação | Quantidade |
|---|---:|
| PREEXISTING | 0 |
| ENVIRONMENT | 55 |
| TEST_OBSOLETE | 0 |
| REGRESSION_92 | 0 |
| POSSIBLE_REGRESSION_92 | 0 |
| UNKNOWN | 0 |
| TOTAL | 55 |

As 55 entradas são ambientais e **já existiam antes**. PREEXISTING=0 apenas evita dupla classificação; não significa ausência de evidência temporal. Incidentes independentes: 54 (53 assertions + um erro de carregamento), devido à dupla contabilização do Bun explicada acima.

## Regressões FASE 92

**Nenhuma regressão atribuível à FASE 92 foi encontrada** entre as ocorrências globais e os contratos funcionais auditados. Não há teste comum que passasse na baseline e agora falhe na suite Bun.

A nova ocorrência TS2307 do teste 92 é documentada separadamente, sem ocultar a sua origem. Não se pode declarar type-check global verde nem validação completa de build/E2E.

## Findings

1. Ausência de configuração Supabase impede executar as validações de negócio pretendidas nos testes afectados; FASE 79 não carrega.
2. Dois testes de arquitetura têm comparações de paths POSIX incompatíveis com Windows, comprovadas em ambos os commits.
3. Build atual termina com spawn EPERM após compilar; build comparativo da baseline não concluiu no tempo limitado. Política exata de permissões não determinada.
4. Type-check global continua falhado; novo teste acrescenta ocorrência TS2307 sobre o problema preexistente de tipos Bun. Eventual correção mínima deverá tratar tipos/runtime de testes numa fase autorizada, sem esconder erros com casts ou exclusões oportunistas.
5. Cobertura nova é sobretudo SSR, análise de source e doubles; navegação real de foco, leitor de ecrã e persistência PostgreSQL não foram validados E2E.
6. Mudanças locais de Foundation no modal são mais amplas que mero reposicionamento do estado, conforme inventário. Não foi detectada falha funcional associada; não foram feitos ajustes visuais nesta auditoria.
7. Dívida visual legacy em ProjectSection está presente na baseline e permanece fora do âmbito.

Nenhum destes findings foi corrigido. As causas dos 55 contadores estão identificadas; as limitações adicionais justificam PASS WITH FINDINGS.

## Recomendação

**Investigação adicional necessária**, dirigida ao ambiente de build, configuração de testes Supabase e type-check, em fase explicitamente autorizada. Não há evidência que justifique uma FASE 92-C corretiva de regressão funcional da suite.

A resposta demonstrada à pergunta central é: **não foi encontrada regressão da FASE 92 na suite existente; as falhas observadas reproduzem-se antes e depois**. Encerramento sem ressalvas exige completar as validações ambientais/E2E pendentes.

