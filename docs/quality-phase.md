# Fase de Qualidade — 29 de outubro de 2026

Atualização de 2 de novembro de 2026: os três testes de apresentação/rascunho pendentes foram alinhados com o CSS atual e com os 35 alvos que o rascunho SQL realmente enumera. A revisão visual autenticada e os quatro testes físicos de BD continuam a ser verificações independentes.

Revisão autenticada de produção em 2 de novembro: Projetos apresentou a lista paginada e os estados; Dashboard apresentou os quatro cartões de resumo em duas colunas no viewport observado, o Forecast e os estilos dos estados; Auditoria apresentou os registos recentes. Não foram executadas mutações pela interface. A suite local após `npm ci` registou 1041 aprovados, 4 ignorados e zero falhas. A consulta de auditoria passou a ser pedida apenas ao entrar nessa vista; as restantes entidades continuam dependentes do snapshot global.

Continuação da fase de dados: `project_materials` deixou de bloquear o snapshot inicial. A API paginada é chamada quando se abre Dashboard, Projetos ou Relatórios; essas vistas mostram carregamento ou erro até terem materiais, evitando indicadores calculados sobre uma lista vazia. As outras entidades partilhadas e as mutações legadas ainda dependem do snapshot global. Os quatro testes físicos SQL continuam ignorados: o Docker local está indisponível e os testes existentes escrevem em staging com uma chave privilegiada, pelo que não devem ser executados sobre dados reais sem uma base isolada.

Consultas de catálogo, apenas de leitura, em produção e staging confirmaram `tasks_project_id_fkey` validada com `ON DELETE RESTRICT`, `planning_allocations_task_id_fkey` validada com ação padrão `NO ACTION`, e `tasks.project_id` anulável. Isto confirma o schema esperado para três cenários, mas não prova o comportamento da API nem substitui os quatro testes físicos ignorados.

## Controlos de release

O workflow `production-readiness.yml` executa typecheck, lint, build,
validação OpenAPI, verificação das migrations e a suite completa em cada PR e
push para `main`. O E2E de segurança usa a publicação de produção apenas após
o push para `main`.

`npm run test:ci` usa Bun 1.3.1 em CI e, no Windows sem Bun no PATH, obtém a
mesma versão através de `npx`. O gate falha se surgir um teste novo falhado, se
uma entrada da baseline deixar de falhar, se o executor terminar com código
inesperado ou se faltar um resumo coerente de testes. A lista de exceções fica
em `tests/known-failures.json` e só deve ser reduzida depois de confirmar a
suite completa.

Nesta fase, o teste local completo passou no gate com 1027 testes aprovados,
4 ignorados e 3 falhas conhecidas, contra 21 falhas conhecidas na fase
anterior. O harness dos componentes foi atualizado para executar a guarda de
ações assíncronas sem chamar hooks React fora do renderizador. As fixtures de
ausências, clientes, calendário e execução de tarefas passaram a representar
as permissões e contratos atuais. A timeline passou a mostrar horas previstas
nos cartões compactos, também quando a tarefa aparece em «Outras tarefas».

## Pendências explícitas

1. Os dois testes visuais do Dashboard ainda esperam classes antigas de grid e
   acentos de marca. O grid atual usa uma container query em `app/globals.css`.
   Rever o aspeto com uma sessão autenticada antes de alterar os estilos ou os
   testes de apresentação.
2. O rascunho histórico `supabase/security-drafts/20261005_backend_only_rls.sql`
   enumera 35 tabelas, enquanto o respetivo teste e `docs/rls-cutover.md`
   dizem 40. O rascunho está fora de `migrations/`; não o promover nem
   completar a lista por suposição. Reconciliar com o inventário aplicado em
   staging e produção antes de qualquer novo cutover.
3. Quatro testes de integridade física da FASE 79 continuam ignorados por
   dependerem de uma base de dados de teste adequada. O gate mostra essa
   contagem separadamente; o resultado local não prova esses cenários SQL.

CI, publicação Vercel, estado da base de dados e revisão visual da interface
são verificações independentes. O E2E atual valida autorização e fronteiras de
dados; não substitui uma revisão visual autenticada das secções.
