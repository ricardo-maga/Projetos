# Material 3 — Gmail/Workspace, fase 2

Implementação na cópia atual do repositório, em `Material3-implementation`.

## Direção visual

A interface usa agora uma paleta clara inspirada no Gmail/Workspace:

- Fundo da aplicação: `#f6f8fc`.
- Superfícies/cartões: `#ffffff`.
- Ações primárias: `#0b57d0`.
- Seleções: `#d3e3fd`, com texto `#041e49`.
- Texto principal: `#1f1f1f`; texto secundário: `#444746`.

Esta decisão substitui visualmente os temas de cor anteriores nos módulos abrangidos, sem modificar configurações na base de dados. Não é uma reprodução integral do Gmail nem uma migração para a biblioteca `@mui/material`.

## Alterações desta fase

- Primitivos M3 reutilizáveis: botões filled/tonal/outlined/text, ações destrutivas, loading, icon buttons, cabeçalhos, filtros e controlos segmentados.
- Estados acessíveis: seleção anunciada, foco por teclado, desativação, nomes dos ícones, redução de movimento e botões que não submetem formulários inadvertidamente.
- Calendário: cabeçalho M3, navegação de 7/14 dias, ações e seleção de utilizadores; remoção de uma renderização duplicada do calendário semanal.
- O meu foco: banner claro e filtros segmentados para tarefas e projetos, preservando a lógica de filtragem.
- Removidas regras CSS globais que alteravam indiscriminadamente alturas de controlos, geometria de tabelas e cores de estados.
- Tickets excluído da normalização; conteúdo Materials/BOM assinalado como excluído, mantendo o tema original nesse painel.

## Limites

Não foram alteradas APIs, autenticação, regras de negócio ou persistência. A migração de todos os formulários e modais para os componentes explícitos permanece por concluir.

O repositório já permite ignorar erros TypeScript e ESLint no build. Uma compilação bem-sucedida, por si só, não significa que essas verificações passaram.

## Validação executada

- 59 testes passaram, sem falhas, em quatro ficheiros: novos testes M3, calendário operacional, preferências de utilizadores e drag & drop.
- Revisão no navegador com os componentes reais e dados fictícios: cores calculadas `rgb(246, 248, 252)` para o fundo e `rgb(11, 87, 208)` para o primário, mesmo com `data-theme="violet"`.
- Validados seleção de utilizadores, mudança para 14 dias e callback de criação, sem gravar dados.
- Layout revisto em desktop e a 375 px: sem transbordo horizontal da página em O meu foco.
- `git diff --check` passou.
- O compilador Next concluiu a compilação; o build completo ficou bloqueado por `spawn EPERM` ao lançar um processo local. Os erros TypeScript existentes impedem uma validação global limpa.
- `npm ci` encontrou o lockfile incompleto para dependências opcionais; as dependências de revisão foram instaladas sem alterar o lockfile.

A pré-visualização não é uma rota pública da aplicação. Para a repetir, com Bun disponível: `bun run scripts/preview-material3.mjs`, em `http://127.0.0.1:3103/`.

A publicação destas alterações no GitHub foi autorizada. O deploy Vercel permanece por validar.
