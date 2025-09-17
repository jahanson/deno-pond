import { Client } from "@db/postgres";
import { walk } from "@std/fs/walk";

/**
 * Represents a database schema migration.
 */
export interface Migration {
  /** Unique version number for ordering migrations */
  version: number;
  /** Human-readable name describing the migration */
  name: string;
  /** SQL statements to execute for this migration (up migration) */
  sql: string;
  /** Optional SQL statements to revert this migration (down migration) */
  downSql?: string;
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
 * // Auto-discover and run migrations from directory
 * await runner.runMigrationsFromDirectory("./migrations");
 * console.log(`Current version: ${await runner.getCurrentVersion()}`);
 *
 * // Rollback to version 1 if needed
 * await runner.rollbackFromDirectory(1, "./migrations");
 *
 * // Manual migrations still supported
 * const migrations = [
 *   {
 *     version: 1,
 *     name: "initial_schema",
 *     sql: "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)",
 *     downSql: "DROP TABLE users"
 *   }
 * ];
 * await runner.runMigrations(migrations);
 * ```
 *
 * Migration file naming conventions:
 * - `001_initial_schema.sql` - Single file with up migration
 * - `002_add_indexes.up.sql` + `002_add_indexes.down.sql` - Separate up/down files
 * - Single file with sections:
 *   ```sql
 *   -- UP
 *   CREATE TABLE users (id SERIAL PRIMARY KEY);
 *
 *   -- DOWN
 *   DROP TABLE users;
 *   ```
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

    // Acquire advisory lock to prevent concurrent migration execution
    // Use a consistent lock ID for migration operations
    const MIGRATION_LOCK_ID = 1000001;

    console.log("Acquiring migration lock...");
    await this.client.queryObject<{ pg_advisory_lock: boolean }>`
      SELECT pg_advisory_lock(${MIGRATION_LOCK_ID}) as pg_advisory_lock
    `;

    try {
      console.log("Migration lock acquired");

      // Re-check executed migrations inside the lock to handle concurrent starts
      const result = await this.client.queryObject<{ version: number }>`
        SELECT version FROM schema_migrations ORDER BY version
      `;

      const executedVersions = new Set(result.rows.map((row) => row.version));

      // Run pending migrations (create sorted copy to avoid mutating input array)
      for (
        const migration of [...migrations].sort((a, b) => a.version - b.version)
      ) {
        if (executedVersions.has(migration.version)) {
          console.log(
            `Migration ${migration.version} (${migration.name}) already executed`,
          );
          continue;
        }

        console.log(
          `Running migration ${migration.version}: ${migration.name}`,
        );

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
          console.log(
            `✅ Migration ${migration.version} completed successfully`,
          );

          // Update our local set to avoid redundant checks
          executedVersions.add(migration.version);
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Migration ${migration.version} failed:`, error);
          throw error;
        }
      }
    } finally {
      // Always release the advisory lock
      await this.client
        .queryObject`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
      console.log("Migration lock released");
    }
  }

  async getCurrentVersion(): Promise<number> {
    await this.initialize();

    const result = await this.client.queryObject<{ version: number }>`
      SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1
    `;

    return result.rows.length > 0 ? result.rows[0].version : 0;
  }

  /**
   * Discovers and loads migrations from a directory.
   *
   * Expects migration files to follow the naming convention:
   * - {version}_{name}.sql (e.g., "001_initial_schema.sql")
   * - {version}_{name}.up.sql and {version}_{name}.down.sql (for separate up/down files)
   *
   * @param directoryPath - Path to directory containing migration files
   * @returns Array of Migration objects sorted by version
   */
  async discoverMigrations(directoryPath: string): Promise<Migration[]> {
    const migrations = new Map<number, Partial<Migration>>();

    try {
      // Walk through all .sql files in the directory
      for await (
        const entry of walk(directoryPath, {
          exts: [".sql"],
          includeDirs: false,
        })
      ) {
        const filename = entry.name;
        const content = await Deno.readTextFile(entry.path);

        // Parse filename for version and name
        const match = filename.match(/^(\d+)_(.+?)(?:\.(up|down))?\.sql$/);
        if (!match) {
          console.warn(
            `Skipping file ${filename}: does not match naming convention {version}_{name}.sql`,
          );
          continue;
        }

        const [, versionStr, name, direction] = match;
        const version = parseInt(versionStr, 10);

        if (!migrations.has(version)) {
          migrations.set(version, { version, name: name.replace(/_/g, " ") });
        }

        const migration = migrations.get(version)!;

        if (direction === "down") {
          migration.downSql = content;
        } else if (direction === "up") {
          migration.sql = content;
        } else {
          // Single file contains both up and down (or just up)
          const sections = this.parseSingleMigrationFile(content);
          migration.sql = sections.up;
          if (sections.down) {
            migration.downSql = sections.down;
          }
        }
      }

      // Convert to complete Migration objects and validate
      const result: Migration[] = [];
      for (const [version, partial] of migrations) {
        if (!partial.sql) {
          throw new Error(
            `Migration ${version} (${partial.name}) is missing up SQL`,
          );
        }

        result.push({
          version: partial.version!,
          name: partial.name!,
          sql: partial.sql,
          downSql: partial.downSql,
        });
      }

      return result.sort((a, b) => a.version - b.version);
    } catch (error) {
      throw new Error(
        `Failed to discover migrations from ${directoryPath}: ${error}`,
      );
    }
  }

  /**
   * Parses a single migration file that may contain both up and down sections.
   * Looks for comments like "-- UP" and "-- DOWN" to separate sections.
   */
  private parseSingleMigrationFile(
    content: string,
  ): { up: string; down?: string } {
    const lines = content.split("\n");
    let currentSection: "up" | "down" | null = "up"; // Default to up
    const sections = { up: "", down: "" };

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith("-- up") || trimmed.startsWith("--up")) {
        currentSection = "up";
        continue;
      } else if (
        trimmed.startsWith("-- down") || trimmed.startsWith("--down")
      ) {
        currentSection = "down";
        continue;
      }

      if (currentSection === "up") {
        sections.up += line + "\n";
      } else if (currentSection === "down") {
        sections.down += line + "\n";
      }
    }

    return {
      up: sections.up.trim(),
      down: sections.down.trim() || undefined,
    };
  }

  /**
   * Discovers migrations from a directory and runs them.
   *
   * @param directoryPath - Path to directory containing migration files
   */
  async runMigrationsFromDirectory(directoryPath: string): Promise<void> {
    const migrations = await this.discoverMigrations(directoryPath);
    console.log(
      `Discovered ${migrations.length} migration(s) from ${directoryPath}`,
    );
    await this.runMigrations(migrations);
  }

  /**
   * Discovers migrations from a directory and rolls back to target version.
   *
   * @param targetVersion - Version to rollback to
   * @param directoryPath - Path to directory containing migration files
   */
  async rollbackFromDirectory(
    targetVersion: number,
    directoryPath: string,
  ): Promise<void> {
    const migrations = await this.discoverMigrations(directoryPath);
    await this.rollback(targetVersion, migrations);
  }

  async rollback(
    targetVersion: number,
    migrations: Migration[],
  ): Promise<void> {
    await this.initialize();

    // Acquire advisory lock to prevent concurrent operations
    const MIGRATION_LOCK_ID = 1000001;

    console.log("Acquiring migration lock for rollback...");
    await this.client
      .queryObject`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;

    try {
      console.log("Migration lock acquired");

      // Get currently executed migrations
      const result = await this.client.queryObject<
        { version: number; name: string }
      >`
        SELECT version, name FROM schema_migrations
        WHERE version > ${targetVersion}
        ORDER BY version DESC
      `;

      if (result.rows.length === 0) {
        console.log(
          `No migrations to rollback. Current version is already at or below ${targetVersion}`,
        );
        return;
      }

      console.log(
        `Rolling back ${result.rows.length} migration(s) to version ${targetVersion}`,
      );

      // Create migration lookup for downSql
      const migrationMap = new Map(
        migrations.map((m) => [m.version, m]),
      );

      // Execute rollback for each migration in reverse order (newest to oldest)
      for (const { version, name } of result.rows) {
        const migration = migrationMap.get(version);

        if (!migration) {
          throw new Error(
            `Migration ${version} (${name}) not found in provided migrations list`,
          );
        }

        if (!migration.downSql) {
          throw new Error(
            `Migration ${version} (${name}) has no downSql - cannot rollback`,
          );
        }

        console.log(`Rolling back migration ${version}: ${name}`);

        const transaction = this.client.createTransaction(
          `rollback_migration_${version}`,
        );

        try {
          await transaction.begin();

          // Execute down migration SQL
          await transaction.queryArray(migration.downSql);

          // Remove from tracking table
          await transaction.queryArray`
            DELETE FROM schema_migrations WHERE version = ${version}
          `;

          await transaction.commit();
          console.log(`✅ Migration ${version} rolled back successfully`);
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Rollback of migration ${version} failed:`, error);
          throw error;
        }
      }

      console.log(
        `🔄 Rollback completed. Database is now at version ${targetVersion}`,
      );
    } finally {
      // Always release the advisory lock
      await this.client
        .queryObject`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
      console.log("Migration lock released");
    }
  }
}
