-- Enable Row Level Security enforcement for proper multi-tenant isolation
-- This replaces application-level WHERE tenant_id filters with database-enforced security

-- Drop the existing basic RLS policies from initial schema
DROP POLICY IF EXISTS memories_tenant_isolation ON memories;
DROP POLICY IF EXISTS embeddings_tenant_isolation ON embeddings;
DROP POLICY IF EXISTS sources_tenant_isolation ON sources;
DROP POLICY IF EXISTS tags_tenant_isolation ON tags;
DROP POLICY IF EXISTS entities_tenant_isolation ON entities;
DROP POLICY IF EXISTS actions_tenant_isolation ON actions;

-- Force RLS even for table owners (prevents BYPASSRLS)
ALTER TABLE memories FORCE ROW LEVEL SECURITY;
ALTER TABLE embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
ALTER TABLE actions FORCE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies using session-scoped tenant context
-- The application must set current_setting('pond.current_tenant_id') before queries

-- Memories table policies
CREATE POLICY memories_tenant_rls ON memories
    FOR ALL TO PUBLIC
    USING (tenant_id = current_setting('pond.current_tenant_id')::uuid);

-- Embeddings table policies (inherits tenant isolation through memory_id FK)
CREATE POLICY embeddings_tenant_rls ON embeddings
    FOR ALL TO PUBLIC
    USING (
        memory_id IN (
            SELECT id FROM memories
            WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid
        )
    );

-- Sources table policies (inherits tenant isolation through memory_id FK)
CREATE POLICY sources_tenant_rls ON sources
    FOR ALL TO PUBLIC
    USING (
        memory_id IN (
            SELECT id FROM memories
            WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid
        )
    );

-- Tags table policies (inherits tenant isolation through memory_id FK)
CREATE POLICY tags_tenant_rls ON tags
    FOR ALL TO PUBLIC
    USING (
        memory_id IN (
            SELECT id FROM memories
            WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid
        )
    );

-- Entities table policies (inherits tenant isolation through memory_id FK)
CREATE POLICY entities_tenant_rls ON entities
    FOR ALL TO PUBLIC
    USING (
        memory_id IN (
            SELECT id FROM memories
            WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid
        )
    );

-- Actions table policies (inherits tenant isolation through memory_id FK)
CREATE POLICY actions_tenant_rls ON actions
    FOR ALL TO PUBLIC
    USING (
        memory_id IN (
            SELECT id FROM memories
            WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid
        )
    );

-- Create a helper function to validate and set tenant context
-- This provides a safe way to set the session variable with validation
CREATE OR REPLACE FUNCTION pond_set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
    -- Validate that the UUID is not null and properly formatted
    IF tenant_uuid IS NULL THEN
        RAISE EXCEPTION 'Tenant ID cannot be null';
    END IF;

    -- Set the session variable for RLS policies
    PERFORM set_config('pond.current_tenant_id', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a helper function to get current tenant context
CREATE OR REPLACE FUNCTION pond_get_tenant_context()
RETURNS UUID AS $$
BEGIN
    BEGIN
        RETURN current_setting('pond.current_tenant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'No tenant context set. Call pond_set_tenant_context() first.';
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke BYPASSRLS from all non-superuser roles
-- Note: This assumes application connects with a dedicated role
-- Adjust role names based on your deployment setup
DO $$
DECLARE
    role_record RECORD;
BEGIN
    FOR role_record IN
        SELECT rolname FROM pg_roles
        WHERE NOT rolsuper
        AND rolname NOT IN ('postgres', 'rds_superuser')
    LOOP
        EXECUTE format('ALTER ROLE %I NOBYPASSRLS', role_record.rolname);
    END LOOP;
END $$;

-- Grant usage on the helper functions to application roles
GRANT EXECUTE ON FUNCTION pond_set_tenant_context(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pond_get_tenant_context() TO PUBLIC;

-- Add helpful comments for documentation
COMMENT ON FUNCTION pond_set_tenant_context(UUID) IS
'Sets the tenant context for the current session. Must be called before any data operations.';

COMMENT ON FUNCTION pond_get_tenant_context() IS
'Returns the current tenant context UUID. Throws error if not set.';

COMMENT ON POLICY memories_tenant_rls ON memories IS
'Enforces tenant isolation using session-scoped current_setting(pond.current_tenant_id)';

COMMENT ON POLICY embeddings_tenant_rls ON embeddings IS
'Inherits tenant isolation through memory_id foreign key to memories table';

COMMENT ON POLICY sources_tenant_rls ON sources IS
'Inherits tenant isolation through memory_id foreign key to memories table';

COMMENT ON POLICY tags_tenant_rls ON tags IS
'Inherits tenant isolation through memory_id foreign key to memories table';

COMMENT ON POLICY entities_tenant_rls ON entities IS
'Inherits tenant isolation through memory_id foreign key to memories table';

COMMENT ON POLICY actions_tenant_rls ON actions IS
'Inherits tenant isolation through memory_id foreign key to memories table';