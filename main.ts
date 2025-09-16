import { Memory } from "./src/domain/entities/memory.ts";
import { Action } from "./src/domain/entities/action.ts";
import { Tag } from "./src/domain/entities/tag.ts";
import { Entity } from "./src/domain/entities/entity.ts";

// Basic verification that our domain entities work correctly
console.log("🌊 Pond Domain Entities Verification");

// Test Memory creation
const memory = new Memory(
  "Joseph and Omega are building a semantic memory system in Deno",
);
console.log("✅ Memory created:", memory.content.slice(0, 50) + "...");

// Test adding metadata
const withTag = memory.addTag(new Tag("deno-pond"));
const withEntity = withTag.addEntity(new Entity("Joseph", "PERSON"));
const withAction = withEntity.addAction(new Action("building"));

console.log("✅ Tags:", withAction.getTags().map((t) => t.slug));
console.log("✅ Entities:", withAction.getEntities().map((e) => e.text));
console.log("✅ Actions:", withAction.getActions().map((a) => a.slug));

// Test state transition
const stored = withAction.markAsStored();
console.log("✅ Memory status:", stored.status);

console.log("\n🎉 All domain entities working correctly!");
