-- The previous migration enabled row-level security, but it protected nothing:
-- the application was connecting as a superuser, and superusers bypass RLS
-- unconditionally. FORCE ROW LEVEL SECURITY does not apply to them either.
--
-- So the running application gets its own role, which is deliberately ordinary:
-- no superuser, no BYPASSRLS. Migrations and the seed keep using the owner.

DO $$
BEGIN
  -- Only created when absent, so a deployment can pre-create the role with a
  -- real password and this migration will just grant to it.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventra_app') THEN
    CREATE ROLE inventra_app
      LOGIN PASSWORD 'inventra_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO inventra_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO inventra_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inventra_app;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO inventra_app;
GRANT EXECUTE ON FUNCTION current_tenant_is_bypass() TO inventra_app;

-- Tables added by later migrations (the six catalogs, the registers) are
-- granted automatically, so this does not have to be repeated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventra_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO inventra_app;
