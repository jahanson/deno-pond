import { assertEquals, assertInstanceOf } from "@std/assert";
import { Embedding } from "@/domain/entities/embedding.ts";
import { Source } from "@/domain/entities/source.ts";
import { MemoryStatus, SourceType } from "@/domain/shared/types.ts";
import { PostgresMemoryRepository } from "./postgres-memory-repository.ts";
import {
  IDatabaseClient,
  IDatabaseTransaction,
} from "../database/database-client.interface.ts";

/**
 * Transaction stub for testing PostgresMemoryRepository integration.
 * Records SQL calls and returns canned responses that match PostgreSQL format.
 */
class TransactionStub implements IDatabaseTransaction {
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
      { raw: "another-tag", normalized: "another tag", slug: "another-tag" },
    ],
    entities: [
      { text: "Test Entity", type: "PERSON" },
      { text: "Another Entity", type: "ORGANIZATION" },
    ],
    actions: [
      { action: "test-action", slug: "test-action" },
      { action: "another-action", slug: "another-action" },
    ],
  };

  queryArray(
    sql: TemplateStringsArray | string,
    ..._args: unknown[]
  ): Promise<{ rowCount?: number }> {
    this.sqlCalls.push(sql.toString());

    // Mock pond_set_tenant_context call
    if (sql.toString().includes("pond_set_tenant_context")) {
      return Promise.resolve({ rowCount: 1 });
    }

    return Promise.resolve({ rowCount: 1 });
  }

  queryObject<T>(
    sql: TemplateStringsArray | string,
    ..._args: unknown[]
  ): Promise<{ rows: T[] }> {
    this.sqlCalls.push(sql.toString());

    // Mock the complex findById query with aggregated JSON
    if (
      sql.toString().includes("SELECT") && sql.toString().includes("memories m")
    ) {
      return Promise.resolve({ rows: [this.memoryData as T] });
    }

    return Promise.resolve({ rows: [] });
  }

  begin(): Promise<void> {
    return Promise.resolve();
  }

  commit(): Promise<void> {
    return Promise.resolve();
  }

  rollback(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Client stub that creates Transaction stubs and tracks calls.
 */
class ClientStub implements IDatabaseClient {
  public transactionStub = new TransactionStub();

  queryArray(
    sql: TemplateStringsArray | string,
    ..._args: unknown[]
  ): Promise<{ rowCount?: number }> {
    return this.transactionStub.queryArray(sql, ..._args);
  }

  queryObject<T>(
    sql: TemplateStringsArray | string,
    ..._args: unknown[]
  ): Promise<{ rows: T[] }> {
    return this.transactionStub.queryObject(sql, ..._args);
  }

  createTransaction(_name?: string): IDatabaseTransaction {
    return new TransactionStub();
  }
}

/**
 * Integration tests that actually call PostgresMemoryRepository methods
 * and verify the SQL generation and hydration logic.
 */

Deno.test("PostgresMemoryRepository.findById - should successfully hydrate stored memory with all metadata", async () => {
  const clientStub = new ClientStub();
  const repository = new PostgresMemoryRepository(clientStub);

  // This is the critical test: can the repository hydrate a stored memory?
  // (Would throw "Cannot modify stored memory" before the fix)
  const memory = await repository.findById("test-memory-id", {
    tenantId: "123e4567-e89b-12d3-a456-426614174000",
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
  clientStub.transactionStub.queryObject = () => Promise.resolve({ rows: [] });

  const repository = new PostgresMemoryRepository(clientStub);

  const memory = await repository.findById("non-existent-id", {
    tenantId: "123e4567-e89b-12d3-a456-426614174000",
  });

  assertEquals(memory, null);
});
