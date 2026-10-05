-- Apenas leitura. Guardar/exportar todos os resultados antes do cutover.
-- Inventário completo public para detetar também superfícies fora das 40 tabelas.
SELECT n.nspname AS schema_name,c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;

SELECT * FROM information_schema.table_privileges
WHERE table_schema='public' ORDER BY table_name,grantee,privilege_type;
SELECT * FROM information_schema.column_privileges
WHERE table_schema='public' ORDER BY table_name,column_name,grantee,privilege_type;
SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;

-- RPCs SECURITY DEFINER podem contornar RLS: rever corpo, search_path e autorização.
SELECT p.oid::regprocedure AS function_name,p.prosecdef,p.proconfig,p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.oid::regprocedure::text;

-- Views: owner e security_invoker devem ser revistos; RLS nas tabelas não basta.
SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.reloptions,c.relacl,
       pg_get_viewdef(c.oid,true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname;
SELECT pg_get_userbyid(roleid) AS inherited_role,pg_get_userbyid(member) AS member
FROM pg_auth_members ORDER BY member,inherited_role;
SELECT n.nspname,c.relname,c.relacl FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname;
SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname,d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace;
