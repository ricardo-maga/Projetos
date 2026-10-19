# Remoção de Tickets

O código e a API de Tickets foram retirados. A migração
`supabase/migrations/20261018220000_remove_tickets.sql` remove os dados, as
tabelas `tickets` e `ticket_statuses`, a sequência e as funções de numeração,
as permissões e as notificações que apontam para `tab=tickets`. A função
`write_legacy_batch` deixa de aceitar essas tabelas.

## Estado da aplicação

- Staging: migração `remove_tickets` aplicada em 2026-10-19 e confirmada por
  consultas a `to_regclass`, à definição de `write_legacy_batch` e às permissões.
- Produção: migração ainda por aplicar. Publicar primeiro o código sem as rotas
  de Tickets e depois aplicar a migração, para evitar que uma API publicada
  tente escrever nas tabelas já eliminadas.
- A migração pode ser reaplicada quando o ficheiro local for sincronizado com
  staging; os alvos removidos são ignorados nessa segunda execução.

As migrações antigas e os relatórios históricos continuam no repositório como
registo do que existiu antes desta remoção.
