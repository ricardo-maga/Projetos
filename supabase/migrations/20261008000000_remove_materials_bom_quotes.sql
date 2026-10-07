-- Removes the retired global material catalog and quote/BOM subsystem.
-- project_materials is intentionally preserved.
BEGIN;
DROP TABLE IF EXISTS public.bill_of_materials CASCADE;
DROP TABLE IF EXISTS public.quotes CASCADE;
DROP TABLE IF EXISTS public.material CASCADE;
COMMIT;
