import { Memory } from "@/domain/entities/memory.ts";
import { Embedding } from "@/domain/entities/embedding.ts";
import { Source } from "@/domain/entities/source.ts";
import { Tag } from "@/domain/entities/tag.ts";
import { Entity } from "@/domain/entities/entity.ts";
import { Action } from "@/domain/entities/action.ts";
import { MemoryStatus } from "@/domain/shared/types.ts";
import {
  MemoryRepository,
  QueryOptions,
  SaveOptions,
  SimilarityMetric,
  SimilarResult,
} from "./memory-repository.interface.ts";
import {
  IDatabaseClient,
  IDatabaseTransaction,
} from "../database/database-client.interface.ts";
import { getLogger } from "@logtape/logtape";
import { configurePondLogging } from "../logging/config.ts";

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
  private readonly logger = getLogger(["deno-pond", "memory", "repository"]);

  /**
   * Creates a new PostgreSQL memory repository.
   *
   * @param client - Database client implementing IDatabaseClient interface
   */
  constructor(private client: IDatabaseClient | IDatabaseTransaction) {
    this.logger
      .debug`💾 PostgresMemoryRepository initialized with MAXIMUM RICE!`;
  }

  /**
   * Sets the tenant context for RLS enforcement.
   * Must be called before any data operations to ensure proper tenant isolation.
   */
  private async setTenantContext(
    tenantId: string,
    executor: IDatabaseClient | IDatabaseTransaction,
  ): Promise<void> {
    this.logger.debug`🏢 Setting tenant context: ${tenantId}`;
    await executor
      .queryArray`SELECT pond_set_tenant_context(${tenantId}::uuid)`;
    this.logger.debug`✅ Tenant context applied successfully`;
  }

  async save(memory: Memory, options: SaveOptions): Promise<void> {
    const { tenantId, tx } = options;

    this.logger.info`💾 Saving memory to repository`;
    this.logger
      .debug`📊 Memory details: content length=${memory.content.length}, embedding=${
      memory.getEmbedding() ? "present" : "none"
    }, tags=${memory.getTags().length}`;

    const startTime = performance.now();

    try {
      if (tx) {
        this.logger.debug`🔄 Using provided transaction context`;
        // Use provided transaction
        await this.setTenantContext(tenantId, tx);
        await this.performSave(memory, tenantId, tx);
      } else if ("commit" in this.client && "rollback" in this.client) {
        this.logger.debug`🔄 Using existing transaction context`;
        // Already in a transaction context
        await this.setTenantContext(tenantId, this.client);
        await this.performSave(memory, tenantId, this.client);
      } else {
        this.logger.debug`🔄 Creating new transaction for save operation`;
        // Create new transaction wrapper
        const transaction = this.client.createTransaction("memory_save");
        try {
          await transaction.begin();
          await this.setTenantContext(tenantId, transaction);
          await this.performSave(memory, tenantId, transaction);
          await transaction.commit();
          this.logger.debug`✅ Transaction committed successfully`;
        } catch (error) {
          this.logger.warning`🔄 Rolling back transaction due to save error`;
          await transaction.rollback();
          throw error;
        }
      }

      const duration = Math.round(performance.now() - startTime);
      this.logger.info`🎉 Memory saved successfully in ${duration}ms`;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      this.logger
        .error`💥 Memory save failed after ${duration}ms: ${error.message}`;
      throw error;
    }
  }

  private async performSave(
    memory: Memory,
    tenantId: string,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    this.logger.debug`🚀 Starting performSave with detailed logging`;

    // Insert main memory record - RLS will enforce tenant isolation
    this.logger.debug`📝 Inserting memory record (content_hash: ${
      memory.contentHash.substring(0, 8)
    }...)`;
    const memoryResult = await tx.queryObject<{ id: string }>`
      INSERT INTO memories (tenant_id, content, content_hash, status, created_at)
      VALUES (${tenantId}, ${memory.content}, ${memory.contentHash}, ${memory.status}, ${memory.createdAt})
      ON CONFLICT (tenant_id, content_hash) DO NOTHING
      RETURNING id
    `;

    // If no rows returned, memory already exists (idempotent save)
    if (memoryResult.rows.length === 0) {
      this.logger.debug`⏭️  Memory already exists (idempotent save) - skipping`;
      return;
    }

    const memoryId = memoryResult.rows[0].id;
    this.logger.debug`✅ Memory record created with ID: ${memoryId}`;

    // Insert embedding if present
    const embedding = memory.getEmbedding();
    if (embedding) {
      this.logger
        .debug`🤖 Inserting embedding (dimensions: ${embedding.dimensions}, model: ${embedding.model})`;
      // Convert embedding vector to pgvector string format for proper type binding
      const vectorString = `[${embedding.vector.join(",")}]`;

      await tx.queryArray`
        INSERT INTO embeddings (memory_id, vector, dimensions, model)
        VALUES (${memoryId}, ${vectorString}::vector, ${embedding.dimensions}, ${embedding.model})
        ON CONFLICT (memory_id) DO NOTHING
      `;
      this.logger.debug`✅ Embedding inserted successfully`;
    } else {
      this.logger.debug`⏭️  No embedding to insert`;
    }

    // Insert source if present
    const source = memory.getSource();
    if (source) {
      this.logger.debug`📄 Inserting source (type: ${source.type}, context: ${
        source.context.substring(0, 30)
      }...)`;
      await tx.queryArray`
        INSERT INTO sources (memory_id, type, context, hash, created_at)
        VALUES (${memoryId}, ${source.type}, ${source.context}, ${source.hash}, ${source.createdAt})
        ON CONFLICT (memory_id) DO NOTHING
      `;
      this.logger.debug`✅ Source inserted successfully`;
    } else {
      this.logger.debug`⏭️  No source to insert`;
    }

    // Batch insert tags - single atomic INSERT with multiple VALUES
    const tags = memory.getTags();
    if (tags.length > 0) {
      this.logger.debug`🏷️  Batch inserting ${tags.length} tags: ${
        tags.map((t) => t.normalized).join(", ")
      }`;

      // Prepare batch data: array of [memory_id, raw, normalized, slug] for each tag
      const tagRows = tags.map(
        (tag) => [memoryId, tag.raw, tag.normalized, tag.slug],
      );

      // Use unnest() approach for clean batch insert
      await tx.queryArray(
        `INSERT INTO tags (memory_id, raw, normalized, slug)
         SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::text[])
         ON CONFLICT (memory_id, slug) DO NOTHING`,
        [
          tagRows.map((row) => row[0]), // memory_ids
          tagRows.map((row) => row[1]), // raws
          tagRows.map((row) => row[2]), // normalizeds
          tagRows.map((row) => row[3]), // slugs
        ],
      );
      this.logger.debug`✅ Tags batch inserted successfully`;
    } else {
      this.logger.debug`⏭️  No tags to insert`;
    }

    // Batch insert entities - single atomic INSERT with multiple VALUES
    const entities = memory.getEntities();
    if (entities.length > 0) {
      this.logger.debug`🏢 Batch inserting ${entities.length} entities: ${
        entities.map((e) => `${e.text}(${e.type})`).join(", ")
      }`;

      // Prepare batch data: array of [memory_id, text, type] for each entity
      const entityRows = entities.map(
        (entity) => [memoryId, entity.text, entity.type],
      );

      // Use unnest() approach for clean batch insert
      await tx.queryArray(
        `INSERT INTO entities (memory_id, text, type)
         SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[])
         ON CONFLICT (memory_id, text, type) DO NOTHING`,
        [
          entityRows.map((row) => row[0]), // memory_ids
          entityRows.map((row) => row[1]), // texts
          entityRows.map((row) => row[2]), // types
        ],
      );
      this.logger.debug`✅ Entities batch inserted successfully`;
    } else {
      this.logger.debug`⏭️  No entities to insert`;
    }

    // Batch insert actions - single atomic INSERT with multiple VALUES
    const actions = memory.getActions();
    if (actions.length > 0) {
      this.logger.debug`⚡ Batch inserting ${actions.length} actions: ${
        actions.map((a) => a.action).join(", ")
      }`;

      // Prepare batch data: array of [memory_id, action, slug] for each action
      const actionRows = actions.map(
        (action) => [memoryId, action.action, action.slug],
      );

      // Use unnest() approach for clean batch insert
      await tx.queryArray(
        `INSERT INTO actions (memory_id, action, slug)
         SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[])
         ON CONFLICT (memory_id, slug) DO NOTHING`,
        [
          actionRows.map((row) => row[0]), // memory_ids
          actionRows.map((row) => row[1]), // actions
          actionRows.map((row) => row[2]), // slugs
        ],
      );
      this.logger.debug`✅ Actions batch inserted successfully`;
    } else {
      this.logger.debug`⏭️  No actions to insert`;
    }

    this.logger
      .debug`🎉 performSave completed successfully for memory ${memoryId}`;
  }

  async findById(id: string, options: QueryOptions): Promise<Memory | null> {
    const { tenantId } = options;
    this.logger.debug`🔍 Finding memory by ID: ${id}`;

    const startTime = performance.now();

    try {
      // Set tenant context for RLS enforcement
      await this.setTenantContext(tenantId, this.client);

      this.logger
        .debug`📊 Executing aggregated query for memory reconstruction`;

      // Use a single aggregated query to avoid row multiplication and N+1 queries
      const result = await this.client.queryObject<{
        id: string;
        content: string;
        content_hash: string;
        status: string;
        created_at: Date;
        // Embedding fields (nullable)
        embedding_vector?: number[];
        embedding_dimensions?: number;
        embedding_model?: string;
        // Source fields (nullable)
        source_type?: string;
        source_context?: string;
        source_hash?: string;
        source_created_at?: Date;
        // Aggregated child arrays
        tags: Array<{ raw: string; normalized: string; slug: string }>;
        entities: Array<{ text: string; type: string }>;
        actions: Array<{ action: string; slug: string }>;
      }>`
        SELECT
          m.id, m.content, m.content_hash, m.status, m.created_at,
          -- Embedding fields
          e.vector as embedding_vector, e.dimensions as embedding_dimensions, e.model as embedding_model,
          -- Source fields
          s.type as source_type, s.context as source_context, s.hash as source_hash, s.created_at as source_created_at,
          -- Aggregated children
          COALESCE(
            (SELECT json_agg(json_build_object('raw', t.raw, 'normalized', t.normalized, 'slug', t.slug))
             FROM tags t WHERE t.memory_id = m.id), '[]'::json
          ) as tags,
          COALESCE(
            (SELECT json_agg(json_build_object('text', ent.text, 'type', ent.type))
             FROM entities ent WHERE ent.memory_id = m.id), '[]'::json
          ) as entities,
          COALESCE(
            (SELECT json_agg(json_build_object('action', a.action, 'slug', a.slug))
             FROM actions a WHERE a.memory_id = m.id), '[]'::json
          ) as actions
        FROM memories m
        LEFT JOIN embeddings e ON m.id = e.memory_id
        LEFT JOIN sources s ON m.id = s.memory_id
        WHERE m.id = ${id}
      `;

      if (result.rows.length === 0) {
        const duration = Math.round(performance.now() - startTime);
        this.logger.debug`❌ Memory not found in ${duration}ms`;
        return null;
      }

      const row = result.rows[0];
      const persistedStatus = row.status as MemoryStatus;

      this.logger
        .debug`🔧 Reconstructing memory object with ${row.tags.length} tags, ${row.entities.length} entities, ${row.actions.length} actions`;

      // Start with base memory - need to reconstruct with proper timestamp
      const memoryWithTimestamp = Object.create(Memory.prototype);
      Object.assign(memoryWithTimestamp, {
        content: row.content,
        contentHash: row.content_hash,
        status: MemoryStatus.DRAFT,
        createdAt: row.created_at,
        tags: [],
        entities: [],
        actions: [],
        embedding: undefined,
        source: undefined,
      });

      let memory = memoryWithTimestamp as Memory;

      // Add embedding if present
      if (
        row.embedding_vector && row.embedding_dimensions && row.embedding_model
      ) {
        const embedding = new Embedding(
          row.embedding_vector,
          row.embedding_model,
        );
        memory = memory.setEmbedding(embedding);
      }

      // Add source if present
      if (
        row.source_type && row.source_context && row.source_hash &&
        row.source_created_at
      ) {
        // Create source with preserved timestamp from database
        const sourceWithTimestamp = Object.create(Source.prototype);
        Object.assign(sourceWithTimestamp, {
          type: row.source_type,
          context: row.source_context,
          hash: row.source_hash,
          _createdAt: row.source_created_at,
        });
        memory = memory.setSource(sourceWithTimestamp as Source);
      }

      // Add tags from aggregated JSON
      for (const tagData of row.tags) {
        const tag = new Tag(tagData.raw);
        memory = memory.addTag(tag);
      }

      // Add entities from aggregated JSON
      for (const entityData of row.entities) {
        const entity = new Entity(entityData.text, entityData.type);
        memory = memory.addEntity(entity);
      }

      // Add actions from aggregated JSON
      for (const actionData of row.actions) {
        const action = new Action(actionData.action);
        memory = memory.addAction(action);
      }

      if (persistedStatus === MemoryStatus.STORED) {
        const duration = Math.round(performance.now() - startTime);
        this.logger
          .info`✅ Memory found and reconstructed (STORED status) in ${duration}ms`;
        return memory.markAsStored();
      }

      const duration = Math.round(performance.now() - startTime);
      this.logger
        .info`✅ Memory found and reconstructed (DRAFT status) in ${duration}ms`;
      return memory;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      this.logger
        .error`💥 findById failed after ${duration}ms: ${error.message}`;
      throw error;
    }
  }

  async findByContentHash(
    hash: string,
    options: QueryOptions,
  ): Promise<Memory | null> {
    const { tenantId } = options;
    // Set tenant context for RLS enforcement
    await this.setTenantContext(tenantId, this.client);

    const result = await this.client.queryObject<{ id: string }>`
      SELECT id FROM memories
      WHERE content_hash = ${hash}
    `;

    if (result.rows.length === 0) return null;

    return this.findById(result.rows[0].id, options);
  }

  async findSimilar(
    embedding: Embedding,
    threshold: number,
    options: QueryOptions,
    limit: number = 10,
    metric: SimilarityMetric = "cosine",
  ): Promise<ReadonlyArray<SimilarResult>> {
    const { tenantId } = options;

    this.logger.info`🔍 Finding similar memories using ${metric} similarity`;
    this.logger
      .debug`📊 Search params: threshold=${threshold}, limit=${limit}, dimensions=${embedding.dimensions}`;

    const startTime = performance.now();

    try {
      // Set tenant context for RLS enforcement
      await this.setTenantContext(tenantId, this.client);
      // Convert embedding vector to pgvector string format for proper type binding
      const vectorString = `[${embedding.vector.join(",")}]`;

      this.logger
        .debug`🤖 Vector search using pgvector with ${metric} distance operator`;

      // Core pattern: ORDER BY e.vector <=> $query ASC with WHERE e.vector <=> $query <= 1 - $threshold
      // This enables optimal index usage with direct operator in ORDER BY
      let result: {
        rows: Array<{
          memory_id: string;
          distance: number;
          similarity: number;
        }>;
      };

      if (metric === "cosine") {
        // Core cosine pattern: ORDER BY e.vector <=> $query ASC with explicit threshold
        const distanceThreshold = 1 - threshold; // cosine distance = 1 - cosine similarity
        result = await this.client.queryObject<{
          memory_id: string;
          distance: number;
          similarity: number;
        }>`
        SELECT
          m.id as memory_id,
          e.vector <=> ${vectorString}::vector as distance,
          1 - (e.vector <=> ${vectorString}::vector) as similarity
        FROM memories m
        JOIN embeddings e ON e.memory_id = m.id
        WHERE
          e.dimensions = ${embedding.dimensions}
          AND (e.vector <=> ${vectorString}::vector) <= ${distanceThreshold}
        ORDER BY e.vector <=> ${vectorString}::vector ASC
        LIMIT ${limit}
      `;
      } else if (metric === "euclidean") {
        // L2 distance pattern for euclidean similarity
        result = await this.client.queryObject<{
          memory_id: string;
          distance: number;
          similarity: number;
        }>`
        SELECT
          m.id as memory_id,
          e.vector <-> ${vectorString}::vector as distance,
          1 / (1 + (e.vector <-> ${vectorString}::vector)) as similarity
        FROM memories m
        JOIN embeddings e ON e.memory_id = m.id
        WHERE
          e.dimensions = ${embedding.dimensions}
          AND (e.vector <-> ${vectorString}::vector) <= ${threshold}
        ORDER BY e.vector <-> ${vectorString}::vector ASC
        LIMIT ${limit}
      `;
      } else { // dot product
        // Inner product pattern for dot product similarity
        const distanceThreshold = -threshold; // pgvector returns negative inner product
        result = await this.client.queryObject<{
          memory_id: string;
          distance: number;
          similarity: number;
        }>`
        SELECT
          m.id as memory_id,
          e.vector <#> ${vectorString}::vector as distance,
          -(e.vector <#> ${vectorString}::vector) as similarity
        FROM memories m
        JOIN embeddings e ON e.memory_id = m.id
        WHERE
          e.dimensions = ${embedding.dimensions}
          AND (e.vector <#> ${vectorString}::vector) <= ${distanceThreshold}
        ORDER BY e.vector <#> ${vectorString}::vector ASC
        LIMIT ${limit}
      `;
      }

      this.logger
        .debug`📊 Raw similarity search returned ${result.rows.length} candidates`;

      // Convert results to SimilarResult format with full Memory reconstruction
      const similarResults: SimilarResult[] = [];

      for (const row of result.rows) {
        this.logger
          .debug`🔧 Reconstructing memory ${row.memory_id} (similarity: ${
          row.similarity.toFixed(3)
        }, distance: ${row.distance.toFixed(3)})`;

        // Reconstruct the full Memory object for each result
        const memory = await this.findById(row.memory_id, options);
        if (memory) {
          similarResults.push({
            memory,
            distance: row.distance,
            similarity: row.similarity,
          });
        }
      }

      const duration = Math.round(performance.now() - startTime);
      this.logger
        .info`🎉 Found ${similarResults.length} similar memories in ${duration}ms`;

      if (similarResults.length > 0) {
        const avgSimilarity = similarResults.reduce((sum, r) =>
          sum + r.similarity, 0) / similarResults.length;
        this.logger.debug`📈 Average similarity: ${
          avgSimilarity.toFixed(3)
        }, best: ${similarResults[0]?.similarity.toFixed(3)}`;
      }

      return similarResults;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      this.logger
        .error`💥 Similarity search failed after ${duration}ms: ${error.message}`;
      throw error;
    }
  }

  async search(
    query: string,
    options: QueryOptions,
    limit: number = 50,
  ): Promise<Memory[]> {
    const { tenantId } = options;
    // Set tenant context for RLS enforcement
    await this.setTenantContext(tenantId, this.client);

    // Use PostgreSQL full-text search with English language
    const result = await this.client.queryObject<{ id: string }>`
      SELECT id
      FROM memories
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit}
    `;

    // Reconstruct Memory objects for each result
    const memories: Memory[] = [];
    for (const row of result.rows) {
      const memory = await this.findById(row.id, options);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  async findAll(
    options: QueryOptions,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Memory[]> {
    const { tenantId } = options;
    // Set tenant context for RLS enforcement
    await this.setTenantContext(tenantId, this.client);

    // Get all memories for tenant, ordered by creation date (newest first)
    const result = await this.client.queryObject<{ id: string }>`
      SELECT id
      FROM memories
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Reconstruct Memory objects for each result
    const memories: Memory[] = [];
    for (const row of result.rows) {
      const memory = await this.findById(row.id, options);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  async delete(id: string, options: QueryOptions): Promise<boolean> {
    const { tenantId } = options;
    // Set tenant context for RLS enforcement
    await this.setTenantContext(tenantId, this.client);

    const result = await this.client.queryArray`
      DELETE FROM memories
      WHERE id = ${id}
    `;

    return result.rowCount! > 0;
  }
}
