// Domain entity imports
import { Entity } from "./entity.ts";
import { Action } from "./action.ts";
import { Tag } from "./tag.ts";
import { Embedding } from "./embedding.ts";
import { Source } from "./source.ts";

// Shared domain imports
import { ValidationError } from "@/domain/shared/errors.ts";
import { MemoryStatus } from "@/domain/shared/types.ts";

export class Memory {
  readonly content: string;
  readonly status: MemoryStatus;
  readonly createdAt: Date;
  readonly contentHash: string;
  readonly expertId: string;
  private readonly tags: Tag[];
  private readonly entities: Entity[];
  private readonly actions: Action[];
  private readonly embedding?: Embedding;
  private readonly source?: Source;

  constructor(
    content: string,
    status: MemoryStatus = MemoryStatus.DRAFT,
    createdAt?: Date,
    tags: Tag[] = [],
    entities: Entity[] = [],
    actions: Action[] = [],
    embedding?: Embedding,
    source?: Source,
    expertId: string = "general", // Default to general expert
  ) {
    // Business rule: Content validation
    this.validateContent(content);

    this.content = content;
    this.status = status;
    this.createdAt = createdAt ?? new Date();
    this.contentHash = this.generateContentHash(content);
    this.expertId = expertId;
    this.tags = [...tags]; // defensive copy
    this.entities = [...entities]; // defensive copy
    this.actions = [...actions]; // defensive copy
    this.embedding = embedding;
    this.source = source;
  }

  private validateContent(content: string): void {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      throw new ValidationError("Content cannot be empty");
    }

    if (content.length > 7500) {
      throw new ValidationError("Content exceeds maximum length");
    }
  }

  private generateContentHash(content: string): string {
    // Simple hash for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Immutable state transitions
  markAsStored(): Memory {
    return new Memory(
      this.content,
      MemoryStatus.STORED,
      this.createdAt,
      this.tags,
      this.entities,
      this.actions,
      this.embedding,
      this.source,
      this.expertId,
    );
  }

  // Immutable metadata operations
  addTag(tag: Tag): Memory {
    this.ensureNotStored();
    return new Memory(
      this.content,
      this.status,
      this.createdAt,
      [...this.tags, tag],
      this.entities,
      this.actions,
      this.embedding,
      this.source,
      this.expertId,
    );
  }

  addEntity(entity: Entity): Memory {
    this.ensureNotStored();
    return new Memory(
      this.content,
      this.status,
      this.createdAt,
      this.tags,
      [...this.entities, entity],
      this.actions,
      this.embedding,
      this.source,
      this.expertId,
    );
  }

  addAction(action: Action): Memory {
    this.ensureNotStored();
    return new Memory(
      this.content,
      this.status,
      this.createdAt,
      this.tags,
      this.entities,
      [...this.actions, action],
      this.embedding,
      this.source,
      this.expertId,
    );
  }

  setEmbedding(embedding: Embedding): Memory {
    this.ensureNotStored();
    return new Memory(
      this.content,
      this.status,
      this.createdAt,
      this.tags,
      this.entities,
      this.actions,
      embedding,
      this.source,
      this.expertId,
    );
  }

  setSource(source: Source): Memory {
    this.ensureNotStored();
    return new Memory(
      this.content,
      this.status,
      this.createdAt,
      this.tags,
      this.entities,
      this.actions,
      this.embedding,
      source,
      this.expertId,
    );
  }

  private ensureNotStored(): void {
    if (this.status === MemoryStatus.STORED) {
      throw new Error("Cannot modify stored memory");
    }
  }

  // Getters
  getTags(): Tag[] {
    return [...this.tags]; // defensive copy
  }

  getEntities(): Entity[] {
    return [...this.entities]; // defensive copy
  }

  getActions(): Action[] {
    return [...this.actions]; // defensive copy
  }

  getEmbedding(): Embedding | undefined {
    return this.embedding;
  }

  getSource(): Source | undefined {
    return this.source;
  }
}
