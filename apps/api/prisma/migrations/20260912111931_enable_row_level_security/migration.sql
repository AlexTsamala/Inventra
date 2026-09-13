-- Row-level security: the database refuses to show one tenant's rows to another,
-- even if a query forgets its tenant filter.
--
-- `app.current_tenant` is set per transaction by the application. Three values
-- are meaningful:
--   unset / ''  -> no rows are visible (fail closed)
--   'bypass'    -> all rows are visible; only the auth path sets this
--   '<uuid>'    -> only that tenant's rows are visible

-- Returns the current tenant as a uuid, or NULL when unset, empty, or 'bypass'.
-- The nullif calls matter: casting 'bypass' or '' straight to uuid would raise.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT nullif(nullif(current_setting('app.current_tenant', true), 'bypass'), '')::uuid
$$;

CREATE OR REPLACE FUNCTION current_tenant_is_bypass() RETURNS boolean
  LANGUAGE sql
  STABLE
AS $$
  SELECT coalesce(current_setting('app.current_tenant', true) = 'bypass', false)
$$;

-- FORCE is required: without it Postgres exempts the table owner from its own
-- policies, and the application connects as the owner.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "tenants"
  USING (current_tenant_is_bypass() OR "id" = current_tenant_id())
  WITH CHECK (current_tenant_is_bypass() OR "id" = current_tenant_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "users"
  USING (current_tenant_is_bypass() OR "tenant_id" = current_tenant_id())
  WITH CHECK (current_tenant_is_bypass() OR "tenant_id" = current_tenant_id());

ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "refresh_tokens"
  USING (current_tenant_is_bypass() OR "tenant_id" = current_tenant_id())
  WITH CHECK (current_tenant_is_bypass() OR "tenant_id" = current_tenant_id());

-- roles, permissions and role_permissions are reference data shared by every
-- tenant. They carry no tenant_id and deliberately get no policy.
