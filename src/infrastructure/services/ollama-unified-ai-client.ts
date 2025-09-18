import { getLogger } from "@logtape/logtape";
import {
  IUnifiedAIClient,
  MemoryClassification,
  ExpertRoute,
  ReflectionOptions
} from "@/domain/services/unified-ai-client.interface.ts";
import { OllamaEmbeddingService } from "./ollama-embedding-service.ts";
import { Embedding } from "@/domain/entities/embedding.ts";
import { Entity } from "@/domain/entities/entity.ts";
import { Action } from "@/domain/entities/action.ts";
import { Memory } from "@/domain/entities/memory.ts";
import { getEmbeddingConfig } from "@/infrastructure/config/embedding-config.ts";

const logger = getLogger("deno-pond.unified-ai-client");

/**
 * Configuration for the unified AI client
 */
export interface OllamaUnifiedAIClientConfig {
  /** Base URL for Ollama API */
  baseUrl: string;
  /** Model for embedding generation */
  embeddingModel: string;
  /** Model for NLP tasks (entity extraction, classification, etc.) */
  nlpModel: string;
  /** Model for advanced reasoning (reflections, analysis) */
  reasoningModel: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Ollama-based implementation of the unified AI client
 *
 * This is OUR implementation - built exactly for deno-pond's needs!
 * Privacy-first, local inference, beautiful logging, and rock solid.
 */
export class OllamaUnifiedAIClient implements IUnifiedAIClient {
  private readonly config: OllamaUnifiedAIClientConfig;
  private readonly embeddingService: OllamaEmbeddingService;

  constructor(config?: Partial<OllamaUnifiedAIClientConfig>) {
    // Smart defaults based on our embedding config
    const embeddingConfig = getEmbeddingConfig();

    this.config = {
      baseUrl: embeddingConfig.baseUrl,
      embeddingModel: embeddingConfig.defaultModel,
      nlpModel: "qwen3:4b-q4_K_M", // Good for structured NLP tasks, instruct mode
      reasoningModel: "qwen3:4b", // Good for complex reasoning
      timeoutMs: embeddingConfig.timeoutMs,
      ...config
    };

    this.embeddingService = new OllamaEmbeddingService({
      baseUrl: this.config.baseUrl,
      defaultModel: this.config.embeddingModel,
      timeoutMs: this.config.timeoutMs,
      maxRetries: 3
    });

    logger.info(
      `🤖 Unified AI client initialized`,
      {
        baseUrl: this.config.baseUrl,
        embeddingModel: this.config.embeddingModel,
        nlpModel: this.config.nlpModel,
        reasoningModel: this.config.reasoningModel
      }
    );
  }

  // ===== PHASE 1: EMBEDDINGS =====

  async generateEmbedding(text: string): Promise<Embedding> {
    logger.debug(`🎯 Generating embedding via unified client`);
    return await this.embeddingService.generateEmbedding(text);
  }

  // ===== PHASE 2: NLP PIPELINE =====

  async extractEntities(text: string): Promise<Entity[]> {
    logger.info(`🏷️ Extracting entities from text`, { textLength: text.length });

    const prompt = `Extract named entities from the following text. Return ONLY a JSON array of objects with "text" and "type" fields.

Entity types: PERSON, ORGANIZATION, LOCATION, TECHNOLOGY, CONCEPT, DATE, PRODUCT

Text: "${text}"

Response format: [{"text": "entity name", "type": "ENTITY_TYPE"}]`;

    try {
      const response = await this.callOllama(this.config.nlpModel, prompt);
      const entities = this.parseJsonResponse(response) as Array<{text: string, type: string}>;

      const result = entities.map(e => new Entity(e.text, e.type));

      logger.info(`✅ Extracted ${result.length} entities`);
      return result;
    } catch (error) {
      logger.error(`❌ Entity extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return []; // Graceful degradation
    }
  }

  async extractActions(text: string): Promise<Action[]> {
    logger.info(`⚡ Extracting actions from text`, { textLength: text.length });

    const prompt = `Extract action verbs and intentions from the following text. Return ONLY a JSON array of strings representing actions.

Focus on: verbs, intentions, processes, tasks, operations

Text: "${text}"

Response format: ["action1", "action2", "action3"]`;

    try {
      const response = await this.callOllama(this.config.nlpModel, prompt);
      const actionStrings = this.parseJsonResponse(response) as string[];

      const result = actionStrings.map(action => new Action(action));

      logger.info(`✅ Extracted ${result.length} actions`);
      return result;
    } catch (error) {
      logger.error(`❌ Action extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return []; // Graceful degradation
    }
  }

  async extractTags(text: string): Promise<string[]> {
    logger.info(`🏷️ Extracting tags from text`, { textLength: text.length });

    const prompt = `Extract relevant tags/keywords from the following text. Return ONLY a JSON array of strings.

Focus on: key concepts, topics, themes, categories, technologies mentioned

Text: "${text}"

Response format: ["tag1", "tag2", "tag3"]`;

    try {
      const response = await this.callOllama(this.config.nlpModel, prompt);
      const tags = this.parseJsonResponse(response) as string[];

      logger.info(`✅ Extracted ${tags.length} tags`);
      return tags;
    } catch (error) {
      logger.error(`❌ Tag extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return []; // Graceful degradation
    }
  }

  // ===== PHASE 3: MEMORY OF EXPERTS (Stubs for now) =====

  async classifyMemory(memory: Memory): Promise<MemoryClassification> {
    logger.info(`🧠 Classifying memory`);

    // TODO: Implement with reasoning model
    return {
      category: "semantic",
      confidence: 0.8,
      reasoning: "Not yet implemented - placeholder classification"
    };
  }

  async routeToExpert(query: string, availableExperts: string[]): Promise<ExpertRoute> {
    logger.info(`🧭 Routing query to expert`, { queryLength: query.length, expertsAvailable: availableExperts.length });

    // TODO: Implement with reasoning model
    return {
      expertId: availableExperts[0] || "general",
      expertName: "General Assistant",
      confidence: 0.7,
      reasoning: "Not yet implemented - placeholder routing"
    };
  }

  async summarizeMemories(memories: Memory[]): Promise<string> {
    logger.info(`📝 Summarizing memories`, { memoryCount: memories.length });

    // TODO: Implement with reasoning model
    return `Summary of ${memories.length} memories (not yet implemented)`;
  }

  // ===== PHASE 4: ADVANCED FEATURES (Stubs for now) =====

  async generateReflection(memories: Memory[], options?: ReflectionOptions): Promise<string> {
    logger.info(`🔮 Generating reflection`, { memoryCount: memories.length, focus: options?.focus });

    // TODO: Implement with reasoning model
    return `Reflection on ${memories.length} memories (not yet implemented)`;
  }

  async deepDiveAnalysis(centralMemory: Memory, relatedMemories: Memory[]) {
    logger.info(`🕳️ Performing deep dive analysis`, { relatedCount: relatedMemories.length });

    // TODO: Implement with reasoning model
    return {
      connections: ["Not yet implemented"],
      insights: ["Placeholder insight"],
      questions: ["What patterns emerge?"]
    };
  }

  async generatePondMetaphor(memories: Memory[]) {
    logger.info(`🏞️ Generating pond metaphor`, { memoryCount: memories.length });

    // TODO: Implement with reasoning model
    return {
      description: "A serene pond reflecting the mind's memories",
      ripples: ["Gentle waves of thought"],
      depth: "deep" as const
    };
  }

  // ===== HEALTH & CONFIGURATION =====

  async isHealthy(): Promise<boolean> {
    logger.debug(`🔍 Checking unified client health`);

    try {
      // Check if embedding service is healthy
      const embeddingHealthy = await this.embeddingService.isHealthy();

      // Check if we can reach Ollama for other models
      const ollamaHealthy = await this.checkOllamaHealth();

      const healthy = embeddingHealthy && ollamaHealthy;

      logger.debug(`Health check result: ${healthy ? "✅ Healthy" : "❌ Unhealthy"}`);
      return healthy;
    } catch (error) {
      logger.warn(`⚠️ Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async getCapabilities() {
    return {
      embeddings: true,
      nlp: true,
      classification: false, // Phase 3 not implemented yet
      reflection: false, // Phase 4 not implemented yet
      models: [this.config.embeddingModel, this.config.nlpModel, this.config.reasoningModel]
    };
  }

  // ===== PRIVATE HELPERS =====

  private async callOllama(model: string, prompt: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for more consistent outputs
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    return data.response;
  }

  private parseJsonResponse(response: string): unknown {
    try {
      // Try to extract JSON from response (sometimes models include extra text)
      const jsonMatch = response.match(/\[[\s\S]*?\]|\{[\s\S]*?\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: try parsing the whole response
      return JSON.parse(response);
    } catch (error) {
      logger.warn(`⚠️ Failed to parse JSON response, returning empty array`, { response: response.slice(0, 100) });
      return [];
    }
  }

  private async checkOllamaHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}