# Reconciliação da arquitetura com a main

Estado em 2026-11-08. O porte foi feito a partir da `main` publicada, sem aplicar o snapshot antigo em bloco. As implementações atuais de Presales, Desenho Mecânico, sincronização particionada e autorização foram conservadas.

## Fronteiras estabelecidas

- As interfaces de Clientes, Projetos, Tarefas, Calendário, Ausências, Acompanhamento, Relatórios, Administração e Comunicação têm entradas próprias em `domains/`.
- As regras e serviços atuais de Projetos, Tarefas, Calendário, Ausências, Acompanhamento, Relatórios, Administração e Comunicação residem em módulos de domínio. Os caminhos anteriores em `lib/` e `components/` reexportam para compatibilidade com consumidores ainda existentes.
- `UserSection` trata apenas utilizadores e permissões. `AbsencesSection` contém estado, filtragem, calendário e operações de ausências próprios.
- A configuração de notificações e automações passou a `CommunicationSettingsSection`. `ConfigSection` continua a compor essa área com as restantes configurações.
- As operações cliente de Clientes, Projetos e Tarefas foram extraídas de `useERP` para os módulos dos respetivos domínios. O hook conserva o estado de apresentação, a sincronização herdada e as operações dos outros domínios.
- As rotas ativas de Projetos e Tarefas importam os contratos e serviços do respetivo domínio. Os contratos HTTP e OpenAPI foram preservados.

## Trabalho ainda necessário para fechar a fase 7

1. Extrair os casos de uso e a persistência de Clientes das rotas atuais sem perder as alterações da `main` posteriores ao snapshot. O serviço antigo do snapshot não pode substituir as rotas atuais diretamente.
2. Reduzir as restantes operações de vários domínios em `useERP` e a escrita de compatibilidade do snapshot, mantendo as APIs autoritativas e o controlo de concorrência.
3. Dividir as restantes capacidades de `ConfigSection` pelos domínios proprietários e remover importações internas através de adaptadores legados.
4. Remover reexportações de compatibilidade apenas depois de localizar e migrar todos os consumidores, incluindo testes e integrações externas.
5. Validar os fluxos autenticados de interface e API num ambiente de pré-visualização. Typecheck, testes simulados e build não provam este fluxo.

Não foram introduzidas migrações SQL. A leitura das migrações aplicadas e das colunas relevantes em produção e staging não identificou alterações de esquema necessárias para este porte. Os rascunhos SQL do snapshot antigo não foram executados.

## Verificação local

- `npm run typecheck:app`: passou.
- `npm run check:openapi`: 16 paths v1 e 4 de integrações, passou.
- `npx --yes bun@1.3.1 test tests`: 1061 passaram, 4 saltados, 0 falharam.
- `npm run build`: passou.
- `git diff --check`: passou.

Estas verificações não concluem a fase 7 nem equivalem a uma validação autenticada ou a uma publicação em produção.
