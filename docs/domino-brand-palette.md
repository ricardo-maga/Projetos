# Paleta Domino

Fonte: domino-x-one-page-brand.pdf, página 1. Alteração exclusivamente visual.

| Família | 100% | 60% | 30% | 10% |
| --- | --- | --- | --- | --- |
| Domino Blue | #003B5C | #66899D | #B2C4CE | #E5EBEF |
| Domino Green | #009639 | #66C088 | #B2DFC3 | #E5F4EB |
| Do More Blue | #4298B5 | #8EC1D3 | #C6E0E9 | #ECF5F8 |

Texto principal: charcoal #1A1A1A. Ações principais: Domino Blue; navegação
selecionada: Do More Blue 30%; fundo: Do More Blue 10%; cartões: branco.
Foundation, M3 e utilitários blue legados partilham a paleta, incluindo Login.
Os aliases são definidos no mesmo âmbito dos tokens para evitar resolver uma
cor antiga antes de a herdar.

Os estados configurados e os helpers canónicos permanecem intactos.
Erros, avisos e progresso conservam a sua semântica. Acentos do Dashboard
usam Domino Green e Do More Blue, sem lhes atribuir significado de estado.

Texto branco em ações preenchidas permanece obrigatório. Domino Blue oferece
contraste 11,80:1 com branco. O verde oficial oferece apenas 3,87:1; por isso a
variante success usa o tom derivado #007A2E (5,49:1), preservando o verde oficial
nos acentos. Hover/active azuis também são tons derivados mais escuros.
Botões claros/tonais conservam texto escuro. Não houve alterações ao logótipo,
fonte, autenticação, APIs, SQL, persistência ou regras de negócio.

Esta publicação inclui o redesign M3 do Dashboard e o contrato de texto branco
nos componentes Button, IconButton e M3Button, anteriormente não publicados.

## Validação desta alteração

- Testes focados: 48 PASS / 0 FAIL em cinco ficheiros.
- Suite global: 834 PASS / 54 FAIL / 1 ERROR, 888 testes em 58 ficheiros.
  As 53 falhas JUnit têm os mesmos nomes da baseline; o erro de carregamento
  Supabase também é contabilizado pelo Bun como uma falha. Nenhuma falha nova.
- Lint: PASS, sem warnings/errors. git diff --check: PASS.
- Build: compilou em 57 s, mas terminou com spawn EPERM (errno -4048).
  Não é build PASS. Restrição local de processos já presente antes da alteração.
- Pré-visualização SSR do Dashboard real com dados vazios e sem sessão/BD:
  inspeção visual e getComputedStyle confirmam #003B5C/branco no botão principal,
  #007A2E/branco em success, vermelho/branco em danger e #C6E0E9/#003B5C em tonal.
  Fundo #ECF5F8 e texto #1A1A1A confirmados, mesmo com data-theme="violet".

Findings mantidos: falhas globais pré-existentes (Supabase não configurado e
assertions de paths Windows) e impossibilidade de completar build neste ambiente.
Estilos locais legados não baseados em tokens não foram redesenhados nesta fase.
