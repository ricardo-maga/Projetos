# Inventário da base de dados — 29 de outubro de 2026

Para o mapa completo entre versões locais, produção e staging, e os bloqueios ao `db push` automático, consultar [migration-reconciliation.md](migration-reconciliation.md). Esse inventário foi atualizado após este baseline e regista uma migration adicional em staging.

## Projetos e histórico

| Ambiente | Projeto Supabase | Migrations registadas após esta fase | Últimas versões desta fase |
| --- | --- | ---: | --- |
| Produção | `ProjectTool` (`lydxxrzbytfzrsuxptsm`) | 33 | `20261029111026` e `20261029111027` |
| Staging | `solprojetos-staging` (`caaiydcycrnwcqefdldz`) | 31 | `20261029111003` a `20261029111007` |

O histórico remoto foi consultado em cada projeto. As versões e algumas
migrations anteriores diferem entre os ambientes. Por exemplo, staging contém
as migrations de automação de servidor e produção contém as de integrações
externas. Nenhum histórico remoto regista as versões antigas `001`–`010`.
Existem dois ficheiros locais com versão `009`; são scripts históricos distintos.
Não os renomear nem executar automaticamente sobre os projetos atuais. O novo
`check:migrations` permite apenas essa duplicação conhecida e rejeita novas
versões repetidas.

| SQL do repositório | Versão aplicada em staging | Versão aplicada em produção |
| --- | --- | --- |
| `20261011212756_lock_down_planning_data_api.sql` | `20261029111003` | `20261011212756` (histórico anterior) |
| `20261012210139_lock_down_app_configuration_data_api.sql` | `20261029111005` | `20261012210139` (histórico anterior) |
| `20261029110544_restrict_project_delete_rpc_to_service_role.sql` | `20261029111006` | `20261029111026` |
| `20261029110831_restrict_permission_rpc_to_service_role.sql` | `20261029111007` | `20261029111027` |

O conector Supabase atribuiu versões próprias ao aplicar o mesmo SQL em cada
projeto. Por isso, a equivalência acima foi verificada por nome e pelo estado
dos grants; não se deve comparar apenas os números das versões.

## RLS, grants e RPCs

As consultas de metadados em [access_inventory.sql](../supabase/diagnostics/access_inventory.sql)
foram executadas separadamente nos dois projetos, antes e depois das alterações.
Não foram consultados registos de utilizadores.

| Verificação após a fase | Produção | Staging |
| --- | ---: | ---: |
| Tabelas `public` | 55 | 54 |
| Tabelas `public` sem RLS | 0 | 0 |
| Tabelas com `SELECT` para `anon` | 0 | 0 |
| Tabelas com `SELECT` para `authenticated` | 2 | 2 |
| `authenticated` pode executar `delete_project_transaction` | não | não |
| `authenticated` pode executar `has_permission` | não | não |
| `service_role` pode executar ambas | sim | sim |

As duas tabelas ainda legíveis por `authenticated` são `permissions` e
`role_permissions`, cada uma com política RLS. Antes desta fase, staging também
concedia acesso direto a `app_configuration` e às 11 tabelas internas de
planeamento; foram aplicadas as migrations de revogação já existentes no
repositório. Em produção, `delete_project_transaction` era uma função
`SECURITY DEFINER` executável por `authenticated`, apesar de a eliminação ser
autorizada na API. A nova migration retirou essa execução direta. A RPC
`has_permission` também passou a ser executável apenas pelo servidor.

Os advisors de segurança deixam de listar RPCs `SECURITY DEFINER` executáveis
por utilizadores autenticados. Permanecem avisos de RLS sem política em tabelas
internas (4 em produção, 2 em staging) e de proteção contra passwords expostas
desativada nos dois projetos. RLS sem política é usado como negação de acesso
direto; cada tabela deve continuar a ser revista antes de qualquer grant novo.
Os advisors de desempenho ainda assinalam 34/33 chaves estrangeiras sem índice
e 21/22 índices sem uso em produção/staging, respetivamente. Não foram alterados
índices nesta fase, pois exigem análise de carga e planos de execução próprios.

## Procedimento de verificação por ambiente

1. Confirmar a referência do projeto e listar as migrations remotas. Não
   inferir aplicação a partir do nome de um ficheiro local.
2. Executar `npm run check:migrations` e rever o SQL novo em conjunto com as
   dependências do código publicado.
3. Executar `access_inventory.sql` e consultar os advisors de segurança e
   desempenho. Confirmar em especial RLS, grants `anon`/`authenticated` e
   funções `SECURITY DEFINER`.
4. Aplicar primeiro em staging, verificar permissões e percursos de API, e só
   então aplicar em produção. Alterações destrutivas exigem sequência de
   publicação compatível com o código ainda ativo.
5. Registar as versões realmente aplicadas em cada ambiente e validar a API e
   a interface separadamente. CI e preview não provam o estado de produção.

Nesta fase foram alterados apenas grants e permissões de execução de funções;
não foram alterados registos nem tabelas. Os testes SQL confirmaram o acesso
retirado de `authenticated` e preservado para `service_role`.
