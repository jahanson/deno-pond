import { getLogger } from "@logtape/logtape";
import { Memory } from "@/domain/entities/memory.ts";
import { Source } from "@/domain/entities/source.ts";
import { IEmbeddingService } from "@/domain/services/embedding-service.interface.ts";
import { SourceType } from "@/domain/shared/types.ts";

const logger = getLogger("deno-pond.memory-service");

/**
 * Options for creating a new memory
 */
export interface CreateMemoryOptions {
  /** Source information for the memory */
  source?: {
    type: SourceType;
    context: string;
  };
  /** Skip embedding generation (for testing or when embedding will be added later) */
  skipEmbedding?: boolean;
}

/**
 * Service for creating Memory objects with automatic embedding generation
 */
export class MemoryService {
  constructor(private readonly embeddingService: IEmbeddingService) {}

  /**
   * Create a new memory with automatic embedding generation
   */
  async createMemory(
    content: string,
    options: CreateMemoryOptions = {}
  ): Promise<Memory> {
    logger.info(
      `🧠 Creating new memory`,
      {
        contentLength: content.length,
        sourceType: options.source?.type,
        skipEmbedding: options.skipEmbedding
      }
    );

    try {
      // Generate embedding unless explicitly skipped
      let embedding;
      if (!options.skipEmbedding) {
        logger.debug(`🎯 Generating embedding for memory`);
        embedding = await this.embeddingService.generateEmbedding(content);
        logger.debug(
          `✅ Embedding generated`,
          {
            dimensions: embedding.dimensions,
            model: embedding.model
          }
        );
      }

      // Create source if provided
      let source;
      if (options.source) {
        source = new Source(options.source.type, options.source.context);
        logger.debug(
          `📄 Source created`,
          {
            type: options.source.type,
            context: options.source.context
          }
        );
      }

      // Create the memory
      const memory = new Memory(
        content,
        undefined, // status defaults to DRAFT
        undefined, // createdAt defaults to now
        [], // tags (will be added later in Phase 2)
        [], // entities (will be added later in Phase 2)
        [], // actions (will be added later in Phase 2)
        embedding,
        source
      );

      logger.info(
        `✅ Memory created successfully`,
        {
          contentHash: memory.contentHash,
          hasEmbedding: !!memory.getEmbedding(),
          hasSource: !!memory.getSource(),
          status: memory.status
        }
      );

      return memory;

    } catch (error) {
      logger.error(
        `❌ Failed to create memory`,
        {
          error: error instanceof Error ? error.message : String(error),
          contentLength: content.length
        }
      );
      throw error;
    }
  }

  /**
   * Create a memory for manual input (like user messages)
   */
  async createUserMemory(content: string): Promise<Memory> {
    return this.createMemory(content, {
      source: {
        type: SourceType.MANUAL,
        context: "User input"
      }
    });
  }

  /**
   * Create a memory for Claude Code context
   */
  async createCodeMemory(content: string, context: string): Promise<Memory> {
    return this.createMemory(content, {
      source: {
        type: SourceType.CLAUDE_CODE,
        context
      }
    });
  }
}