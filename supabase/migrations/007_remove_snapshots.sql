-- Migration 007: Safely Deprecate and Remove Legacy portal_erp_snapshots
-- After all code dependencies and sync mechanisms have transitioned to direct relational CRUD

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_erp_snapshots') THEN
        DROP TABLE portal_erp_snapshots CASCADE;
    END IF;
END $$;
