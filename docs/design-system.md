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

O inventário desceu de 669 para 499 classes de paleta e de 317 para 112 ocorrências de raios/sombras locais. Permanecem cores de estados e categorias, exemplos na página de documentação e medidas de layout. Estes candidatos ainda exigem classificação/migração específica: esta extensão não equivale à eliminação integral dos estilos dispersos. Os 21 atributos `style` de geometria/dados foram preservados. A validação de compilação não substitui revisão visual autenticada destas novas alterações.
