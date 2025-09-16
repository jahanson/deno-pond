import { assertEquals, assertThrows } from "@std/assert";
import { Memory } from "./memory.ts";
import { ValidationError } from "@/domain/shared/errors.ts";
import { MemoryStatus, SourceType } from "@/domain/shared/types.ts";
import { Entity } from "./entity.ts";
import { Action } from "./action.ts";
import { Tag } from "./tag.ts";
import { Embedding } from "./embedding.ts";
import { Source } from "./source.ts";

// Content Validation Business Rules
Deno.test("Memory - should reject empty content", () => {
  assertThrows(
    () => new Memory(""),
    ValidationError,
    "Content cannot be empty",
  );
});

Deno.test("Memory - should reject whitespace-only content", () => {
  assertThrows(
    () => new Memory("   \n\t  "),
    ValidationError,
    "Content cannot be empty",
  );
});

Deno.test("Memory - should reject content exceeding 7500 characters", () => {
  const longContent = "a".repeat(7501);
  assertThrows(
    () => new Memory(longContent),
    ValidationError,
    "Content exceeds maximum length",
  );
});

Deno.test("Memory - should accept valid content", () => {
  const memory = new Memory("This is valid content.");
  assertEquals(memory.content, "This is valid content.");
  assertEquals(memory.status, MemoryStatus.DRAFT);
});

// Memory State Transition Rules
Deno.test("Memory - should start in DRAFT status", () => {
  const memory = new Memory("test content");
  assertEquals(memory.status, MemoryStatus.DRAFT);
});

Deno.test("Memory - should transition from DRAFT to STORED", () => {
  const memory = new Memory("test content");
  const storedMemory = memory.markAsStored();

  assertEquals(storedMemory.status, MemoryStatus.STORED);
  assertEquals(storedMemory.content, "test content"); // immutable
});

Deno.test("Memory - should prevent modification after being stored", () => {
  const memory = new Memory("test content")
    .markAsStored();

  assertThrows(
    () => memory.addTag(new Tag("typescript")),
    Error,
    "Cannot modify stored memory",
  );
});

// Metadata Management Business Rules
Deno.test("Memory - should manage tags immutably", () => {
  const memory = new Memory("test content");
  const tag = new Tag("typescript");
  const updatedMemory = memory.addTag(tag);

  // Original memory unchanged
  assertEquals(memory.getTags().length, 0);
  // New memory has tag
  assertEquals(updatedMemory.getTags().length, 1);
  assertEquals(updatedMemory.getTags()[0].normalized, "typescript");
});

Deno.test("Memory - should manage entities immutably", () => {
  const memory = new Memory("Joseph likes TypeScript");
  const entity = new Entity("Joseph", "PERSON");
  const updatedMemory = memory.addEntity(entity);

  assertEquals(memory.getEntities().length, 0);
  assertEquals(updatedMemory.getEntities().length, 1);
  assertEquals(updatedMemory.getEntities()[0].text, "Joseph");
});

Deno.test("Memory - should manage actions immutably", () => {
  const memory = new Memory("Joseph implemented the feature");
  const action = new Action("implement");
  const updatedMemory = memory.addAction(action);

  assertEquals(memory.getActions().length, 0);
  assertEquals(updatedMemory.getActions().length, 1);
  assertEquals(updatedMemory.getActions()[0].action, "implement");
});

// Memory Identification Business Rules
Deno.test("Memory - should generate stable content hash for deduplication", () => {
  const memory1 = new Memory("Same content");
  const memory2 = new Memory("Same content");
  const memory3 = new Memory("Different content");

  assertEquals(memory1.contentHash, memory2.contentHash);
  assertEquals(memory1.contentHash !== memory3.contentHash, true);
});

Deno.test("Memory - should maintain creation timestamp immutably", () => {
  const beforeTime = new Date();
  const memory = new Memory("test content");
  const afterTime = new Date();

  // Creation time should be between before and after
  assertEquals(memory.createdAt >= beforeTime, true);
  assertEquals(memory.createdAt <= afterTime, true);

  // Should not change when adding metadata
  const updatedMemory = memory.addTag(new Tag("test"));
  assertEquals(updatedMemory.createdAt, memory.createdAt);
});

// Slugify functionality tests
Deno.test("Action - should slugify consistently", () => {
  const action1 = new Action("IMPLEMENTED");
  const action2 = new Action("  Implemented  ");
  const action3 = new Action("implemented");

  assertEquals(action1.slug, "implemented");
  assertEquals(action2.slug, "implemented");
  assertEquals(action3.slug, "implemented");
});

Deno.test("Action - should handle complex action names", () => {
  const action = new Action("ANALYZED & TESTED");
  assertEquals(action.slug, "analyzed-tested");
});

Deno.test("Tag - should slugify with hyphens", () => {
  const tag1 = new Tag("Memory Entity");
  const tag2 = new Tag("DENO-POND");
  const tag3 = new Tag("  TypeScript   Patterns  ");

  assertEquals(tag1.slug, "memory-entity");
  assertEquals(tag2.slug, "deno-pond");
  assertEquals(tag3.slug, "typescript-patterns");
});

Deno.test("Tag - should handle special characters in slugify", () => {
  const tag = new Tag("Domain-Driven Design (DDD)!");
  assertEquals(tag.slug, "domain-driven-design-ddd");
});

// Embedding Management Business Rules
Deno.test("Memory - should manage embedding immutably", () => {
  const memory = new Memory("test content");
  const embedding = new Embedding(new Array(512).fill(0.5), "test-model");
  const updatedMemory = memory.setEmbedding(embedding);

  // Original memory unchanged
  assertEquals(memory.getEmbedding(), undefined);
  // New memory has embedding
  assertEquals(updatedMemory.getEmbedding()?.model, "test-model");
  assertEquals(updatedMemory.getEmbedding()?.dimensions, 512);
});

Deno.test("Memory - should prevent embedding modification after being stored", () => {
  const memory = new Memory("test content").markAsStored();
  const embedding = new Embedding(new Array(512).fill(0.5));

  assertThrows(
    () => memory.setEmbedding(embedding),
    Error,
    "Cannot modify stored memory",
  );
});

// Source Management Business Rules
Deno.test("Memory - should manage source immutably", () => {
  const memory = new Memory("test content");
  const source = new Source(SourceType.CLAUDE_CODE, "session-123");
  const updatedMemory = memory.setSource(source);

  // Original memory unchanged
  assertEquals(memory.getSource(), undefined);
  // New memory has source
  assertEquals(updatedMemory.getSource()?.type, SourceType.CLAUDE_CODE);
  assertEquals(updatedMemory.getSource()?.context, "session-123");
});

Deno.test("Memory - should prevent source modification after being stored", () => {
  const memory = new Memory("test content").markAsStored();
  const source = new Source(SourceType.MANUAL, "user input");

  assertThrows(
    () => memory.setSource(source),
    Error,
    "Cannot modify stored memory",
  );
});

// Complete Memory Integration
Deno.test("Memory - should maintain embedding and source through state transitions", () => {
  const embedding = new Embedding(new Array(768).fill(0.3), "nomic-embed-text");
  const source = new Source(SourceType.CLAUDE_CODE, "conversation-456");

  const memory = new Memory("Joseph and Omega built semantic memory")
    .setEmbedding(embedding)
    .setSource(source);

  const storedMemory = memory.markAsStored();

  // Should preserve embedding and source through state transition
  assertEquals(storedMemory.getEmbedding()?.model, "nomic-embed-text");
  assertEquals(storedMemory.getSource()?.type, SourceType.CLAUDE_CODE);
  assertEquals(storedMemory.status, MemoryStatus.STORED);
});
