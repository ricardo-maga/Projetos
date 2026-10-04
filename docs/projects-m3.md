# Projetos e projeto individual — M3

## Estado

PASS WITH FINDINGS. Implementação local de apresentação; não foi feito commit,
push ou deploy nesta fase.

## Ficheiros desta implementação

- components/ProjectSection.tsx
- app/globals.css (apenas regras responsivas delimitadas por .m3-projects)
- tests/projects-m3.test.tsx
- tests/fixtures/projects-m3-harness.ts
- docs/projects-m3.md

As alterações locais já existentes em app/page.tsx, BentoDashboard.tsx e
TaskDetailsModal.tsx foram preservadas e não pertencem a esta implementação.

## Apresentação

- Lista: cabeçalho M3, pesquisa acessível, filtro segmentado com seleção
  explícita, Select de gestor/paginação e Button para abrir o projeto por teclado.
- Detalhe: superfícies e tipografia semânticas Domino; navegação por chips
  selecionáveis; ações Foundation e eliminar ghost sem fundo vermelho permanente.
- Progresso: mantém a escala/fases existentes, com a cor do estado atual obtida
  por getProjectStatusStyle, contraste melhorado nos passos e espaço para legendas.
- Visão Geral, Tarefas, Riscos, Análise, criação/edição e formulários auxiliares:
  Button, IconButton, Card, Input, Select e Textarea existentes reutilizados.
- Tarefas: Badge/helper canónico preservados; cartões abrem o modal existente
  também por Enter/Space. Filtros de utilizadores e atribuições não alterados.
- Botões preenchidos continuam com texto branco; ações tonais mantêm texto escuro.
- Texto de sucesso usa success-strong, evitando rótulos verdes claros com baixo
  contraste sobre as superfícies suaves.
- Filtros da lista organizam-se em duas colunas no telemóvel. Tabelas e progresso
  mantêm scroll interno; cabeçalho do formulário deixa de comprimir/expulsar ações.
- Não foram criados componentes visuais duplicados nem dependências.

## Persistência e âmbito

Auditoria comparativa com a cópia capturada antes da implementação:
a lógica entre a entrada de ProjectSection e o return principal é idêntica
desconsiderando whitespace. Handlers de API/persistência, hooks, cálculos,
OCC, filtros, permissões, estados e tratamento de erros não foram reimplementados.
O update de estado continua a enviar exclusivamente statusId; o submit completo
continua a passar o payload existente a updateProject/addProject.

O bloco de Material/BOM, incluindo o seu modal, é byte-identical à cópia inicial.
A navegação para esse separador foi normalizada, mas o seu conteúdo não mudou.
Não foram alterados API, service, SQL, migrations, RPC, RLS, RBAC, autenticação,
sessão, supabaseSync, Planning, Calendar ou Tickets. Apenas o calendário/cronograma
que já pertence ao detalhe do projeto recebe tokens e controlos de apresentação.

## Verificação

- Nove testes novos: SSR de lista/detalhe, soft-delete/permissão de escrita,
  navegação das cinco vistas, reset do formulário de risco, filtros/paginação,
  formulário, payload parcial do estado, abertura da tarefa por teclado e
  submissão real de edição com o payload existente.
- Harness com estado isolado e efeitos controlados, sem mocks globais de módulos,
  sessão ou base de dados. Componentes filhos reais da aplicação.
- 94 testes focados PASS / 0 FAIL em sete ficheiros.
- Suite global: 842 PASS / 55 FAIL / 1 ERROR, 897 testes em 59 ficheiros.
  Comparação com a execução Domino: mesmas falhas anteriores, mais o teste do
  Dashboard cujo cabeçalho já fora removido localmente antes desta fase.
- Lint: PASS, sem warnings/errors. Diff desta implementação: sem whitespace errors.
- Build compilou em 23 s, mas não completou: spawn EPERM. Uma nova tentativa
  encontrou EINVAL/readlink na cache .next dentro do OneDrive; a cache anterior
  foi movida, de forma recuperável, para ../tmp/projects-m3-next-cache-20261005.
  A tentativa com cache limpa ficou sem progresso na compilação e foi
  interrompida. Nenhuma destas tentativas é classificada como build PASS.
- Type-check: falha global. No ficheiro Projetos, setShowAddTaskForm não definido
  já existia na cópia inicial (uma referência, nenhuma declaração); não foi
  introduzido por esta fase. Tipos bun:test em falta também já são um problema.

Pré-visualização SSR local com dados fictícios, componente real e CSS Tailwind:
lista, detalhe, tarefas, análise e edição inspecionados. A 390 px, sem overflow
da página; tabelas/progresso conservam scroll próprio. Filtros em grid de duas
colunas confirmados. Botões Gravar: #003B5C com texto branco. Override de viewport
reposto. Não houve operações na aplicação de produção nem login/BD nos testes
visuais; callbacks e submit foram verificados pelo harness, não por uma sessão real.

## Controlos e estilos residuais

Fora de BOM: zero button/select/textarea nativos; permanecem seis checkboxes
nativos dentro dos labels/listas compostas existentes, conservando checked,
onChange e interação nativa. Não foi introduzido nesting de labels do Checkbox
Foundation nessas estruturas. Zero text-[8/9/10/11px] e text-xs fora de BOM.

Estilos de estados e risco vindos dos helpers canónicos, cores funcionais de
eventos/marcos e fundos de overlay não foram substituídos por mapas locais.
Microtipografia e controlos legados em BOM ficam fora desta migração.

## Findings não corrigidos

1. Falhas globais de ambiente/configuração Supabase e assertions de paths Windows.
2. Teste Dashboard incompatível com a remoção local anterior do cabeçalho.
3. Referência antiga a setShowAddTaskForm sem definição no handler de importação
   de tarefas modelo. Pode afetar essa ação; requer correção funcional separada.
4. Build completo bloqueado localmente por EPERM/cache OneDrive.
5. Modais auxiliares conservam a estrutura existente: esta fase não acrescenta
   focus trap nem substitui a arquitetura dos modais.
