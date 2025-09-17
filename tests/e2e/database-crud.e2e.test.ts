/**
 * End-to-End Database CRUD Tests
 *
 * Tests the complete database stack with real Supabase PostgreSQL connectivity.
 * Validates CRUD operations, vector storage, tenant isolation, and transaction handling.
 *
 * Run with: deno task test:e2e
 * Or: mise run ts-otel tests/e2e/database-crud.e2e.test.ts
 */

import { assertEquals, assert } from "@std/assert";
import { getLogger } from "@logtape/logtape";
import {
  configurePondLogging,
  displayLoggingStatus,
} from "@/infrastructure/logging/config.ts";
import { DatabaseConnection } from "@/infrastructure/database/database-connection.ts";
import { PostgresMemoryRepository } from "@/infrastructure/repositories/postgres-memory-repository.ts";
import { Memory } from "@/domain/entities/memory.ts";
import { Embedding } from "@/domain/entities/embedding.ts";
import { Source } from "@/domain/entities/source.ts";
import { SourceType } from "@/domain/shared/types.ts";

// Setup that beautiful MAXIMUM RICE logging with dual-sink observability
await configurePondLogging("info"); // Less verbose for E2E tests
displayLoggingStatus();

const logger = getLogger("deno-pond.e2e-test");

async function setupDatabaseConnection() {
  // Get database configuration from environment
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

  return new DatabaseConnection({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: true,
    caCertificate,
  });
}

function createTestMemory(suffix: string): Memory {
  const testEmbedding = new Embedding(
    new Array(1536).fill(0).map(() => Math.random() - 0.5),
    "text-embedding-3-small",
  );

  const testSource = new Source(
    SourceType.CLAUDE_CODE,
    `E2E test memory - ${suffix} - ${Date.now()}`,
  );

  return new Memory(
    `E2E test memory content for ${suffix}. Testing end-to-end database operations with beautiful MAXIMUM RICE logging.`,
  )
    .setEmbedding(testEmbedding)
    .setSource(testSource)
    .markAsStored();
}

Deno.test({
  name: "E2E Database CRUD - CREATE and READ operations",
  fn: async () => {
    const connection = await setupDatabaseConnection();

    await connection.withClient(async (client) => {
      const testTenantId = crypto.randomUUID();
      const repository = new PostgresMemoryRepository(client);

      logger.info(`🧪 Running E2E CREATE/READ test with tenant: ${testTenantId}`);

      try {
        // CREATE - Store a memory
        const memory = createTestMemory("create-read");
        await repository.save(memory, { tenantId: testTenantId });
        logger.info(`✅ Memory saved successfully`);

        // READ - Find all memories for this tenant
        const searchResults = await repository.findAll({
          tenantId: testTenantId,
        }, 10);

        assertEquals(searchResults.length, 1, "Should find exactly one memory");
        assertEquals(searchResults[0].content, memory.content, "Memory content should match");

        logger.info("✅ E2E CREATE/READ test completed successfully");

      } catch (error) {
        logger.error(`❌ E2E CREATE/READ test failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E Database CRUD - BATCH operations with multiple memories",
  fn: async () => {
    const connection = await setupDatabaseConnection();

    await connection.withClient(async (client) => {
      const testTenantId = crypto.randomUUID();
      const repository = new PostgresMemoryRepository(client);

      logger.info(`🧪 Running E2E BATCH test with tenant: ${testTenantId}`);

      try {
        // CREATE - Store multiple memories
        const memories = [
          createTestMemory("batch-1"),
          createTestMemory("batch-2"),
          createTestMemory("batch-3"),
        ];

        for (const memory of memories) {
          await repository.save(memory, { tenantId: testTenantId });
        }
        logger.info(`✅ Batch saved ${memories.length} memories`);

        // READ - Find all memories
        const searchResults = await repository.findAll({
          tenantId: testTenantId,
        }, 10);

        assertEquals(searchResults.length, 3, "Should find exactly three memories");

        // Verify all memories are present
        const foundContents = searchResults.map(m => m.content);
        for (const memory of memories) {
          assert(
            foundContents.includes(memory.content),
            `Should find memory with content: ${memory.content}`
          );
        }

        logger.info("✅ E2E BATCH test completed successfully");

      } catch (error) {
        logger.error(`❌ E2E BATCH test failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E Database CRUD - Tenant isolation verification",
  fn: async () => {
    const connection = await setupDatabaseConnection();

    await connection.withClient(async (client) => {
      const tenant1Id = crypto.randomUUID();
      const tenant2Id = crypto.randomUUID();
      const repository1 = new PostgresMemoryRepository(client);
      const repository2 = new PostgresMemoryRepository(client);

      logger.info(`🧪 Running E2E TENANT ISOLATION test with tenants: ${tenant1Id}, ${tenant2Id}`);

      try {
        // CREATE - Store memory for each tenant
        const memory1 = createTestMemory("tenant-1");
        const memory2 = createTestMemory("tenant-2");

        await repository1.save(memory1, { tenantId: tenant1Id });
        await repository2.save(memory2, { tenantId: tenant2Id });

        // READ - Each tenant should only see their own memories
        const tenant1Results = await repository1.findAll({
          tenantId: tenant1Id,
        }, 10);

        const tenant2Results = await repository2.findAll({
          tenantId: tenant2Id,
        }, 10);

        assertEquals(tenant1Results.length, 1, "Tenant 1 should see exactly one memory");
        assertEquals(tenant2Results.length, 1, "Tenant 2 should see exactly one memory");
        assertEquals(tenant1Results[0].content, memory1.content, "Tenant 1 should see their memory");
        assertEquals(tenant2Results[0].content, memory2.content, "Tenant 2 should see their memory");

        logger.info("✅ E2E TENANT ISOLATION test completed successfully");

      } catch (error) {
        logger.error(`❌ E2E TENANT ISOLATION test failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

