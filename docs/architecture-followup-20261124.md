# Continuação de 24 de novembro

As criações e edições já usavam APIs de domínio na main. O POST de sincronização foi retirado: valida a sessão e devolve 410 sem persistir. As eliminações de comentários e ausências passaram a rotas com ID no URL; templates e dias especiais usam DELETE nas suas rotas existentes. O handler partilhado conserva permissões, rate limit, validação UUID e propriedade das ausências no próprio DELETE. A rota genérica antiga devolve 410.

A atividade (comentários, ausências e riscos) é carregada apenas quando se entra numa vista que depende dela. As notificações têm uma partição própria para o cabeçalho. Diretório e trabalho continuam partilhados no arranque; materiais, templates, automações e configurações de notificações mantêm os seus carregadores por vista. Erros de atividade impedem renderizar indicadores incompletos e oferecem repetição.

O script `scripts/verify-domain-writes-local.ts` recusa bases fora de localhost. Foi executado contra o Docker local com a baseline de staging, sem dados reais. Passaram criação, edição, releitura, conflito e eliminação de comentários, ausências, riscos, materiais e automações; passou também o rollback do lote após falha de chave estrangeira. Todas as fixtures sintéticas foram removidas. Estes testes cobrem serviços e PostgreSQL; não são E2E de browser nem a execução dos quatro testes SQL históricos pendentes.

`npm run check:migrations:remote` compara versões e nomes com ambos os históricos remotos. O workflow `migration-parity.yml` executa-o em dias úteis e por dispatch; requer o secret `SUPABASE_ACCESS_TOKEN` no environment production. A ausência da credencial falha explicitamente. Não se considera a primeira execução remota automatizada validada antes de a observar em Actions.

A comparação por leitura MCP encontrou versões divergentes e migrations em falta em staging. Os ficheiros foram alinhados com o SQL recuperado de `schema_migrations.statements`, sem alterar as bases remotas. A verificação atual encontra 16 entradas correspondentes em produção e 19 em staging. A comparação de versões/nomes não demonstra equivalência completa dos schemas.
