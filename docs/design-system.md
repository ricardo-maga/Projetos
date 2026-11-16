# Sistema visual

O tema atual é **Domino Institucional**. O valor persistido `default` é um alias de Domino. Os restantes temas configuráveis continuam disponíveis.

## Camadas

1. **Marca e valores base:** `--brand-*` e `--primary-*` em `app/globals.css`.
2. **Função:** `--color-*-token` e os aliases `--color-*` expostos ao Tailwind.
3. **Apresentação:** `--design-*` para raios, sombras, cabeçalho, navegação, cartões e ações. Os utilitários `rounded-*` e `shadow-*` usam esses valores.

Para mudar o aspeto sem editar cada ecrã, alterar o bloco do tema em `app/globals.css`. Quando se introduz um novo tema, definir os valores `--design-*` no seletor desse tema e voltar a associar os aliases Tailwind nesse mesmo âmbito. Os valores de `:root` são a base dos temas que não definem variantes próprias.

## Componentes partilhados

- `components/ui/Button.tsx` usa `rounded-control`, cores semânticas e `shadow-raised`.
- `components/ui/Card.tsx` usa `rounded-card` e `shadow-card`. A elevação é configurada pelo tema.
- `components/ui/Input.tsx` usa `rounded-control`, superfícies e estados semânticos.
- As classes `m3-*` usam os mesmos tokens de apresentação para a estrutura da aplicação.

As cores de estados, os valores de dados, as posições calculadas da timeline e os temas selecionados pelo utilizador não devem ser substituídos por uma alteração global de aparência. Um redesenho deve ser revisto nos viewports desktop e móvel com as capturas de referência privadas guardadas fora do repositório.

## Extensão do contrato em 16/11/2026

As superfícies neutras, bordas e texto dos controlos, Projetos, Administração, Automação e ecrãs de acesso passaram a usar nomes semânticos. Raios e elevação usam `rounded-control/card/dialog` e `shadow-raised/overlay/modal` nas restantes superfícies. Os círculos de avatares e switches continuam explícitos. Os tokens `--chart-series-*`, `--chart-axis`, `--chart-grid`, `--chart-label` e `--chart-tooltip-*` centralizam as cores dos gráficos, preservando os valores anteriores.

Na primeira extensão, o inventário desceu de 669 para 499 classes de paleta e de 317 para 112 ocorrências de raios/sombras locais.

## Fecho da migração de apresentação

`app/visual-tones.css` define as escalas de ação, feedback, categorias, Forecast e documentação. Usa `@theme inline` para resolver os valores no âmbito do tema ativo. `action-*` acompanha a paleta Domino ou o tema escolhido. Feedback e categorias mantêm escalas distintas; os tons de texto podem ser reforçados para garantir contraste sem substituir as cores configuradas dos dados.

Os rótulos sobre ações preenchidas usam `text-inverse`. O helper `hasFilledButtonBackground` reconhece os novos nomes, mas continua a distinguir preenchimentos sólidos de seleções claras/translúcidas. Os tamanhos pequenos de etiquetas e código usam `text-micro`, `text-small-label` e `text-code-dense`. Sombras de colunas fixas têm tokens próprios.

O inventário após o PR #155 continha **zero classes de paleta explícita** nos literais TSX/CSS analisados. As restantes ocorrências têm estas justificações:

| Categoria | Ocorrências | Contrato/exceção |
|---|---:|---|
| Formas/sombras locais | 95 | Apenas `rounded-full` (círculos, pills, barras e switches), `rounded-xs` (checkbox), `rounded-none` (segmentos/linhas) e `shadow-none` (supressão intencional de elevação). |
| Valores arbitrários | 94 | Limites de viewport/tabelas/modais, grelhas responsivas, posição de elementos fixos, camadas, espessura de ícones e escala de interação. Não contêm cores, sombras ou tamanhos de texto locais. |
| Hexadecimais | 254 | Definições centrais CSS, cores de dados interpretadas pelos helpers, sete amostras de temas em Configurações, paleta/defaults persistidos de campos auxiliares e duas cores do documento Swagger isolado em iframe. O iframe tem CSS próprio porque não herda o tema do documento principal. |
| `style` | 21 | Geometria calculada de timeline/calendário/progresso, transform de ordenação e apresentação de cores de dados. |
| Propriedades `*Style` | 6 | Integração com Recharts; cores usam os tokens `--chart-*`. |

A contagem continua a sinalizar exceções válidas para revisão; não as omite para fabricar um resultado zero. `docs/visual-style-inventory.json` mantém ficheiros e linhas. O scope inclui TSX/CSS das três pastas inventariadas e os helpers `lib/utils.ts` e `lib/planning/summary.ts`; não é uma afirmação sobre CSS de terceiros ou valores vindos da base de dados. Para novos componentes, preferir os componentes partilhados e as funções semânticas existentes; acrescentar uma função central se necessário.


## Auditoria transversal e prevenção de regressões

A auditoria atual inclui **302 ficheiros TS, TSX e CSS** em `app`, `components`, `domains`, `hooks` e `lib`. Abrange também placeholders, accent/caret, decorações, lados de bordas e cores de sombras. Esta extensão revelou seis classes `accent-blue-*`/`placeholder-slate-*` que a expressão anterior não cobria; foram convertidas para funções semânticas.

`npm run check:visual` é executado no CI e rejeita classes de paleta explícita, raios/sombras locais sem exceção aprovada e sufixos incompletos como `-sm`. Os 94 candidatos de forma restantes são exclusivamente `rounded-full`, `rounded-xs`, `rounded-none` e `shadow-none`. Há 91 valores arbitrários de geometria, 268 hexadecimais (incluindo valores de dados/defaults agora lidos nos ficheiros TS), 21 atributos de geometria/cor `style` e seis propriedades Recharts `*Style`. O JSON mantém os locais e valores para revisão.

Os raios sem sufixo passaram para `rounded-badge`; `shadow-subtle` centraliza o antigo valor Tailwind `shadow-2xs` sem alterar a sua medida. Os sete temas resolvem agora os tokens M3, e o verde/âmbar usam tons de ação com contraste para texto branco. A leitura pública, a sincronização e a edição selecionam deterministicamente a mesma linha de configuração em instalações com duplicados históricos, sem eliminar esses registos.

Materiais, riscos, automações e cronograma usam `Dialog`. `Dialog` e `ExpandedView` partilham `useModalInteraction`: foco inicial, ciclo de Tab, Escape apenas no modal superior, retorno de foco e bloqueio de scroll. Os formulários mantêm os handlers e os contratos de dados. As opções `SingleChoice` quebram rótulos longos dentro da largura disponível.

A conformidade estática não fecha a matriz visual/CRUD: os resultados dessa execução são registados separadamente em `application-validation-matrix.md`.

## Contraste do texto e das seleções

`text-primary-ink` resolve `--color-primary-ink` a partir do tom 800 do tema. É a função para texto colorido em links, seleções e fundos translúcidos. Os preenchimentos continuam a usar `primary`/`action-*` com `text-inverse`. Separar estas funções permite alterar uma paleta sem tornar ilegíveis os rótulos sobrepostos a um fundo da mesma cor.

Os textos de sucesso, aviso e erro e os tons suaves da análise têm valores centrais com contraste de rótulo normal. As legendas Recharts usam `--chart-label`; os marcadores continuam a representar a cor da série. O texto do tooltip usa `--chart-tooltip-text`. Os testes verificam os contrastes dos sete temas e das superfícies selecionadas; a inspeção no navegador confronta-os com os fundos efetivamente compostos.
