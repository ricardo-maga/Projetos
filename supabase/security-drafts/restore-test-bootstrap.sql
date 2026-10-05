-- LOCAL OFFLINE RESTORE TEST ONLY. Never run on production or staging.
-- A new template0 database in the Supabase Postgres image; managed roles
-- are provided by the image, extension placement matches the production dump.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
