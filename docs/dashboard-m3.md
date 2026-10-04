# Dashboard M3 e contraste dos botões

## Âmbito

Alteração de apresentação em BentoDashboard e contrato partilhado de foreground
em Button, IconButton e M3Button. Sem alterações de API, autenticação, RBAC,
persistência, SQL ou regras de negócio. Relatório FASE 92-B existente preservado.

## Dashboard

- Cartões Foundation com cantos de 12 px, controlos de 8 px e superfícies claras.
- Cabeçalho M3, indicadores com acentos Domino Blue/Green/Do More Blue e tipografia legível.
- Input, Button, IconButton e Badge existentes reutilizados; sem componentes V2.
- Estado dos projetos continua a usar getProjectStatusStyle/projectStatuses.
- Painel semanal anteriormente escuro passa a uma superfície coerente com os restantes cartões.
- Pesquisa, ordenação, paginação, totais de horas, comentários e ausências preservados.
- Código de estado/cálculos/filtros anterior ao return do Dashboard comparado: idêntico.
- Projetos acessíveis por teclado: botão nativo no título da tabela (preservando
  semântica de linhas/células) e Enter/Space nos cartões; focus visível.
- Em ecrã estreito os cartões empilham; apenas a tabela tem scroll horizontal.

## Botões

- data-filled="true" identifica ações preenchidas com fundo forte.
- Regra CSS partilhada mantém texto branco, incluindo spans e SVGs, mesmo perante
  utilities locais de texto que anteriormente podiam substituir text-white.
- Classificador partilhado reconhece backgrounds semânticos e utilities opacas
  fortes; ignora cores apenas de hover, fundos claros e tints/transparências.
- Outline/ghost/tonal e ações selecionadas com fundo suave conservam texto escuro.
- Variante success usa verde derivado Domino #007A2E, mais escuro que o verde oficial,
  para manter melhor contraste com texto branco. Não altera mapas de estados.
- Cores arbitrárias via style/gradientes não são inferidas automaticamente;
  o contrato cobre variantes Foundation/M3 e utilities reconhecidas.

## Validação

- Testes focados: 44 PASS / 0 FAIL, quatro ficheiros; dez testes novos.
- Suite global final: 830 PASS / 54 FAIL / 1 ERROR, 884 testes, 57 ficheiros,
  12,16 s na confirmação sem build em paralelo (17,26 s na execução paralela).
  Antes: 820 PASS / 54 FAIL / 1 ERROR.
- Comparação das 53 falhas JUnit com a auditoria anterior: mesmos nomes;
  52 diagnósticos idênticos e um diagnóstico de timeout no teste transversal
  FASE 65-D, que antes falhava por paths Windows. O scan do filesystem excedeu
  o timeout padrão neste ambiente; não foi contado como teste novo falhado.
  A primeira execução desta implementação (7,39 s) reproduziu os 53 diagnósticos
  anteriores integralmente. Bun também contabiliza o erro de carregamento
  Supabase FASE 79 como FAIL e ERROR, conforme explicado no relatório 92-B.
- Diagnóstico isolado FASE 65-D com timeout de 15 s: 14 PASS / 1 FAIL;
  reproduziu exatamente o erro de paths Windows anterior em 2,49 s, confirmando
  que o timeout global não encobria uma nova falha funcional desse teste.
- Lint separado: PASS (sem warnings/errors).
- Build final: compilação Next concluída em 48 s; build completo bloqueado depois por spawn
  EPERM, a restrição de processos já observada no ambiente. Não é build PASS.
- Type-check global continua falhado: diagnóstico nullable em BentoDashboard já
  existente e tipos bun:test ausentes, incluindo o novo teste. Não foram
  instaladas dependências nem alterado tsconfig para ocultar esses problemas.
- git diff --check sem erros.

## Verificação no browser

Pré-visualização SSR local com dados inteiramente fictícios, componentes reais
e CSS compilado pelo Tailwind instalado. Nenhuma sessão ou base de dados usada.

- Inspeção visual de cartões, tabela, widgets e estados no viewport normal.
- Viewport 390 × 844: página sem overflow horizontal; tabela de 620 px dentro de
  contentor de 341 px com overflow-x:auto. Override de viewport reposto.
- getComputedStyle confirmou foreground rgb(255,255,255) em azul, verde,
  vermelho, verde customizado e M3 danger; span com text-error também branco.
- Fundos claros e tonal M3 mantiveram foreground escuro.

Limitação: esta pré-visualização é SSR sem hidratação e não prova pesquisa,
paginação ou navegação end-to-end na sessão de produção. Os handlers existentes
foram preservados e cobertos pelos testes/inspeção de código.

## Ficheiros desta implementação

- app/globals.css
- components/BentoDashboard.tsx
- components/M3.tsx
- components/ui/Button.tsx
- components/ui/IconButton.tsx
- components/ui/buttonAppearance.ts
- tests/dashboard-m3.test.tsx
- docs/dashboard-m3.md

Validação acima refere-se à implementação inicial do Dashboard. A publicação
inclui a paleta Domino; resultados atualizados em domino-brand-palette.md.
