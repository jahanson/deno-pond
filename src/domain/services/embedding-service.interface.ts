import { Embedding } from "@/domain/entities/embedding.ts";

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  model: string;
  dimensions?: number;
}

/**
 * Service interface for generating text embeddings
 */
export interface IEmbeddingService {
  /**
   * Generate an embedding for the given text
   * @param text The text to embed
   * @param config Optional configuration to override defaults
   * @returns Promise resolving to an Embedding entity
   */
  generateEmbedding(text: string, config?: Partial<EmbeddingConfig>): Promise<Embedding>;

  /**
   * Get the default configuration for this service
   */
  getDefaultConfig(): EmbeddingConfig;

  /**
   * Check if the service is available/healthy
   */
  isHealthy(): Promise<boolean>;
}