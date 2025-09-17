/**
 * 🔧 TEST NORMAL MIGRATION RUN
 *
 * Now that tracking is fixed, migrations should work normally!
 */

import { configurePondLogging } from "@/infrastructure/logging/config.ts";
import { DatabaseConnection } from "@/infrastructure/database/database-connection.ts";
import { MigrationRunner } from "@/infrastructure/migrations/migration-runner.ts";
import { getLogger } from "@logtape/logtape";

// Configure MAXIMUM RICE logging
await configurePondLogging("debug");

const testLogger = getLogger(["deno-pond", "app", "normal-migrations"]);

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const CA_CERT_PATH = Deno.env.get("CA_CERT_PATH");
if (!CA_CERT_PATH) {
  throw new Error("CA_CERT_PATH environment variable is required");
}

const caCertificate = await Deno.readTextFile(CA_CERT_PATH);
const url = new URL(DATABASE_URL);

async function testNormalMigrations() {
  testLogger
    .info`🔧 TESTING NORMAL MIGRATION RUN (should skip all completed migrations)`;

  const dbConnection = new DatabaseConnection({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: true,
    caCertificate,
  });

  await dbConnection.withClient(async (client) => {
    const migrationRunner = new MigrationRunner(client);

    try {
      testLogger.info`🚀 Running migrations from directory...`;
      await migrationRunner.runMigrationsFromDirectory(
        "./src/infrastructure/migrations",
      );
      testLogger.info`🎉 Migrations completed successfully!`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      testLogger.error`💥 Migration failed: ${message}`;
      testLogger.debug`Full error: ${error}`;
    }

    // Check final state
    const migrations = await client.queryObject`
      SELECT version, name FROM schema_migrations ORDER BY version
    `;
    testLogger.info`📋 Final recorded migrations: ${
      JSON.stringify(migrations.rows)
    }`;
  });
}

if (import.meta.main) {
  await testNormalMigrations();
}
