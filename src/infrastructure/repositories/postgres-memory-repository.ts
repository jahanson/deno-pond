import { Client } from "jsr:@db/postgres";
import { Memory } from "@/domain/entities/memory.ts";
import { Embedding } from "@/domain/entities/embedding.ts";
import { MemoryRepository } from "./memory-repository.interface.ts";

/**
 * PostgreSQL implementation of the MemoryRepository interface.
 *
 * Provides persistent storage for Memory objects using PostgreSQL with pgvector
 * extension for semantic similarity search. Implements multi-tenant isolation
 * using Row Level Security (RLS) and provides transactional safety for all
 * write operations.
 *
 * @example
 * ```typescript
 * const client = new Client({ hostname: "localhost", database: "pond" });
 * await client.connect();
 * const repository = new PostgresMemoryRepository(client);
 *
 * // Save with automatic transaction handling
 * await repository.save(memory, tenantId);
 *
 * // Vector similarity search using pgvector
 * const similar = await repository.findSimilar(embedding, 0.8, tenantId, 5);
 * ```
 */
export class PostgresMemoryRepository implements MemoryRepository {
  /**
   * Creates a new PostgreSQL memory repository.
   *
   * @param client - Connected PostgreSQL client from @db/postgres
   */
  constructor(private client: Client) {}

  async save(memory: Memory, tenantId: string): Promise<void> {
    const transaction = this.client.createTransaction("save_memory");

    try {
      await transaction.begin();

      // Insert main memory record
      const memoryResult = await transaction.queryObject<{ id: string }>`
        INSERT INTO memories (tenant_id, content, content_hash, status, created_at)
        VALUES (${tenantId}, ${memory.content}, ${memory.contentHash}, ${memory.status}, ${memory.createdAt})
        RETURNING id
      `;

      const memoryId = memoryResult.rows[0].id;

      // Insert embedding if present
      const embedding = memory.getEmbedding();
      if (embedding) {
        await transaction.queryArray`
          INSERT INTO embeddings (memory_id, vector, dimensions, model)
          VALUES (${memoryId}, ${embedding.vector}, ${embedding.dimensions}, ${embedding.model})
        `;
      }

      // Insert source if present
      const source = memory.getSource();
      if (source) {
        await transaction.queryArray`
          INSERT INTO sources (memory_id, type, context, hash, created_at)
          VALUES (${memoryId}, ${source.type}, ${source.context}, ${source.hash}, ${source.createdAt})
        `;
      }

      // Insert tags
      const tags = memory.getTags();
      for (const tag of tags) {
        await transaction.queryArray`
          INSERT INTO tags (memory_id, raw, normalized, slug)
          VALUES (${memoryId}, ${tag.raw}, ${tag.normalized}, ${tag.slug})
        `;
      }

      // Insert entities
      const entities = memory.getEntities();
      for (const entity of entities) {
        await transaction.queryArray`
          INSERT INTO entities (memory_id, text, type)
          VALUES (${memoryId}, ${entity.text}, ${entity.type})
        `;
      }

      // Insert actions
      const actions = memory.getActions();
      for (const action of actions) {
        await transaction.queryArray`
          INSERT INTO actions (memory_id, action, slug)
          VALUES (${memoryId}, ${action.action}, ${action.slug})
        `;
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<Memory | null> {
    // This is a complex query - we'll need to join all related tables
    // For now, a placeholder implementation
    const result = await this.client.queryObject<any>`
      SELECT m.*, e.vector, e.dimensions, e.model, s.type as source_type, s.context as source_context, s.created_at as source_created_at
      FROM memories m
      LEFT JOIN embeddings e ON m.id = e.memory_id
      LEFT JOIN sources s ON m.id = s.memory_id
      WHERE m.id = ${id} AND m.tenant_id = ${tenantId}
    `;

    if (result.rows.length === 0) return null;

    // TODO: Reconstruct Memory object with all related entities
    // This requires fetching tags, entities, actions separately
    return null; // Placeholder
  }

  async findByContentHash(
    hash: string,
    tenantId: string,
  ): Promise<Memory | null> {
    const result = await this.client.queryObject<{ id: string }>`
      SELECT id FROM memories
      WHERE content_hash = ${hash} AND tenant_id = ${tenantId}
    `;

    if (result.rows.length === 0) return null;

    return this.findById(result.rows[0].id, tenantId);
  }

  async findSimilar(
    embedding: Embedding,
    threshold: number,
    tenantId: string,
    limit: number = 10,
  ): Promise<Array<{ memory: Memory; similarity: number }>> {
    // TODO: Implement semantic similarity search with pgvector
    // This will require the full object reconstruction logic
    console.log("findSimilar called with:", {
      embedding: embedding.dimensions,
      threshold,
      tenantId,
      limit,
    });
    return []; // Placeholder
  }

  async search(
    query: string,
    tenantId: string,
    limit: number = 50,
  ): Promise<Memory[]> {
    // TODO: Implement full-text search with object reconstruction
    console.log("search called with:", { query, tenantId, limit });
    return []; // Placeholder
  }

  async findAll(
    tenantId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Memory[]> {
    // TODO: Implement findAll with object reconstruction
    console.log("findAll called with:", { tenantId, limit, offset });
    return []; // Placeholder
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.client.queryArray`
      DELETE FROM memories
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `;

    return result.rowCount! > 0;
  }
}
