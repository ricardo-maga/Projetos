# Fase de Qualidade — 29 de outubro de 2026

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
