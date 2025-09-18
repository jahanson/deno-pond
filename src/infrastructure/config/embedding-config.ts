import { getLogger } from "@logtape/logtape";

const logger = getLogger("deno-pond.embedding-config");

/**
 * Available embedding models with their specifications
 */
export const EMBEDDING_MODELS = {
  "nomic-embed-text": {
    dimensions: 768,
    description: "High-performing open embedding model with large token context",
    recommended: true,
    contextLength: 8192,
    requiresPrefix: true,
  },
  "mxbai-embed-large": {
    dimensions: 1024,
    description: "State-of-the-art large embedding from mixedbread.ai",
    recommended: false,
    contextLength: 512,
    requiresPrefix: false,
  },
  "all-minilm": {
    dimensions: 384,
    description: "Lightweight sentence embedding model",
    recommended: false,
    contextLength: 256,
    requiresPrefix: false,
  },
  "bge-large": {
    dimensions: 1024,
    description: "Large embedding model from BAAI",
    recommended: false,
    contextLength: 512,
    requiresPrefix: false,
  },
  "snowflake-arctic-embed": {
    dimensions: 768,
    description: "Optimized embedding model from Snowflake",
    recommended: false,
    contextLength: 2048,
    requiresPrefix: false,
  }
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
  /** Ollama base URL */
  baseUrl: string;
  /** Default embedding model */
  defaultModel: EmbeddingModelName;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Maximum retries for failed requests */
  maxRetries: number;
}

/**
 * Get embedding service configuration from environment variables
 */
export function getEmbeddingConfig(): EmbeddingServiceConfig {
  const baseUrl = Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434";
  const defaultModel = (Deno.env.get("OLLAMA_EMBEDDING_MODEL") || "nomic-embed-text") as EmbeddingModelName;
  const timeoutMs = Number(Deno.env.get("OLLAMA_TIMEOUT_MS")) || 30000;
  const maxRetries = Number(Deno.env.get("OLLAMA_MAX_RETRIES")) || 3;

  // Validate model
  if (!(defaultModel in EMBEDDING_MODELS)) {
    logger.warn(
      `⚠️ Unknown embedding model: ${defaultModel}, falling back to nomic-embed-text`,
      {
        availableModels: Object.keys(EMBEDDING_MODELS),
        configuredModel: defaultModel
      }
    );
  }

  const config: EmbeddingServiceConfig = {
    baseUrl,
    defaultModel: defaultModel in EMBEDDING_MODELS ? defaultModel : "nomic-embed-text",
    timeoutMs,
    maxRetries,
  };

  logger.info(
    `🎯 Embedding service configuration loaded`,
    {
      baseUrl: config.baseUrl,
      model: config.defaultModel,
      dimensions: EMBEDDING_MODELS[config.defaultModel].dimensions,
      timeout: `${config.timeoutMs}ms`,
      maxRetries: config.maxRetries
    }
  );

  return config;
}

/**
 * Get model specifications for a given model name
 */
export function getModelSpecs(modelName: EmbeddingModelName) {
  return EMBEDDING_MODELS[modelName];
}