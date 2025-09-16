import { Client } from "@db/postgres";

/**
 * Represents a database schema migration.
 */
export interface Migration {
  /** Unique version number for ordering migrations */
  version: number;
  /** Human-readable name describing the migration */
  name: string;
  /** SQL statements to execute for this migration */
  sql: string;
}

/**
 * Manages database schema migrations with version tracking.
 *
 * Provides safe, transactional migration execution with automatic rollback
 * on failure. Tracks executed migrations in a dedicated table to prevent
 * duplicate execution.
 *
 * @example
 * ```typescript
 * const client = new Client(config);
 * await client.connect();
 * const runner = new MigrationRunner(client);
 *
 * const migrations = [
 *   { version: 1, name: "initial_schema", sql: "CREATE TABLE..." },
 *   { version: 2, name: "add_indexes", sql: "CREATE INDEX..." }
 * ];
 *
 * await runner.runMigrations(migrations);
 * console.log(`Current version: ${await runner.getCurrentVersion()}`);
 * ```
 */
export class MigrationRunner {
  /**
   * Creates a new migration runner.
   *
   * @param client - Connected PostgreSQL client for executing migrations
   */
  constructor(private client: Client) {}

  async initialize(): Promise<void> {
    // Create migrations tracking table if it doesn't exist
    await this.client.queryArray`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    await this.initialize();

    // Get already executed migrations
    const result = await this.client.queryObject<{ version: number }>`
      SELECT version FROM schema_migrations ORDER BY version
    `;

    const executedVersions = new Set(result.rows.map((row) => row.version));

    // Run pending migrations
    for (const migration of migrations.sort((a, b) => a.version - b.version)) {
      if (executedVersions.has(migration.version)) {
        console.log(
          `Migration ${migration.version} (${migration.name}) already executed`,
        );
        continue;
      }

      console.log(`Running migration ${migration.version}: ${migration.name}`);

      const transaction = this.client.createTransaction(
        `migration_${migration.version}`,
      );

      try {
        await transaction.begin();

        // Execute migration SQL
        await transaction.queryArray(migration.sql);

        // Record successful execution
        await transaction.queryArray`
          INSERT INTO schema_migrations (version, name)
          VALUES (${migration.version}, ${migration.name})
        `;

        await transaction.commit();
        console.log(`✅ Migration ${migration.version} completed successfully`);
      } catch (error) {
        await transaction.rollback();
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  async getCurrentVersion(): Promise<number> {
    const result = await this.client.queryObject<{ version: number }>`
      SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1
    `;

    return result.rows.length > 0 ? result.rows[0].version : 0;
  }

  rollback(_targetVersion: number): void {
    // TODO: Implement rollback functionality
    // This would require down migrations
    console.warn("Rollback functionality not yet implemented");
    throw new Error("Rollback not implemented");
  }
}
