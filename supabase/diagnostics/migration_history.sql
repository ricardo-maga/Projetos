-- Read-only migration history inventory. Run separately against staging and production.
-- Record project ref and UTC timestamp alongside the result.
select version,
       name,
       coalesce(array_length(statements, 1), 0) as statement_count,
       length(array_to_string(statements, E'\n')) as sql_characters,
       md5(array_to_string(statements, E'\n')) as sql_md5
from supabase_migrations.schema_migrations
order by version;
