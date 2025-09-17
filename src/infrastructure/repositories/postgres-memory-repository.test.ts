import {
  assertEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { Memory } from "@/domain/entities/memory.ts";
import { Embedding } from "@/domain/entities/embedding.ts";
import { Source } from "@/domain/entities/source.ts";
import { MemoryStatus, SourceType } from "@/domain/shared/types.ts";
import { PostgresMemoryRepository } from "./postgres-memory-repository.ts";

/**
 * Transaction stub for testing PostgresMemoryRepository integration.
 * Records SQL calls and returns canned responses that match PostgreSQL format.
 */
class TransactionStub {
  public sqlCalls: string[] = [];
  private memoryData = {
    id: "test-memory-id",
    content: "Test stored memory with metadata",
    content_hash: "test-hash",
    status: MemoryStatus.STORED,
    created_at: new Date("2023-01-01T00:00:00Z"),
    // Embedding data
    embedding_vector: new Array(512).fill(0).map((_, i) => (i + 1) / 512),
    embedding_dimensions: 512,
    embedding_model: "test-model",
    // Source data
    source_type: SourceType.MANUAL,
    source_context: "test context",
    source_hash: "source-hash",
    source_created_at: new Date("2023-01-01T00:00:00Z"),
    // Aggregated JSON arrays (what PostgreSQL would return)
    tags: [
      { raw: "test-tag", normalized: "test tag", slug: "test-tag" },
      { raw: "another-tag", normalized: "another tag", slug: "another-tag" }
    ],
    entities: [
      { text: "Test Entity", type: "PERSON" },
      { text: "Another Entity", type: "ORGANIZATION" }
    ],
    actions: [
      { action: "test-action", slug: "test-action" },
      { action: "another-action", slug: "another-action" }
    ],
  };

  async queryArray(sql: TemplateStringsArray | string): Promise<{ rowCount: number }> {
    this.sqlCalls.push(sql.toString());

    // Mock pond_set_tenant_context call
    if (sql.toString().includes("pond_set_tenant_context")) {
      return { rowCount: 1 };
    }

    return { rowCount: 1 };
  }

  async queryObject<T>(sql: TemplateStringsArray | string): Promise<{ rows: T[] }> {
    this.sqlCalls.push(sql.toString());

    // Mock the complex findById query with aggregated JSON
    if (sql.toString().includes("SELECT") && sql.toString().includes("memories m")) {
      return { rows: [this.memoryData as T] };
    }

    return { rows: [] };
  }
}

/**
 * Client stub that creates Transaction stubs and tracks calls.
 */
class ClientStub {
  public transactionStub = new TransactionStub();

  async queryArray(sql: TemplateStringsArray | string): Promise<{ rowCount: number }> {
    return this.transactionStub.queryArray(sql);
  }

  async queryObject<T>(sql: TemplateStringsArray | string): Promise<{ rows: T[] }> {
    return this.transactionStub.queryObject(sql);
  }
}

/**
 * Integration tests that actually call PostgresMemoryRepository methods
 * and verify the SQL generation and hydration logic.
 */

Deno.test("PostgresMemoryRepository.findById - should call setTenantContext and execute proper SQL", async () => {
  const clientStub = new ClientStub();
  const repository = new PostgresMemoryRepository(clientStub as any);
  const tenantId = "123e4567-e89b-12d3-a456-426614174000";

  // Actually call the repository method (this would fail if repository breaks)
  const memory = await repository.findById("test-memory-id", { tenantId });

  // Verify SQL calls were made in correct order
  const sqlCalls = clientStub.transactionStub.sqlCalls;

  // Should call setTenantContext first (parameters are bound separately, so we just verify the SQL structure)
  assertStringIncludes(sqlCalls[0], "pond_set_tenant_context");
  assertStringIncludes(sqlCalls[0], "::uuid");

  // Should execute findById query with proper JOINs and aggregation
  assertStringIncludes(sqlCalls[1], "SELECT");
  assertStringIncludes(sqlCalls[1], "FROM memories m");
  assertStringIncludes(sqlCalls[1], "LEFT JOIN embeddings e");
  assertStringIncludes(sqlCalls[1], "LEFT JOIN sources s");
  assertStringIncludes(sqlCalls[1], "json_agg"); // Should use JSON aggregation
  assertStringIncludes(sqlCalls[1], "WHERE m.id =");

  // Verify memory was properly reconstructed (proves the whole integration works)
  assertEquals(memory?.content, "Test stored memory with metadata");
  assertEquals(memory?.status, MemoryStatus.STORED);
});

Deno.test("PostgresMemoryRepository.findById - should successfully hydrate stored memory with all metadata", async () => {
  const clientStub = new ClientStub();
  const repository = new PostgresMemoryRepository(clientStub as any);

  // This is the critical test: can the repository hydrate a stored memory?
  // (Would throw "Cannot modify stored memory" before the fix)
  const memory = await repository.findById("test-memory-id", {
    tenantId: "123e4567-e89b-12d3-a456-426614174000"
  });

  // Verify embedding was hydrated correctly
  const embedding = memory?.getEmbedding();
  assertInstanceOf(embedding, Embedding); // Must be actual Embedding instance, not POJO
  assertEquals(embedding?.dimensions, 512);
  assertEquals(embedding?.model, "test-model");
  assertEquals(embedding?.vector.length, 512);

  // Verify source was hydrated correctly
  const source = memory?.getSource();
  assertInstanceOf(source, Source); // Must be actual Source instance, not POJO
  assertEquals(source?.type, SourceType.MANUAL);
  assertEquals(source?.context, "test context");
  assertEquals(source?.createdAt.toISOString(), "2023-01-01T00:00:00.000Z");

  // Verify tags were hydrated correctly
  const tags = memory?.getTags();
  assertEquals(tags?.length, 2);
  assertEquals(tags?.[0].raw, "test-tag");
  assertEquals(tags?.[1].raw, "another-tag");

  // Verify entities were hydrated correctly
  const entities = memory?.getEntities();
  assertEquals(entities?.length, 2);
  assertEquals(entities?.[0].text, "Test Entity");
  assertEquals(entities?.[0].type, "PERSON");

  // Verify actions were hydrated correctly
  const actions = memory?.getActions();
  assertEquals(actions?.length, 2);
  assertEquals(actions?.[0].action, "test-action");
  assertEquals(actions?.[1].action, "another-action");

  // Verify final status is STORED (not DRAFT)
  assertEquals(memory?.status, MemoryStatus.STORED);
});

Deno.test("PostgresMemoryRepository.findById - should return null for non-existent memory", async () => {
  const clientStub = new ClientStub();
  // Override to return empty result set
  clientStub.transactionStub.queryObject = async () => ({ rows: [] });

  const repository = new PostgresMemoryRepository(clientStub as any);

  const memory = await repository.findById("non-existent-id", {
    tenantId: "123e4567-e89b-12d3-a456-426614174000"
  });

  assertEquals(memory, null);
});

/**
 * Unit tests for the specific hydration pattern (separate from repository integration)
 */

Deno.test("Memory hydration pattern - should fail if we tried the old way (seeding as STORED)", () => {
  // This demonstrates the problem that would occur without the fix
  let memory = new Memory("Test memory");

  // Simulate old broken approach: mark as stored first
  memory = memory.markAsStored();

  // Now try to add metadata - this should throw
  const validVector = new Array(512).fill(0).map((_, i) => (i + 1) / 512);
  const embedding = new Embedding(validVector, "test-model");

  assertThrows(
    () => memory.setEmbedding(embedding),
    Error,
    "Cannot modify stored memory"
  );
});