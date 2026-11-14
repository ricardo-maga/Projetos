# Reconciliação de 14 de novembro de 2026

As sequências executáveis foram alinhadas com as versões efetivamente registadas em cada ambiente, preservando as baselines próprias.

| Correção | Produção | Staging |
| --- | --- | --- |
| presales_optional_date_fix | 20261106174015 | 20261106173959 |
| task_hours_correction | 20261114151405 | 20261114151405 |

O SQL foi recuperado de `supabase_migrations.schema_migrations.statements`. As duas correções têm conteúdo igual entre ambientes após normalização das quebras de linha. O ficheiro Presales anteriormente identificado por `20261106000000` foi substituído pela versão remota de produção; os dois ficheiros posteriores à baseline foram acrescentados à sequência de staging.

Esta reconciliação altera apenas ficheiros do repositório. Não reaplica SQL, não altera dados e não modifica os metadados remotos. A correção histórica de horas não deve ser executada novamente sobre os ambientes onde já está registada.
