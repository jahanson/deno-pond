import { Client } from "@db/postgres";
import { walk } from "@std/fs/walk";
import { getLogger } from "@logtape/logtape";
import {
  configurePondLogging,
  displayStartupBanner,
} from "../logging/config.ts";

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
  private readonly logger = getLogger(["deno-pond", "migration"]);

  /**
   * Creates a new migration runner.
   *
   * @param client - Connected PostgreSQL client for executing migrations
   */
  constructor(private client: Client) {
    this.logger.debug`🔧 MigrationRunner initialized with MAXIMUM RICE!`;
  }

  async initialize(): Promise<void> {
    this.logger.debug`🏗️  Initializing migration tracking table...`;

    // Create migrations tracking table if it doesn't exist
    await this.client.queryArray`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    this.logger.info`✅ Migration tracking table ready`;
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    await this.initialize();

    // Acquire advisory lock to prevent concurrent migration execution
    // Use a consistent lock ID for migration operations
    const MIGRATION_LOCK_ID = 1000001;

    this.logger.info`🔒 Acquiring migration lock (ID: ${MIGRATION_LOCK_ID})...`;
    await this.client.queryObject<{ pg_advisory_lock: boolean }>`
      SELECT pg_advisory_lock(${MIGRATION_LOCK_ID}) as pg_advisory_lock
    `;

    try {
      this.logger.debug`✅ Migration lock acquired successfully`;

      // Re-check executed migrations inside the lock to handle concurrent starts
      const result = await this.client.queryObject<{ version: number }>`
        SELECT version FROM schema_migrations ORDER BY version
      `;

      const executedVersions = new Set(result.rows.map((row) => row.version));

      this.logger
        .info`📋 Found ${executedVersions.size} previously executed migrations`;

      // Run pending migrations (create sorted copy to avoid mutating input array)
      const sortedMigrations = [...migrations].sort((a, b) =>
        a.version - b.version
      );
      const pendingMigrations = sortedMigrations.filter((m) =>
        !executedVersions.has(m.version)
      );

      this.logger
        .info`🚀 Planning to execute ${pendingMigrations.length} pending migrations`;

      for (const migration of sortedMigrations) {
        if (executedVersions.has(migration.version)) {
          this.logger
            .debug`⏭️  Migration ${migration.version} (${migration.name}) already executed - skipping`;
          continue;
        }

        this.logger
          .info`🔧 Running migration ${migration.version}: ${migration.name}`;

        const transaction = this.client.createTransaction(
          `migration_${migration.version}`,
        );

        let transactionStarted = false;
        let transactionCommitted = false;

        try {
          this.logger
            .debug`⚡ Starting transaction for migration ${migration.version}`;
          await transaction.begin();
          transactionStarted = true;

          this.logger.debug`📝 Executing migration SQL...`;
          this.logger.debug`SQL Preview: ${
            migration.sql.substring(0, 100).replace(/\n/g, " ").trim()
          }${migration.sql.length > 100 ? "..." : ""}`;

          // Execute migration SQL - THIS IS WHERE THE MAGIC (AND ERRORS) HAPPEN!
          await transaction.queryArray(migration.sql);

          this.logger
            .debug`📊 Recording successful execution in schema_migrations table`;

          // Record successful execution
          await transaction.queryArray`
            INSERT INTO schema_migrations (version, name)
            VALUES (${migration.version}, ${migration.name})
          `;

          this.logger.debug`💾 Committing transaction`;
          await transaction.commit();
          transactionCommitted = true;

          this.logger
            .info`✅ Migration ${migration.version} completed successfully! 🎉`;

          // Update our local set to avoid redundant checks
          executedVersions.add(migration.version);
        } catch (error) {
          // Only rollback if transaction was started and not yet committed
          if (transactionStarted && !transactionCommitted) {
            this.logger
              .warning`🔄 Rolling back transaction for migration ${migration.version}...`;
            try {
              await transaction.rollback();
              this.logger.debug`✅ Transaction rollback successful`;
            } catch (rollbackError) {
              this.logger
                .error`🚨 CRITICAL: Failed to rollback transaction: ${rollbackError}`;
            }
          }

          this.logger
            .error`💥 Migration ${migration.version} failed with error: ${error.message}`;
          this.logger.debug`🔍 Full error details:`, error;

          // Log SQL that caused the failure for better debugging
          this.logger.error`🔧 Failed SQL was: ${
            migration.sql.substring(0, 200).replace(/\n/g, " ").trim()
          }${migration.sql.length > 200 ? "..." : ""}`;

          throw error;
        }
      }
    } finally {
      // Always release the advisory lock
      this.logger.debug`🔓 Releasing migration lock`;
      await this.client
        .queryObject`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
      this.logger.debug`✅ Migration lock released successfully`;
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
    this.logger.info`📁 Discovering migrations from ${directoryPath}`;
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
        this.logger.debug`📄 Processing migration file: ${filename}`;
        const content = await Deno.readTextFile(entry.path);

        // Parse filename for version and name
        const match = filename.match(/^(\d+)_(.+?)(?:\.(up|down))?\.sql$/);
        if (!match) {
          this.logger
            .warning`⚠️  Skipping file ${filename}: does not match naming convention {version}_{name}.sql`;
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

      const sortedResult = result.sort((a, b) => a.version - b.version);
      this.logger
        .info`🔍 Successfully discovered ${sortedResult.length} migrations: ${
        sortedResult.map((m) => `v${m.version}`).join(", ")
      }`;

      return sortedResult;
    } catch (error) {
      this.logger
        .error`💥 Failed to discover migrations from ${directoryPath}: ${error}`;
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
    this.logger
      .info`🚀 Starting migration execution from directory: ${directoryPath}`;

    const migrations = await this.discoverMigrations(directoryPath);
    this.logger
      .info`📊 Loaded ${migrations.length} migration(s), preparing to execute...`;

    await this.runMigrations(migrations);

    this.logger.info`🎉 All migrations completed successfully!`;
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

    this.logger
      .info`🔒 Acquiring migration lock for rollback (ID: ${MIGRATION_LOCK_ID})...`;
    await this.client
      .queryObject`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;

    try {
      this.logger.debug`✅ Migration lock acquired for rollback`;

      // Get currently executed migrations
      const result = await this.client.queryObject<
        { version: number; name: string }
      >`
        SELECT version, name FROM schema_migrations
        WHERE version > ${targetVersion}
        ORDER BY version DESC
      `;

      if (result.rows.length === 0) {
        this.logger
          .info`✅ No migrations to rollback. Current version is already at or below ${targetVersion}`;
        return;
      }

      this.logger
        .info`🔄 Rolling back ${result.rows.length} migration(s) to version ${targetVersion}`;

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

        this.logger.info`🔄 Rolling back migration ${version}: ${name}`;

        const transaction = this.client.createTransaction(
          `rollback_migration_${version}`,
        );

        let transactionStarted = false;
        let transactionCommitted = false;

        try {
          this.logger
            .debug`⚡ Starting rollback transaction for migration ${version}`;
          await transaction.begin();
          transactionStarted = true;

          this.logger.debug`📝 Executing rollback SQL...`;
          // Execute down migration SQL
          await transaction.queryArray(migration.downSql);

          this.logger
            .debug`🗑️  Removing migration record from schema_migrations`;
          // Remove from tracking table
          await transaction.queryArray`
            DELETE FROM schema_migrations WHERE version = ${version}
          `;

          await transaction.commit();
          transactionCommitted = true;

          this.logger
            .info`✅ Migration ${version} rolled back successfully! 🎉`;
        } catch (error) {
          if (transactionStarted && !transactionCommitted) {
            this.logger
              .warning`🔄 Rolling back transaction for failed rollback...`;
            await transaction.rollback();
          }
          this.logger
            .error`💥 Rollback of migration ${version} failed: ${error.message}`;
          throw error;
        }
      }

      this.logger
        .info`🎉 Rollback completed successfully! Database is now at version ${targetVersion}`;
    } finally {
      // Always release the advisory lock
      this.logger.debug`🔓 Releasing rollback migration lock`;
      await this.client
        .queryObject`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
      this.logger.debug`✅ Rollback migration lock released successfully`;
    }
  }
}
