# Integrações externas de leitura

As integrações utilizam uma chave própria e só podem consultar projetos e tarefas dos clientes ou projetos autorizados. A chave nunca dá acesso direto à Data API do Supabase.

## Criar e gerir

Um utilizador com `roles.manage` cria uma credencial com `POST /api/integrations`:

```json
{
  "name": "Agente de relatórios",
  "permissions": ["projects:read", "tasks:read"],
  "clientIds": ["00000000-0000-4000-8000-000000000001"],
  "projectIds": [],
  "expiresAt": "2027-01-18T00:00:00Z",
  "rateLimitPerMinute": 60
}
```

A resposta `201` inclui a chave uma única vez. Guardá-la no servidor consumidor. `GET /api/integrations` mostra metadados sem o segredo. `DELETE /api/integrations/{id}` revoga-a imediatamente. A rotação consiste em criar uma nova credencial, atualizar o consumidor e revogar a anterior.

## Consultar

```http
GET /api/integrations/v1/projects?page=1&pageSize=25
Authorization: Bearer erp_int_...
```

```http
GET /api/integrations/v1/tasks?projectId=<uuid>&page=1&pageSize=25
Authorization: Bearer erp_int_...
```

As tarefas exigem `projectId`. O servidor verifica se esse projeto pertence ao âmbito da credencial antes de as consultar. Os projetos são filtrados na consulta à base de dados. As chaves são apenas de leitura e têm quota própria, além da quota geral de `/api/v1` para sessões de utilizador.

## Sincronizar alterações

Após uma carga inicial, consultar `GET /api/integrations/v1/projects/changes?since=<ISO-8601>` ou `GET /api/integrations/v1/tasks/changes?since=<ISO-8601>&projectId=<uuid>`. Cada resposta inclui até 100 alterações, `hasMore` e `nextCursor`. Continuar a enviar o mesmo `since` e o cursor devolvido até `hasMore=false`. Registos eliminados surgem com `deleted=true` e `data=null`; os restantes incluem os dados atuais. Guardar o último `updatedAt` e usar uma pequena sobreposição temporal na consulta seguinte, deduplicando por `id` e `updatedAt`, para tolerar atualizações simultâneas.

As listas normais de projetos e tarefas têm uma ordenação estável por data de criação e ID. Para grandes volumes ou sincronização contínua, usar o feed de alterações em vez de paginação por posição.

## Criações idempotentes na API de utilizador

`POST /api/v1/projects` e `POST /api/v1/tasks` aceitam `Idempotency-Key` (8 a 128 caracteres ASCII visíveis). Repetir a mesma chave com o mesmo corpo devolve a resposta guardada e o cabeçalho `Idempotency-Replayed: true`. Reutilizá-la com outro corpo devolve `409`. Uma operação anterior ainda em execução também devolve `409` e `Retry-After`. Caso o registo tenha sido criado mas a resposta não tenha ficado guardada, o servidor devolve `409` com o ID para consulta, evitando uma segunda criação. Não usar a mesma chave para operações de negócio distintas.

## Ativação

Aplicar as migrações `20261018210000_external_api_integrations.sql`, `20261018211000_api_idempotency.sql` e `20261018212000_integration_changes.sql` no Supabase de destino antes de utilizar as rotas. Confirmar que o RPC `consume_rate_limit` está disponível e que a chave administrativa do Supabase está configurada apenas no servidor. Validar em ambiente de teste um cliente autorizado, outro não autorizado, expiração, revogação, duplicação de pedidos e resposta `429` antes de distribuir credenciais.
