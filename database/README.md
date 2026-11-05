# Baselines de base de dados

- `../supabase/migrations/`: sequência executável de **produção**.
- `staging/supabase/migrations/`: sequência executável de **staging**, com funcionalidades adicionais próprias.
- `history/production/` e `history/staging/`: SQL exatamente recuperado dos respetivos históricos remotos antes da baseline.
- `history/legacy-repository/`: 86 ficheiros antigos do repositório; preservados para auditoria e testes, nunca para `db push`.

`npm run check:migrations` valida nomes e hashes locais. Para inspecionar a correspondência remota, usar a CLI v3 com destino explícito:

```powershell
npx supabase migration list --remote=lydxxrzbytfzrsuxptsm --workdir .
npx supabase migration list --remote=caaiydcycrnwcqefdldz --workdir database/staging
```

Não executar `db push` se a lista não mostrar a baseline local e remota com a mesma versão. As migrations seguintes devem ser progressivas e separadas por ambiente quando o schema funcional divergir.
