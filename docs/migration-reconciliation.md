# Reconciliação do histórico de migrations

## Baselines reconstruídas em 5 de novembro de 2026

Produção é a referência funcional. Staging mantém as suas funcionalidades adicionais de planeamento, requisitos e automações; não se transportaram essas estruturas para produção para igualar contagens.

Foram recuperados os **59 scripts exatamente registados em produção** e os **65 de staging** para `database/history/{production,staging}`. Os 86 ficheiros que antes estavam em `supabase/migrations` foram preservados em `database/history/legacy-repository`: são evidência histórica e continuam acessíveis aos testes, mas já não são uma sequência executável. Os hashes SHA-256 dos scripts recuperados e das duas baselines estão em `database/{production,staging}/history-manifest.json` e são verificados por `npm run check:migrations`.

As baselines executáveis são `supabase/migrations/20261105000000_production_baseline.sql` e `database/staging/supabase/migrations/20261105000000_staging_baseline.sql`. Cada uma foi aplicada com `supabase db reset` numa base local vazia. O dump inclui `public`, `private` e `notification_internal`; foi necessário instalar `btree_gist` antes das constraints e repor os grants efetivos das tabelas, que o dump isolado não reproduzia a partir das permissões por defeito. Nenhum dado de negócio foi copiado para a base local.

Comparação dos catálogos `public` após reconstrução:

| Objeto | Produção remota / local | Staging remoto / local |
| --- | --- | --- |
| Tabelas/vistas | 67 / 67 | 71 / 71 |
| Colunas | 563 / 563 | 590 / 590 |
| Constraints | 235 / 235 | 263 / 263 |
| Índices | 145 / 145 | 155 / 155 |
| Funções | 56 / 56 | 66 / 66 |
| Políticas RLS | 85 / 85 | 85 / 85 |
| Triggers | 43 / 43 | 51 / 51 |
| Grants de tabela | 468 / 468 | 496 / 496 |

As assinaturas de todos estes grupos coincidem com as remotas, exceto uma constraint em cada ambiente: `notification_settings_target_group`. O `pg_dump` reescreve casts redundantes da mesma expressão; o nome, a lista de valores aceites e a validação coincidem. `supabase/diagnostics/catalog_fingerprint.sql` e `catalog_objects.sql` permitem repetir a comparação sem consultar linhas de negócio.

Os históricos remotos foram relidos depois da captura e mantinham 59 e 65 versões, sem novas entradas. A CLI v3 exige `--remote=<ref>` para visar um projeto hospedado e `--yes` para alterações remotas. A aplicação das baselines aos ambientes remotos requer apenas a reconciliação de `supabase_migrations.schema_migrations`; os schemas de produção e staging não devem ser recriados por `db push`.

Os quatro testes SQL automatizados da FASE 79 permanecem ignorados conforme decisão do projeto. A reconstrução de schema local não é a execução desses testes nem valida dados, jobs Cron ou fluxos autenticados.

## Reavaliação de 4 de novembro de 2026

Uma primeira leitura de `supabase_migrations.schema_migrations` encontrou **63 entradas em staging** e **57 em produção**. Nesse instante, havia 46 nomes comuns, todos com versões diferentes; 17 nomes existiam apenas em staging e 11 apenas em produção. O repositório contém 84 ficheiros SQL em `supabase/migrations`. Os números da tabela histórica abaixo refletem apenas 29 de outubro e não devem ser usados como estado atual.

Durante esta reavaliação surgiram em staging `presales_basic_registry` e `presales_basic_registry_assertions`, ambas posteriores à primeira leitura. Assim, a contagem de 63 acima é um retrato já ultrapassado, e o histórico de staging ainda está em alteração. Num segundo cruzamento, 49 nomes remotos de staging e 53 de produção tinham ficheiro local homónimo; apenas 1 e 4, respetivamente, coincidiam também na versão. Correspondência de nome e versão não prova SQL nem schema equivalentes.

No catálogo `public`, staging tem 71 tabelas e produção 67. Em ambos os ambientes, zero tabelas estão sem RLS, zero concedem `SELECT` a `anon` e duas concedem `SELECT` a `authenticated`. Estes totais não demonstram equivalência dos schemas, das políticas ou dos dados. As últimas entradas registadas são `restore_distributed_rate_limits_staging_compat` (staging, `20261102193743`) e `exclude_archived_request_reminders` (produção, `20261101233110`).

O histórico continua incompatível com publicação automática por `db push`. Não foi alterado nenhum ambiente nesta reavaliação. A reconstrução e os quatro testes físicos automatizados continuam pendentes: o Docker local não disponibiliza daemon e o utilizador decidiu não criar um ramo Supabase temporário. É necessário comparar o SQL efetivamente aplicado, schema, RLS, grants, funções e constraints antes de definir a baseline ou reparar metadados. A [mudança anunciada para Supabase CLI v3](https://supabase.com/changelog/supabase-cli-v3) em 4 de novembro também exige rever os comandos de CI antes de qualquer atualização da CLI.

Leitura de metadados em produção (`lydxxrzbytfzrsuxptsm`) e staging (`caaiydcycrnwcqefdldz`), cerca das 22:40 UTC. Não foram consultados registos de utilizadores nem alteradas as bases de dados.

## Resultado

**O histórico ainda não está sincronizado para `supabase db push` automático.** O repositório contém 60 ficheiros em `supabase/migrations`, incluindo duas versões históricas `009`. Produção regista 33 migrations e staging 32. O Supabase compara versões dos ficheiros locais com `supabase_migrations.schema_migrations`; correspondência de nome não elimina a divergência de versões. Não executar `db push`, `db reset` remoto ou `migration repair` em qualquer ambiente com esta pasta de migrations.

| Indicador | Produção | Staging |
| --- | ---: | ---: |
| Migrations remotas | 33 | 32 |
| Nome com candidato local | 29 | 25 |
| Nome **e versão** coincidentes | 4 | 1 |
| Migrations remotas sem ficheiro local homónimo | 4 | 7 |
| Tabelas `public` observadas | 55 | 59 |
| Tabelas `public` sem RLS / com `SELECT` de `anon` | 0 / 0 | 0 / 0 |

O histórico de staging passou a incluir `20261029223832_mechanical_design_requests` durante esta análise. Essa migration não está na `main`; as cinco tabelas adicionais são coerentes com uma alteração de schema em curso, mas não foram auditadas funcionalmente aqui. Antes de fechar qualquer baseline, repetir o inventário e coordenar esta alteração.

## Correspondência por nome

Esta tabela é **um mapa de versões, não uma confirmação de SQL idêntico ou de schema equivalente**. Um travessão significa que não existe entrada remota com esse nome.

| Nome | Ficheiro local | Produção | Staging |
| --- | --- | --- | --- |
| `legacy_atomic_writes` | `20261005160525` | `20261005194930` | `20261005161216` |
| `security_function_hardening` | `20261005161953` | `20261005194935` | `20261005162255` |
| `legacy_conflict_http_status` | `20261005162756` | `20261005194942` | `20261005162927` |
| `task_priority_and_reports` | `20261007090000` | `20261007192058` | `20261007190628` |
| `extensible_rbac_multi_role` | `20261007192443` | `20261007193134` | `20261007192443` |
| `rbac_admin_operations` | `20261007200128` | `20261007203703` | `20261007202426` |
| `rbac_role_lifecycle` | `20261007204011` | `20261007212636` | — |
| `rbac_role_lifecycle_staging` | `20261007211000` | — | `20261007210830` |
| `rbac_actor_identity_alignment` | `20261007212752` | `20261007212752` | `20261007211356` |
| `remove_materials_bom_quotes` | `20261008000000` | `20261007233512` | `20261007233303` |
| `secure_notifications_api` | `20261008071348` | `20261008071139` | `20261007232009` |
| `revoke_legacy_security_definer_rpc` | `20261008071423` | `20261008071150` | `20261007232134` |
| `harden_user_roles_data_api` | `20261008071443` | `20261008071202` | `20261007232210` |
| `remove_quotes_permissions_and_legacy_targets` | `20261011000000` | `20261011212701` | — |
| `remove_quotes_project_delete_guard` | `20261011001000` | `20261011212918` | — |
| `lock_down_planning_data_api` | `20261011212756` | `20261011212756` | `20261029111003` |
| `distributed_rate_limits` | `20261011221144` | `20261011221144` | — |
| `lock_down_app_configuration_data_api` | `20261012210139` | `20261012210139` | `20261029111005` |
| `restore_legacy_conflict_http_status` | `20261012221300` | `20261012213633` | `20261012213625` |
| `project_material_permissions_compat` | `20261012224000` | — | `20261012214731` |
| `project_forecast_month` | `20261017000000` | `20261016234209` | `20261016234133` |
| `notification_delivery` | `20261017180000` | `20261017222340` | `20261017220508` |
| `server_automation_execution` | `20261017220000` | — | `20261017220356` |
| `external_api_integrations` | `20261018210000` | `20261018225101` | — |
| `api_idempotency` | `20261018211000` | `20261018225110` | — |
| `integration_changes` | `20261018212000` | `20261018225118` | — |
| `remove_tickets` | `20261018220000` | `20261019202740` | `20261019085923` |
| `align_is_admin_permission_aliases` | `20261019222030` | `20261020104215` | `20261020094302` |
| `calendar_feed_tokens` | `20261023000000` | `20261023112450` | `20261023111011` |
| `add_risk_status_level` | `20261028230539` | `20261028230632` | `20261028230624` |
| `restrict_project_delete_rpc_to_service_role` | `20261029110544` | `20261029111026` | `20261029111006` |
| `restrict_permission_rpc_to_service_role` | `20261029110831` | `20261029111027` | `20261029111007` |

As 22 entradas com o mesmo nome nos dois ambientes têm 13 hashes MD5 de SQL remoto iguais e 9 diferentes. Em sete dos nove casos, o texto coincide após retirar comentários de linha e normalizar espaços: `task_priority_and_reports`, `rbac_actor_identity_alignment`, `secure_notifications_api`, `revoke_legacy_security_definer_rpc`, `harden_user_roles_data_api`, `lock_down_planning_data_api` e `lock_down_app_configuration_data_api`. Esta comparação textual não substitui a verificação do schema final.

Os outros dois casos têm diferenças de SQL efetivas. `notification_delivery` em produção inclui um `UPDATE` adicional de `notification_settings` para `new_project`; na leitura atual, a opção está **ativa em produção** e **inativa em staging**, o que também pode refletir alterações posteriores de configuração. Não harmonizar esse valor sem decisão funcional. `remove_tickets` usa condições diferentes na guarda que verifica referências legadas; as tabelas `tickets` e `ticket_statuses` estão ausentes nos dois projetos. A diferença histórica permanece documentada, mesmo com esse estado final comum.

Foi também comparado o SQL remoto com o ficheiro local homónimo, após retirar comentários de linha e normalizar espaços: **25/29** correspondências textuais em produção e **19/25** em staging. Em produção divergem `rbac_admin_operations`, `rbac_role_lifecycle`, `rbac_actor_identity_alignment` e `align_is_admin_permission_aliases`. Em staging divergem `rbac_admin_operations`, `rbac_role_lifecycle_staging`, `rbac_actor_identity_alignment`, `notification_delivery`, `remove_tickets` e `align_is_admin_permission_aliases`. Algumas diferenças são apenas espaçamento; outras incluem comandos distintos, nomeadamente colunas de auditoria em `rbac_admin_operations`. A normalização é uma triagem textual, não uma prova de equivalência semântica. Estes casos requerem revisão individual antes de marcar versões locais como aplicadas.

## Entradas sem par homónimo

- **Apenas no histórico de produção:** `production_temporary_write_freeze_enable`, `backend_only_rls`, `backend_rpc_access`, `production_temporary_write_freeze_disable`. Os dois últimos scripts de segurança têm rascunhos em `supabase/security-drafts`; não são migrations locais.
- **Apenas no histórico de staging:** `staging_prerequisite_btree_gist`, `rehearsal_temporary_write_freeze_enable`, `rehearsal_temporary_write_freeze_disable`, `rbac_role_lifecycle_audit_schema_fix`, `server_automation_execution_version_fix`, `server_automation_integrated_notifications` e `mechanical_design_requests`.
- **Apenas no repositório, em ambos os ambientes:** os 11 ficheiros `001`–`010` (com duas variantes `009`), os 16 ficheiros de `20260918` a `20261005000000`, e `20261012000000_replace_legacy_materials_quotes_permissions.sql`. A ausência no histórico remoto não prova que o respetivo efeito esteja ausente do schema. Não os reaplicar nem marcar como executados por suposição.

Existem ainda migrations locais aplicadas só num ambiente: integrações externas e limites distribuídos em produção; automações de servidor e compatibilidade de materiais em staging. A decisão de as transportar para o outro ambiente pertence ao respetivo fluxo funcional, não a uma reparação administrativa do histórico.

## Fecho operacional antes de automatizar

1. Estabilizar as alterações de staging em curso e repetir a consulta de `supabase/diagnostics/migration_history.sql` nos dois projetos. Guardar o resultado com data e referência do projeto.
2. Recuperar o SQL **exatamente aplicado** para cada entrada remota e comparar com o ficheiro local homónimo; rever em especial os nove hashes divergentes. Comparar também schema, RLS, grants, funções e constraints resultantes, não apenas nomes.
3. Definir o estado funcional pretendido para cada ambiente. Levar diferenças desejadas por migrations novas e progressivas, primeiro a staging e depois a produção quando aplicável. Não copiar migrations exclusivas apenas para igualar contagens.
4. Criar uma baseline nova e verificável do estado convergente, preservando os scripts históricos fora da sequência executável. Testar a reconstrução numa base isolada e validar `migration list` e o plano de `db push` para **cada** projeto.
5. Usar `migration repair` apenas quando a alteração de schema já estiver comprovadamente presente e a correção do metadado tiver sido revista versão a versão. O comando altera o registo de histórico, não executa SQL. Só depois ativar qualquer publicação automática de migrations.

O `npm run check:migrations` atual valida formato e duplicação de nomes de ficheiro; **não** valida paridade com os projetos remotos. Esta distinção deve permanecer explícita em CI.
