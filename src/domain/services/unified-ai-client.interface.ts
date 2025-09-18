import { Embedding } from "@/domain/entities/embedding.ts";
import { Entity } from "@/domain/entities/entity.ts";
import { Action } from "@/domain/entities/action.ts";
import { Memory } from "@/domain/entities/memory.ts";

/**
 * Classification result for memory categorization
 */
export interface MemoryClassification {
  category: "factual" | "procedural" | "episodic" | "semantic";
  confidence: number;
  reasoning?: string;
}

/**
 * Expert routing decision for Memory of Experts system
 */
export interface ExpertRoute {
  expertId: string;
  expertName: string;
  confidence: number;
  reasoning: string;
  fallbackExperts?: string[];
}

/**
 * Reflection generation options
 */
export interface ReflectionOptions {
  /** Focus area for the reflection */
  focus?: "patterns" | "insights" | "connections" | "growth";
  /** Maximum length of generated reflection */
  maxLength?: number;
  /** Include specific time period */
  timeframe?: {
    start: Date;
    end: Date;
  };
}

/**
 * Unified AI client interface for all deno-pond AI operations
 *
 * This interface abstracts all AI operations behind a single, clean API
 * that can be implemented with different backends (Ollama, OpenAI, etc.)
 *
 * Design Philosophy:
 * - Privacy-first: Local inference by default
 * - Extensible: Easy to add new AI capabilities
 * - Type-safe: Full TypeScript support
 * - Observable: Rich logging and metrics
 * - Testable: Easy to mock and test
 */
export interface IUnifiedAIClient {
  // ===== PHASE 1: EMBEDDINGS =====

  /**
   * Generate an embedding for the given text
   */
  generateEmbedding(text: string): Promise<Embedding>;

  // ===== PHASE 2: NLP PIPELINE =====

  /**
   * Extract named entities from text
   */
  extractEntities(text: string): Promise<Entity[]>;

  /**
   * Extract action verbs and intentions from text
   */
  extractActions(text: string): Promise<Action[]>;

  /**
   * Extract tags/keywords from text
   */
  extractTags(text: string): Promise<string[]>;

  // ===== PHASE 3: MEMORY OF EXPERTS =====

  /**
   * Classify a memory into categories for routing
   */
  classifyMemory(memory: Memory): Promise<MemoryClassification>;

  /**
   * Route a query to the most appropriate expert
   */
  routeToExpert(query: string, availableExperts: string[]): Promise<ExpertRoute>;

  /**
   * Generate a summary of related memories
   */
  summarizeMemories(memories: Memory[]): Promise<string>;

  // ===== PHASE 4: ADVANCED FEATURES =====

  /**
   * Generate reflections and insights from a collection of memories
   */
  generateReflection(memories: Memory[], options?: ReflectionOptions): Promise<string>;

  /**
   * Perform deep analysis connecting disparate memories
   */
  deepDiveAnalysis(
    centralMemory: Memory,
    relatedMemories: Memory[]
  ): Promise<{
    connections: string[];
    insights: string[];
    questions: string[];
  }>;

  /**
   * Generate pond metaphor descriptions for memory visualization
   */
  generatePondMetaphor(memories: Memory[]): Promise<{
    description: string;
    ripples: string[];
    depth: "shallow" | "deep" | "profound";
  }>;

  // ===== HEALTH & CONFIGURATION =====

  /**
   * Check if the AI client is healthy and available
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get current configuration and capabilities
   */
  getCapabilities(): Promise<{
    embeddings: boolean;
    nlp: boolean;
    classification: boolean;
    reflection: boolean;
    models: string[];
  }>;
}