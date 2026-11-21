# Reconciliação da arquitetura com a main

Estado em 2026-11-09. O porte foi feito a partir da `main` publicada, sem aplicar o snapshot antigo em bloco. Foram conservadas as implementações atuais de Presales, Desenho Mecânico, sincronização particionada e autorização.

## Fronteiras estabelecidas

- As interfaces de Clientes, Projetos, Tarefas, Calendário, Ausências, Acompanhamento, Relatórios, Administração e Comunicação têm entradas próprias em `domains/`.
- As regras e serviços atuais residem nos módulos dos respetivos domínios. Os adaptadores anteriores em `lib/` e `components/` continuam disponíveis para testes, ferramentas e consumidores de compatibilidade; o código interno ativo importa diretamente os módulos dos domínios.
- As rotas de Clientes delegam agora em contrato, serviço, repositório e mapeador de domínio. Mantêm permissões, formato HTTP, releitura autoritativa, auditoria e proteção de projetos associados.
- `useERP` mantém o carregamento particionado, a sincronização herdada e o estado de apresentação; as operações de Clientes, Projetos, Tarefas, Ausências, Calendário, Administração e Comunicação delegam em módulos de domínio. `deleteSyncedEntity` permanece como ponte para as tabelas auxiliares ainda servidas pelo endpoint legado de sincronização.
- `ConfigSection` compõe Sistema, Base de Dados e Auditoria. Utilizadores e associações de grupos, dados de referência, dias especiais, templates de tarefas e comunicação têm componentes próprios. As secções com formulários permanecem montadas durante a troca de separadores para preservar alterações por gravar.
- As rotas ativas de Projetos e Tarefas importam contratos e serviços do respetivo domínio. Os contratos HTTP e OpenAPI foram preservados.

## Compatibilidade controlada

Os reexports em `components/` e `lib/` são entradas históricas usadas por testes, ferramentas de pré-visualização e possíveis consumidores externos. A sua remoção seria uma alteração de compatibilidade distinta desta migração; só deve ocorrer após inventário de consumidores externos. A escrita de dados auxiliares continua a usar a API de sincronização existente, agora encapsulada em `domains/administration/modules/configActions.ts`.

Não foram introduzidas migrações SQL. A leitura das migrações aplicadas e das colunas relevantes em produção e staging não identificou alterações de esquema necessárias para este porte. Os rascunhos SQL do snapshot antigo não foram executados.

## Verificação

- `npm run typecheck:app`: passou.
- `npm run check:openapi`: 16 paths v1 e 4 de integrações, passou.
- `npx --yes bun@1.3.1 test tests`: 1056 passaram, 4 saltados, 0 falharam.
- `npm run build`: passou.
- `git diff --check`: passou.

A validação autenticada da interface e API em pré-visualização é um passo de aceitação separado. Typecheck, testes simulados, CI e build não a substituem. Não foi usada a conta desativada indicada em `AGENTS.md`.

## Adicionar uma operação auditável

- Para alterações PostgreSQL, usar a operação transacional do domínio com o cliente de base de dados do servidor associado ao ator já autorizado. Registar a tabela ou a operação na migração de auditoria, com uma lista explícita dos campos que podem aparecer nos valores anterior e novo.
- Adicionar o nome do módulo, da ação e dos campos em `auditPresentation.ts`. As APIs de consulta e o CSV usam o mesmo formato de evento. Incluir um módulo no histórico do projeto apenas quando a API pode verificar a permissão de leitura correspondente.
- Em operações com vários sistemas, emitir o resultado depois da confirmação ou da compensação. Usar o mesmo identificador para correlacionar os efeitos de uma automação ou as linhas de uma importação.
- Validar a gravação pelo ponto de entrada normal do domínio, incluindo rollback, repetição e permissões de leitura. A migração deve preceder o código que começa a emitir os eventos. Produção e staging têm históricos de migração próprios.
