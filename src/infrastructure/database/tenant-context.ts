import { Client } from "jsr:@db/postgres";

/**
 * Multi-tenant context manager for PostgreSQL.
 *
 * Handles tenant isolation using PostgreSQL's Row Level Security (RLS) by
 * managing session-scoped configuration variables. Works in conjunction with
 * RLS policies defined in the database schema to ensure complete data isolation
 * between tenants.
 *
 * @example
 * ```typescript
 * const client = new Client(config);
 * await client.connect();
 * const tenantContext = new TenantContext(client);
 *
 * // Set tenant for all subsequent queries
 * await tenantContext.setTenant("550e8400-e29b-41d4-a716-446655440000");
 *
 * // Or execute within specific tenant context
 * await tenantContext.withTenant(tenantId, async () => {
 *   return await repository.findAll(tenantId);
 * });
 * ```
 */
export class TenantContext {
  /**
   * Creates a new tenant context manager.
   *
   * @param client - Connected PostgreSQL client for setting session variables
   */
  constructor(private client: Client) {}

  /**
   * Set the current tenant context for all subsequent queries
   * This works with the RLS policies defined in the schema
   */
  async setTenant(tenantId: string): Promise<void> {
    await this.client.queryArray`
      SELECT set_config('pond.current_tenant_id', ${tenantId}, false)
    `;
  }

  /**
   * Clear the tenant context
   */
  async clearTenant(): Promise<void> {
    await this.client.queryArray`
      SELECT set_config('pond.current_tenant_id', '', false)
    `;
  }

  /**
   * Get the current tenant ID
   */
  async getCurrentTenant(): Promise<string | null> {
    const result = await this.client.queryObject<{ current_setting: string }>`
      SELECT current_setting('pond.current_tenant_id', true) as current_setting
    `;

    const setting = result.rows[0]?.current_setting;
    return setting && setting !== "" ? setting : null;
  }

  /**
   * Execute a function within a specific tenant context
   */
  async withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const previousTenant = await this.getCurrentTenant();

    try {
      await this.setTenant(tenantId);
      return await fn();
    } finally {
      if (previousTenant) {
        await this.setTenant(previousTenant);
      } else {
        await this.clearTenant();
      }
    }
  }

  /**
   * Create a new tenant (if needed for initialization)
   */
  async createTenant(tenantId: string, name: string): Promise<void> {
    // In a more complex system, you might have a tenants table
    // For now, tenants are identified by UUID and managed by the application
    console.log(`Tenant ${tenantId} (${name}) initialized`);
  }

  /**
   * Validate that a tenant ID is properly formatted
   */
  validateTenantId(tenantId: string): boolean {
    // UUID v4 format validation
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(tenantId);
  }
}
