import { getLogger } from "@logtape/logtape";
import { Embedding } from "@/domain/entities/embedding.ts";
import {
  IEmbeddingService,
  EmbeddingConfig
} from "@/domain/services/embedding-service.interface.ts";
import {
  getEmbeddingConfig,
  getModelSpecs,
  type EmbeddingModelName
} from "@/infrastructure/config/embedding-config.ts";

const logger = getLogger("deno-pond.ollama-embedding");

/**
 * Ollama API response for embedding generation
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Ollama embedding service implementation
 */
export class OllamaEmbeddingService implements IEmbeddingService {
  private readonly config: ReturnType<typeof getEmbeddingConfig>;

  constructor(config?: Partial<ReturnType<typeof getEmbeddingConfig>>) {
    this.config = { ...getEmbeddingConfig(), ...config };
  }

  async generateEmbedding(
    text: string,
    config?: Partial<EmbeddingConfig>
  ): Promise<Embedding> {
    const modelName = (config?.model || this.config.defaultModel) as EmbeddingModelName;
    const modelSpecs = getModelSpecs(modelName);

    // Add task prefix for models that require it (like nomic-embed-text)
    const prompt = modelSpecs.requiresPrefix
      ? `search_document: ${text}`
      : text;

    logger.info(
      `🎯 Generating embedding with Ollama`,
      {
        model: modelName,
        textLength: text.length,
        promptLength: prompt.length,
        dimensions: modelSpecs.dimensions,
        endpoint: this.config.baseUrl,
        requiresPrefix: modelSpecs.requiresPrefix
      }
    );

    try {
      const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (${response.status}): ${errorText}`
        );
      }

      const data: OllamaEmbeddingResponse = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error("Invalid embedding response from Ollama");
      }

      logger.info(
        `✅ Generated embedding successfully`,
        {
          dimensions: data.embedding.length,
          model: modelName,
          expectedDimensions: modelSpecs.dimensions
        }
      );

      return new Embedding(data.embedding, modelName);

    } catch (error) {
      logger.error(
        `❌ Failed to generate embedding`,
        {
          error: error instanceof Error ? error.message : String(error),
          model: modelName,
          textLength: text.length,
          promptLength: prompt.length
        }
      );
      throw error;
    }
  }

  getDefaultConfig(): EmbeddingConfig {
    return {
      model: this.config.defaultModel,
      dimensions: getModelSpecs(this.config.defaultModel).dimensions,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: "GET",
      });

      const healthy = response.ok;

      logger.debug(
        `🔍 Ollama health check`,
        {
          healthy,
          status: response.status,
          endpoint: this.config.baseUrl
        }
      );

      return healthy;
    } catch (error) {
      logger.warn(
        `⚠️ Ollama health check failed`,
        {
          error: error instanceof Error ? error.message : String(error),
          endpoint: this.config.baseUrl
        }
      );
      return false;
    }
  }
}