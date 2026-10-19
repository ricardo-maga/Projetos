# Remoção de Tickets

O código e a API de Tickets foram retirados. A migração
`supabase/migrations/20261018220000_remove_tickets.sql` remove os dados, as
tabelas `tickets` e `ticket_statuses`, a sequência e as funções de numeração,
as permissões e as notificações que apontam para `tab=tickets`. A função
`write_legacy_batch` deixa de aceitar essas tabelas.

## Estado da aplicação

- Staging: migração `remove_tickets` aplicada em 2026-10-19 e confirmada por
  consultas a `to_regclass`, à definição de `write_legacy_batch` e às permissões.
- Produção: código publicado no `main` pelo PR #63 (`337a6e5`) e migração
  `remove_tickets` aplicada em 2026-10-19. As tabelas, sequência, funções,
  permissões e ligações de notificações foram confirmadas como removidas.
  No domínio `solprojetos.vercel.app`, as rotas antigas devolvem 404 e o
  OpenAPI já não contém Tickets.
- O conector Supabase registou as migrações remotas com versões geradas por ele.
  O ficheiro local é idempotente para permitir a sincronização posterior do
  histórico de migrações sem recriar nem voltar a apagar dados.

As migrações antigas e os relatórios históricos continuam no repositório como
registo do que existiu antes desta remoção.
