# Serviços de escrita por domínio

As escritas antes concentradas em `lib/supabaseSync.ts` estão em seis serviços: configuração e referências, materiais de projeto, riscos de projeto, comentários e ausências, notificações e regras de automação. Os serviços recebem o cliente de transação injetado e preparam apenas as operações do seu domínio.

`lib/supabase/writeDomainChanges.ts` coordena os serviços, interrompe a operação quando uma validação falha e confirma o lote uma única vez através de `write_legacy_batch`. Mantêm-se as revisões de cada registo e a resposta HTTP 409 em conflitos. O export `saveActiveStateToSupabase` é um adaptador de compatibilidade para os consumidores existentes; deixou de conter mapeamentos e operações de escrita.

Esta extração preserva os endpoints e as verificações de autorização anteriores à persistência. O transporte POST legado continua disponível para as alterações incrementais da interface. A criação de APIs independentes para cada operação é uma alteração de contrato posterior, não uma condição para usar estes serviços.

Revisão autenticada de leitura em produção em 14 de novembro: o carregamento inicial terminou e a lista de projetos apresentou os registos e filtros. A revisão anterior à publicação desta refatoração não valida mutações da nova versão. Os quatro testes SQL destrutivos permanecem desativados por decisão do projeto.
