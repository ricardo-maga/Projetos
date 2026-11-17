# Inventário do contrato visual

Data: 16/11/2026. Base: `3ef00322b6a2b8aa0ff4f17b83ae637ca16d0bfd` (`main`, depois dos PRs #152 e #153).

## Método e limites

Executar `node scripts/inventory-visual-styles.mjs` para consultar ou acrescentar `--write` para atualizar `docs/visual-style-inventory.json`. O JSON contém ficheiro, linha, categoria e valor de cada candidato, permitindo acompanhar a redução por lote.

O script percorre recursivamente os ficheiros TSX e CSS de `app`, `components` e `domains` (87 ficheiros nesta base). Usa o parser TypeScript para ler literais e atributos JSX, incluindo constantes e templates. Exclui comentários; em CSS preserva as linhas. Não resolve imports nem interpolações e não inspeciona o CSS compilado. Não cobre `.ts`, conteúdo gerado, HTML externo ou estilos vindos da base de dados. Os números são ocorrências no código, não estilos distintos nem erros. As categorias podem sobrepor-se; não devem ser somadas como uma contagem de defeitos.

| Categoria | Total | Ecrãs e componentes de domínio | Interpretação |
|---|---:|---:|---|
| Classes de cores explícitas | 669 | 658 | Inclui branco/preto, estados e classes `blue-*` já associadas à marca |
| Raios e sombras sem nome semântico | 317 | 311 | Inclui círculos, avatares e sombras intencionais |
| Valores arbitrários Tailwind | 163 | 157 | Inclui limites de altura/largura, posicionamento, tipografia e comportamento responsivo |
| Cores hexadecimais | 250 | 60 | O total inclui definições legítimas do tema no CSS |
| Atributos JSX `style` | 21 | 21 | Inclui geometria calculada e apresentação de dados |
| Propriedades JSX terminadas em `Style` | 6 | 6 | Sobretudo tooltips e legendas de gráficos |

A classificação `foundation` inclui `components/ui`, `components/M3.tsx` e CSS. É uma separação para análise, não uma certificação de conformidade desses ficheiros. Importar um componente partilhado também não garante que todo o ecrã cumpre o contrato.

## Áreas prioritárias

| Área | Cores | Raios/sombras | Valores arbitrários | Intervenção |
|---|---:|---:|---:|---|
| `ProjectSection.tsx` | 168 | 99 | 52 | Materiais, fornecedores, pesquisa, alertas e modais; migrar por bloco |
| `TaskAnalytics.tsx` | 92 | 28 | 0 | Completar contrato de painéis e criar tokens de gráficos/tooltip |
| `app/docs/page.tsx` | 75 | 17 | 6 | Página de documentação também faz parte do produto; incluir em QA própria |
| `AutomationEditor.tsx` | 56 | 25 | 8 | Switch, badges, cartões e editor modal próprios |
| `app/page.tsx` | 45 | 19 | 6 | Acesso, erros e perfil ainda usam estilos locais |
| `ReferenceDataSection.tsx` | 37 | 17 | 11 | Separar apresentação das cores persistidas dos campos auxiliares |
| `AuditLogSection.tsx` | 45 | 8 | 16 | Tabela, filtros e badges de eventos |
| `ConfigSection.tsx` | 43 | 6 | 13 | Separar amostras de temas do aspeto dos controlos |
| `AssigneeSelector.tsx` | 26 | 5 | 2 | Pesquisa e seleção sem componentes partilhados; bom primeiro lote pequeno |

## O que consolidar e o que preservar

- **Apresentação:** superfícies, texto, bordas, foco, cantos, sombras, overlays, formulários e variantes de botões devem usar o contrato partilhado. `blue-*` já acompanha a paleta do tema, mas deve expressar função quando é usado para uma ação ou seleção.
- **Estados:** cores de erro, aviso, sucesso e risco precisam de variantes semânticas. Não converter todos os tons em `primary`; rever contraste e significado.
- **Gráficos:** as nove cores categóricas, eixos, grelhas, tooltip e legendas de `TaskAnalytics` devem passar para um contrato de gráficos. Manter séries distinguíveis e correspondência entre legenda e dados.
- **Dados e amostras:** os hexadecimais do seletor de temas e as cores dos campos auxiliares representam escolhas do utilizador. Manter o valor persistido e centralizar apenas defaults/paletas partilhadas quando apropriado.
- **Geometria:** `ProjectTimeline` tem dez atributos `style`; o calendário operacional tem três e o Dashboard tem dois. Larguras calculadas, colunas, cabeçalhos flutuantes, scrollbar sincronizada e percentagens de progresso não são defeitos a eliminar. Só extrair constantes ou helpers quando preservar os cálculos e a sincronização.
- **Formas funcionais:** `rounded-full` em avatares, indicadores e switches é intencional. Não substituir mecanicamente pelo raio de cartão.

## Ordem de migração

1. **Controlos reutilizáveis:** `AssigneeSelector`, campos de materiais, ações e overlays. Acrescentar os tokens em falta para seleção, overlay e densidade, evitando novos literais por ecrã.
2. **Projetos:** materiais e fornecedores, depois modais e alertas. Rever consulta, pesquisa e abertura/fecho de cada modal em desktop/móvel.
3. **Administração e comunicação:** configurações, campos auxiliares, utilizadores, auditoria e automações. Preservar cores configuráveis e comportamento dos controlos.
4. **Análises:** migrar gráficos e painéis de tarefas, incluindo tooltips e legendas; validar a distinção das séries.
5. **Restantes superfícies:** login/erro/perfil, documentação, foco, clientes, calendário, presales e desenho mecânico. Confirmar cobertura com o JSON completo, não apenas com a tabela de maiores concentrações.

`components/ui` fica como base de controlos e superfícies. `M3.tsx` pode continuar a fornecer composição (cabeçalhos, filtros e navegação), utilizando os mesmos tokens. Consolidar o aspeto de `Button`/`M3Button` e `Card`/`M3Card` sem alterar os respetivos elementos HTML, refs, atributos e contratos de interação.

## Critério de fecho por lote

Registar redução de candidatos e justificar as exceções restantes; verificar build/tipos e os testes funcionais afetados; rever os estados normal, foco, selecionado, erro e desativado em desktop/móvel. As capturas de referência de oito vistas não cobrem todos os modais nem as páginas de documentação, auditoria e automações: acrescentar evidência nessas superfícies durante a migração.

O objetivo não é obter zero valores locais. É ter zero exceções de apresentação sem justificação dentro do lote, mantendo estilos de dados/geometria identificados. Este inventário não modifica a interface nem prova equivalência visual de futuras migrações.


## Atualização da cobertura do inventário

A versão atual analisa também TS, `hooks` e `lib`: 302 fontes, incluindo APIs e helpers. A expressão cobre `accent`, `placeholder`, `caret`, `decoration`, bordas laterais, ring-offset e sombras coloridas. Detetou seis classes de paleta que não entravam no contador antigo; foram corrigidas. Raios sem sufixo e `shadow-2xs` também passaram a ser detetados e foram associados aos tokens `rounded-badge` e `shadow-subtle`. Sufixos incompletos como `-sm` e `-xl` são agora detetados; foram substituídos pelas sombras semânticas correspondentes.

Resultado atual: 0 classes de paleta, 94 formas funcionais aprovadas, 0 sufixos incompletos, 91 valores arbitrários, 268 hexadecimais, 21 atributos `style` e seis propriedades `*Style`. Estes totais têm um âmbito mais amplo do que a linha de base inicial. `npm run check:visual` impede a reintrodução de paletas, formas locais e sufixos incompletos no CI. Continuam a existir as exceções justificadas de dados, geometria e estilos do iframe Swagger, cujo CSS é independente da página principal.
